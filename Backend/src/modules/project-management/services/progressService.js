'use strict';

/**
 * Progress computed on fetch — never stored (PRD §5.4)
 * Task Complete=100, else 0. Activity=avg tasks. Phase=avg activities. Project=avg phases.
 *
 * NOTE 1: this used to check task.status='Done', which stopped matching
 * anything the moment the task status vocabulary was migrated to
 * ('To Do','Ongoing','Complete','Blocked') — every progress figure had
 * silently been 0% since then. Fixed below.
 *
 * NOTE 2: getPhaseProgress/getProjectProgress used to flat-pool every
 * grandchild task/activity directly in one query, instead of averaging
 * each immediate child's OWN already-computed progress. That's a
 * different number whenever children have unequal task counts — worse,
 * an Activity with zero tasks yet was silently excluded from the pool
 * entirely (an empty JOIN contributes nothing) rather than counting as
 * 0%, so a Phase could read 100% complete while one of its two
 * Activities sat at 0%. Fixed below: each level now genuinely averages
 * its immediate children's progress, recursing one level at a time, and
 * a child with nothing under it yet counts as 0%, not "not counted".
 */
const { getPool, sql } = require('../../../config/db');

async function getActivityProgress(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT ROUND(AVG(CASE WHEN status='Complete' THEN 100.0 ELSE 0 END), 0) AS progress
      FROM pm_tasks WHERE activity_id=@activityId AND is_deleted=0
    `);
  return parseInt(result.recordset[0]?.progress || 0, 10);
}

async function getPhaseProgress(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT activity_id AS activityId FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);
  const activities = result.recordset;
  if (!activities.length) return 0;
  let sum = 0;
  for (const a of activities) sum += await getActivityProgress(a.activityId);
  return Math.round(sum / activities.length);
}

async function getProjectProgress(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT phase_id AS phaseId FROM pm_phases WHERE project_id=@projectId AND is_deleted=0`);
  const phases = result.recordset;
  if (!phases.length) return 0;
  let sum = 0;
  for (const ph of phases) sum += await getPhaseProgress(ph.phaseId);
  return Math.round(sum / phases.length);
}

/**
 * deriveStatus — Phase and Activity status is no longer something a person
 * sets by hand. It's always one of:
 *   'Blocked'     — an unresolved dependency put it there (dependencyService
 *                   owns this; it's a system state, not a user choice, so
 *                   it's preserved as-is rather than recomputed here)
 *   'To Do'       — 0% of child tasks complete
 *   'In Progress' — some but not all child tasks complete
 *   'Completed'   — 100% of child tasks complete
 *
 * `persistedStatus` is whatever's currently in the status column — the only
 * thing we actually need from it is whether dependencyService has it
 * marked 'Blocked' right now; everything else about that column is now
 * stale the moment this function runs, since nothing sets it manually
 * anymore. An empty parent (no child tasks yet at all) reads as 'To Do'
 * (progress will be 0 in that case too, so this is automatic).
 */
function deriveStatus(progress, persistedStatus) {
  if (persistedStatus === 'Blocked') return 'Blocked';
  if (progress >= 100) return 'Completed';
  if (progress <= 0) return 'To Do';
  return 'In Progress';
}

module.exports = { getProjectProgress, getPhaseProgress, getActivityProgress, deriveStatus };