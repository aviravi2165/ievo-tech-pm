'use strict';

/**
 * Progress computed on fetch — never stored (PRD §5.4)
 * Task Complete=100, else 0. Activity=avg tasks. Phase=avg activities. Project=avg phases.
 *
 * NOTE: this used to check task.status='Done', which stopped matching
 * anything the moment the task status vocabulary was migrated to
 * ('To Do','Ongoing','Complete','Blocked') — every progress figure has
 * silently been 0% since then. Fixed below.
 */
const { getPool, sql } = require('../../../config/db');

async function getProjectProgress(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT ROUND(AVG(phase_progress), 0) AS progress FROM (
        SELECT ph.phase_id,
          COALESCE((
            SELECT AVG(CASE WHEN t.status='Complete' THEN 100.0 ELSE 0 END)
            FROM pm_tasks t INNER JOIN pm_activities a ON a.activity_id=t.activity_id
            WHERE a.phase_id=ph.phase_id AND t.is_deleted=0 AND a.is_deleted=0
          ), 0) AS phase_progress
        FROM pm_phases ph WHERE ph.project_id=@projectId AND ph.is_deleted=0
      ) sub
    `);
  return parseInt(result.recordset[0]?.progress || 0, 10);
}

async function getPhaseProgress(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`
      SELECT ROUND(AVG(CASE WHEN t.status='Complete' THEN 100.0 ELSE 0 END), 0) AS progress
      FROM pm_tasks t INNER JOIN pm_activities a ON a.activity_id=t.activity_id
      WHERE a.phase_id=@phaseId AND t.is_deleted=0 AND a.is_deleted=0
    `);
  return parseInt(result.recordset[0]?.progress || 0, 10);
}

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