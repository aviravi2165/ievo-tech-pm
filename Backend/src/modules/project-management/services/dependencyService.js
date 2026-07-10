'use strict';

/**
 * Shared dependency resolution — identical logic at phase/activity/task levels.
 * Each function accepts `reqFactory`: a () => sql.Request producer, either
 * `() => pool.request()` (no transaction) or the `req` factory handed to the
 * callback of withTransaction (so all queries share one transaction).
 * Returns array of newly unblocked entity IDs for socket broadcast.
 */
const { getPool, sql } = require('../../../config/db');
const { getActivityProgress, getPhaseProgress } = require('./progressService');

const CFG = {
  phase:    { depTable: 'pm_phase_deps',    entityTable: 'pm_phases',     idCol: 'phase_id',    depCol: 'depends_on_phase_id',    done: 'Completed' },
  activity: { depTable: 'pm_activity_deps', entityTable: 'pm_activities', idCol: 'activity_id', depCol: 'depends_on_activity_id', done: 'Completed' },
  task:     { depTable: 'pm_task_deps',     entityTable: 'pm_tasks',      idCol: 'task_id',     depCol: 'depends_on_task_id',     done: 'Complete'  },
  // No dependency graph at project level — only entityTable/idCol are used,
  // exclusively by isInactive() below.
  project:  { entityTable: 'pm_projects',   idCol: 'project_id' },
};

// Whether a given dependency entity actually counts as "done". For tasks
// this is a direct, reliably-persisted status column check. For
// Phase/Activity it CANNOT be — pm_phases.status/pm_activities.status are
// never written as 'Completed' anywhere (that value only ever exists in
// the in-memory result of deriveStatus, computed fresh on every read from
// child progress). Checking the raw column here — as this used to do —
// meant a Phase/Activity dependency could sit at 100% progress and show
// "Completed" everywhere in the UI while anything depending on it stayed
// Blocked forever, since the DB column it was actually being compared
// against never equals 'Completed'. Matches the same progress-based check
// blockIfNeeded already uses for the same reason.
async function isEntityDone(entityType, entityId, statusFromDb) {
  const c = CFG[entityType];
  if (entityType === 'task') return statusFromDb === c.done;
  const progress = entityType === 'phase'
    ? await getPhaseProgress(entityId)
    : await getActivityProgress(entityId);
  return progress >= 100;
}

async function resolveUnblocked(reqFactory, entityType, completedId) {
  const c = CFG[entityType]; if (!c) return [];

  const depResult = await reqFactory()
    .input('completedId', sql.Int, completedId)
    .query(`SELECT ${c.idCol} AS id FROM ${c.depTable} WHERE ${c.depCol} = @completedId`);

  const unblocked = [];
  for (const { id } of depResult.recordset) {
    const depsResult = await reqFactory()
      .input('id', sql.Int, id)
      .query(`
        SELECT e.${c.idCol} AS depId, e.status AS depStatus
        FROM ${c.depTable} d
        INNER JOIN ${c.entityTable} e ON e.${c.idCol} = d.${c.depCol}
        WHERE d.${c.idCol} = @id AND e.is_deleted = 0
      `);
    let allDone = true;
    for (const dep of depsResult.recordset) {
      if (!(await isEntityDone(entityType, dep.depId, dep.depStatus))) { allDone = false; break; }
    }
    if (allDone) {
      await reqFactory()
        .input('id', sql.Int, id)
        .query(`UPDATE ${c.entityTable} SET status = 'To Do' WHERE ${c.idCol} = @id AND status = 'Blocked'`);
      unblocked.push(id);
    }
  }
  return unblocked;
}

/**
 * blockIfNeeded — when the dependency's blocker is not yet done, set the
 * dependent entity to Blocked. `reqFactory` is a () => sql.Request producer.
 * We check BOTH status = done AND progress >= 100 so a dep that reached 100%
 * but has a stale Blocked status column doesn't wrongly block the dependent.
 */
async function blockIfNeeded(reqFactory, entityType, entityId, dependsOnId) {
  const c = CFG[entityType]; if (!c) return;

  // For tasks, progress = % of task itself (0 or 100 based on status).
  // For phases/activities, compute progress from children in-line.
  let depDone = false;

  const statusRes = await reqFactory()
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`SELECT status FROM ${c.entityTable} WHERE ${c.idCol} = @dependsOnId`);
  const depStatus = statusRes.recordset[0]?.status;

  if (depStatus === c.done) {
    depDone = true;
  } else if (entityType === 'task') {
    // Tasks: done is purely status-driven
    depDone = false;
  } else {
    // Phase/Activity: compute progress from children to guard against a
    // stale Blocked status column. Reuses the real hierarchical progress
    // functions (Phase = avg of its Activities, not a flat pool of every
    // grandchild task) rather than a second, easy-to-drift copy of that logic.
    const progress = entityType === 'phase'
      ? await getPhaseProgress(dependsOnId)
      : await getActivityProgress(dependsOnId);
    depDone = progress >= 100;
  }

  if (!depDone) {
    // Previously only flipped an entity to Blocked if it happened to still
    // be 'To Do' at the moment the dependency was added — an entity already
    // 'Ongoing' when a new unresolved dependency got attached kept its
    // status and never visually showed as blocked (though updateTaskStatus's
    // own dependency check below is the actual enforcement; this just keeps
    // the status column/badge honest).
    await reqFactory()
      .input('entityId', sql.Int, entityId)
      .query(`UPDATE ${c.entityTable} SET status = 'Blocked' WHERE ${c.idCol} = @entityId AND status IN ('To Do', 'Ongoing')`);
  }
}

/**
 * isBlocked — the actual enforcement point that was missing. Blocked has
 * always been a real status dependencyService sets, but nothing outside
 * this file ever checked it before allowing new work underneath a blocked
 * Phase/Activity — you could create a Task inside a Blocked Activity, or
 * mark that Task Complete, with the block having no real effect. Called
 * from taskService (before creating a task, and before marking one
 * Complete) and activityService (before creating an activity in a phase).
 */
async function isBlocked(entityType, entityId) {
  if (!entityId) return false;
  const c = CFG[entityType]; if (!c) return false;
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, entityId)
    .query(`SELECT status FROM ${c.entityTable} WHERE ${c.idCol} = @id`);
  return result.recordset[0]?.status === 'Blocked';
}

/**
 * isInactive — a Project/Phase/Activity/Task that's been deactivated
 * (has children, so couldn't be hard-deleted) is frozen from new child
 * creation until reactivated. Checks only the entity's OWN is_active
 * column; ancestor cascade is handled by callers that already have the
 * parent chain loaded (see createActivity/createTask).
 */
async function isInactive(entityType, entityId) {
  if (!entityId) return false;
  const c = CFG[entityType]; if (!c) return false;
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, entityId)
    .query(`SELECT is_active FROM ${c.entityTable} WHERE ${c.idCol} = @id`);
  return result.recordset[0]?.is_active === false;
}

module.exports = { resolveUnblocked, blockIfNeeded, isBlocked, isInactive };