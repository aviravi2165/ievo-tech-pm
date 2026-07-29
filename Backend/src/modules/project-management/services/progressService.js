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

// PERF: these were sequential `for...await` loops — each activity/phase
// queried one at a time, so a project with N activities took N round-trips
// back-to-back instead of running concurrently. Order doesn't matter for a
// sum/average, so Promise.all-ing the same per-child calls is a pure
// concurrency win with no change in the actual math. This was the biggest
// single contributor to slow project-list loads (see listProjects below,
// which calls this once per project — a list of P projects with this
// still sequential would still serialize across projects, but each
// project's OWN internal fan-out is now concurrent instead of chained).
async function getPhaseProgress(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT activity_id AS activityId FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);
  const activities = result.recordset;
  if (!activities.length) return 0;
  const scores = await Promise.all(activities.map(a => getActivityProgress(a.activityId)));
  const sum = scores.reduce((s, v) => s + v, 0);
  return Math.round(sum / activities.length);
}

async function getProjectProgress(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT phase_id AS phaseId FROM pm_phases WHERE project_id=@projectId AND is_deleted=0`);
  const phases = result.recordset;
  if (!phases.length) return 0;
  const scores = await Promise.all(phases.map(ph => getPhaseProgress(ph.phaseId)));
  const sum = scores.reduce((s, v) => s + v, 0);
  return Math.round(sum / phases.length);
}

/**
 * "Has active work underneath" — deliberately separate from progress.
 * Progress only counts fully Complete tasks, so a Task merely marked
 * 'Ongoing' (0% complete) never moved progress off 0, and deriveStatus's
 * old `progress > 0` check kept every ancestor reading 'To Do' even while
 * someone was actively working a task under it. This walks the raw task
 * rows (leaf truth — pm_activities/pm_phases.status columns are never
 * written back except in the 100%-completion self-heal case, so they can't
 * be trusted here) and returns true the moment ANY task anywhere
 * underneath is 'Ongoing', so that signal can bump deriveStatus straight
 * to 'In Progress' even at 0% completion.
 */
async function getActivityHasActiveWork(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_tasks WHERE activity_id=@activityId AND status='Ongoing' AND is_deleted=0`);
  return (result.recordset[0]?.cnt || 0) > 0;
}

async function getPhaseHasActiveWork(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT activity_id AS activityId FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);
  const flags = await Promise.all(result.recordset.map(a => getActivityHasActiveWork(a.activityId)));
  return flags.some(Boolean);
}

