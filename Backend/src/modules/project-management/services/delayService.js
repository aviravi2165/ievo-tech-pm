'use strict';

/**
 * delayService — cascading schedule-delay computation, computed on fetch
 * (same philosophy as progressService: never stored).
 *
 * The rule at every level is the same shape, just one level up each time:
 *   - A child scheduled to (or actually) finish AFTER the parent's own
 *     planned_end means the parent's window has been violated — the parent
 *     is "late by" however many days the child overruns it.
 *   - A child that is itself already late bubbles that lateness up too —
 *     an Activity with a late Task is itself late by at least that much,
 *     even before its own planned_end has passed.
 *   - The parent's own planned_end being in the past, while it still isn't
 *     100% done, also counts.
 * The delay shown at any level is the MAX of all of the above, so the
 * headline number always reflects the worst offender underneath it.
 *
 * Task delay is the simple base case: incomplete + past its own due date.
 */
const { getPool, sql } = require('../../../config/db');

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// This ran server-side against raw mssql query results, NOT the frontend's
// JSON-serialized API responses — the mssql driver returns native JS Date
// objects for DATE/DATETIME columns, not ISO strings. String(dateObject)
// calls .toString(), producing something like "Thu Jul 16 2026 00:00:00
// GMT+0000 (Coordinated Universal Time)" — no 'T', so .split('T')[0] did
// nothing, and .split('-') then either found no hyphen at all (positive
// UTC offset servers) or split on the wrong part of a timezone string
// (negative offset), so [y, m, day] came out as garbage and every date
// comparison in this file silently evaluated to NaN. Math.max() with a
// NaN argument always returns NaN, so every *DelayDays function had been
// returning NaN this whole time — which always fails a `> 0` check on the
// frontend, so no delay ever appeared to be visible regardless of the
// actual schedule data. UTC getters (not local) because SQL Server DATE
// columns carry no time/timezone component and the driver represents them
// as UTC midnight — local getters would shift the date by one in servers
// running behind UTC.
function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(d).split('T')[0];
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function daysBetween(later, earlier) {
  if (!later || !earlier) return 0;
  return Math.round((later - earlier) / 86400000);
}

/** Task: delayed if incomplete and past its own due date. Pure — no I/O. */
function getTaskDelayDays(task) {
  if (!task?.dueDate || task.status === 'Complete') return 0;
  const due = parseDate(task.dueDate);
  if (!due) return 0;
  return Math.max(0, daysBetween(today(), due));
}

/**
 * Activity: max of —
 *   (a) any child task's own delay (bubbled up)
 *   (b) any child task's due date running past the activity's planned_end
 *   (c) the activity's own planned_end already passed while incomplete
 */
async function getActivityDelayDays(activityId, activityPlannedEnd) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT due_date AS dueDate, status FROM pm_tasks WHERE activity_id=@activityId AND is_deleted=0`);

  const end = parseDate(activityPlannedEnd);
  let maxDelay = 0;

  for (const t of result.recordset) {
    maxDelay = Math.max(maxDelay, getTaskDelayDays(t));
    if (end && t.dueDate) {
      const due = parseDate(t.dueDate);
      maxDelay = Math.max(maxDelay, daysBetween(due, end));
    }
  }

  if (end) {
    const allComplete = result.recordset.length > 0 && result.recordset.every(t => t.status === 'Complete');
    if (!allComplete) maxDelay = Math.max(maxDelay, daysBetween(today(), end));
  }

  return Math.max(0, maxDelay);
}

/**
 * Phase: same shape one level up — activities in place of tasks.
 */
async function getPhaseDelayDays(phaseId, phasePlannedEnd) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT activity_id AS activityId, planned_end AS plannedEnd, status FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);

  const end = parseDate(phasePlannedEnd);
  let maxDelay = 0;

  for (const a of result.recordset) {
    const activityDelay = await getActivityDelayDays(a.activityId, a.plannedEnd);
    maxDelay = Math.max(maxDelay, activityDelay);
    if (end && a.plannedEnd) {
      const aEnd = parseDate(a.plannedEnd);
      maxDelay = Math.max(maxDelay, daysBetween(aEnd, end));
    }
  }

  if (end) {
    const allComplete = result.recordset.length > 0 && result.recordset.every(a => a.status === 'Completed');
    if (!allComplete) maxDelay = Math.max(maxDelay, daysBetween(today(), end));
  }

  return Math.max(0, maxDelay);
}

/**
 * Project: same shape again — phases in place of activities.
 */
async function getProjectDelayDays(projectId, projectPlannedEnd) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT phase_id AS phaseId, planned_end AS plannedEnd, status FROM pm_phases WHERE project_id=@projectId AND is_deleted=0`);

  const end = parseDate(projectPlannedEnd);
  let maxDelay = 0;

  for (const ph of result.recordset) {
    const phaseDelay = await getPhaseDelayDays(ph.phaseId, ph.plannedEnd);
    maxDelay = Math.max(maxDelay, phaseDelay);
    if (end && ph.plannedEnd) {
      const phEnd = parseDate(ph.plannedEnd);
      maxDelay = Math.max(maxDelay, daysBetween(phEnd, end));
    }
  }

  if (end) {
    const allComplete = result.recordset.length > 0 && result.recordset.every(ph => ph.status === 'Completed');
    if (!allComplete) maxDelay = Math.max(maxDelay, daysBetween(today(), end));
  }

  return Math.max(0, maxDelay);
}

module.exports = { getTaskDelayDays, getActivityDelayDays, getPhaseDelayDays, getProjectDelayDays };