async function getProjectHasActiveWork(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT phase_id AS phaseId FROM pm_phases WHERE project_id=@projectId AND is_deleted=0`);
  const flags = await Promise.all(result.recordset.map(ph => getPhaseHasActiveWork(ph.phaseId)));
  return flags.some(Boolean);
}

/**
 * deriveStatus — Phase and Activity status is no longer something a person
 * sets by hand. It's always one of:
 *   'Blocked'     — an unresolved dependency put it there (dependencyService
 *                   owns this; it's a system state, not a user choice, so
 *                   it's preserved as-is rather than recomputed here)
 *   'To Do'       — 0% of child tasks complete AND nothing underneath is
 *                   actively 'Ongoing' either
 *   'In Progress' — some child task complete, OR nothing complete yet but
 *                   something underneath is actively 'Ongoing'
 *   'Completed'   — 100% of child tasks complete
 *
 * `persistedStatus` is whatever's currently in the status column — the only
 * thing we actually need from it is whether dependencyService has it
 * marked 'Blocked' right now; everything else about that column is now
 * stale the moment this function runs, since nothing sets it manually
 * anymore. An empty parent (no child tasks yet at all) reads as 'To Do'
 * (progress will be 0 in that case too, so this is automatic).
 *
 * `hasActiveWork` (from getActivityHasActiveWork/getPhaseHasActiveWork) is
 * what makes a parent flip to 'In Progress' the moment ANY task underneath
 * it is marked 'Ongoing' — without it, a task going 'To Do' → 'Ongoing'
 * contributed nothing to progress (only 'Complete' does), so nothing above
 * it ever visibly reacted until the first task was fully finished.
 */
function deriveStatus(progress, persistedStatus, hasActiveWork = false) {
  if (persistedStatus === 'Blocked') return 'Blocked';
  if (progress >= 100) return 'Completed';
  if (progress <= 0 && !hasActiveWork) return 'To Do';
  return 'In Progress';
}

/**
 * deriveProjectStatus — Project uses a different vocabulary than Phase/
 * Activity (Planning/Active/On Hold/Completed/Cancelled, not To Do/In
 * Progress/Blocked), and unlike Phase/Activity it previously wasn't
 * derived at all — 'status' was whatever was set at creation (always
 * 'Planning' by default) and nothing ever moved it, so a project stayed
 * "Planning" forever even once every task underneath was actively being
 * worked. 'On Hold' and 'Cancelled' are deliberate manual states (a
 * manager choosing to pause/cancel) and are preserved as-is, same as
 * 'Blocked' is preserved for Phase/Activity — everything else is derived
 * from progress/hasActiveWork exactly like Phase/Activity.
 */
function deriveProjectStatus(progress, persistedStatus, hasActiveWork = false) {
  if (persistedStatus === 'On Hold' || persistedStatus === 'Cancelled') return persistedStatus;
  if (progress >= 100) return 'Completed';
  if (progress <= 0 && !hasActiveWork) return 'Planning';
  return 'Active';
}

/**
 * "Has any ACTIVE task at all underneath" — distinct from hasActiveWork
 * (only true for 'Ongoing' tasks) and from progress (reads 0% either way
 * for an empty shell or one where nothing's done yet, so it can't tell
 * those two apart). An Activity/Phase/Project with literally nothing
 * active under it isn't "behind schedule" just because its planned_end
 * passed — there's no work to actually be behind ON. isOverdue
 * (activityService/phaseService/projectService) is gated on this so an
 * empty container reads as "no tasks yet", not a false Overdue alarm.
 *
 * Filters on is_active=1, not just is_deleted=0 — a deactivated
 * ("deleted") task/activity/phase still has a live row, so counting it
 * here read as "there's real work here" when there isn't: the exact same
 * staleness bug fixed on the frontend's Assignees tile (ActivityRow.js/
 * PhasePanel.js counted deactivated tasks as active assignees), just one
 * layer up — a container whose only children are all deactivated should
 * read as empty, same as one with zero children at all.
 */
async function getActivityHasTasks(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_tasks WHERE activity_id=@activityId AND is_deleted=0 AND is_active=1`);
  return (result.recordset[0]?.cnt || 0) > 0;
}

async function getPhaseHasTasks(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT activity_id AS activityId FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0 AND is_active=1`);
  if (!result.recordset.length) return false;
  const flags = await Promise.all(result.recordset.map(a => getActivityHasTasks(a.activityId)));
  return flags.some(Boolean);
}

async function getProjectHasTasks(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT phase_id AS phaseId FROM pm_phases WHERE project_id=@projectId AND is_deleted=0 AND is_active=1`);
  if (!result.recordset.length) return false;
  const flags = await Promise.all(result.recordset.map(ph => getPhaseHasTasks(ph.phaseId)));
  return flags.some(Boolean);
}

// Immediate ACTIVE-child counts — used to tell "nothing active added under
// this yet at all" (no activities / no phases) apart from "has active
// activities/phases, but none of THEM have any active tasks yet" (see
// phaseService/projectService's emptyState, which picks the wording based
// on which of these is true). Same is_active=1 reasoning as the
// hasTasks family above — a Phase whose only Activity was deactivated
// should read "No activities yet", not silently stay "empty" forever
// because a dead row is still technically there.
async function getPhaseActivityCount(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0 AND is_active=1`);
  return result.recordset[0]?.cnt || 0;
}

async function getProjectPhaseCount(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT COUNT(*) AS cnt FROM pm_phases WHERE project_id=@projectId AND is_deleted=0 AND is_active=1`);
  return result.recordset[0]?.cnt || 0;
}

module.exports = {
  getProjectProgress, getPhaseProgress, getActivityProgress, deriveStatus, deriveProjectStatus,
  getPhaseActivityCount, getProjectPhaseCount,
  getActivityHasActiveWork, getPhaseHasActiveWork, getProjectHasActiveWork,
  getActivityHasTasks, getPhaseHasTasks, getProjectHasTasks,
};