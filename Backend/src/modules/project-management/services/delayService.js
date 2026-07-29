'use strict';

/**
 * delayService — cascading schedule-delay computation, computed on fetch
 * (same philosophy as progressService: never stored).
 *
 * "Delayed" and "Overdue" are deliberately kept distinct and are NEVER
 * interchangeable:
 *   - Overdue (isOverdue, computed alongside each entity's own row) means
 *     THIS entity is incomplete past its OWN planned_end/due_date. It is
 *     entirely self-contained — no children involved.
 *   - Delayed (delayDays, computed here) means a CHILD is causing this
 *     entity to run late — either the child overruns THIS entity's own
 *     planned_end, or the child is itself already delayed (or overdue) and
 *     that bubbles up. It deliberately does NOT fold in this entity's own
 *     planned_end being in the past — that fact is Overdue's job, not
 *     Delayed's, so the two badges never fire off the same underlying cause.
 * The delay shown at any level is the MAX of the child-caused components,
 * so the headline number always reflects the worst offender underneath it.
 *
 * Task delay is the simple base case: incomplete + past its own due date —
 * for a leaf with no children, "delayed" and "overdue" coincide by
 * definition, so getTaskDelayDays doubles as both.
 */
const { getPool, sql } = require('../../../config/db');
const { getActivityProgress, getPhaseProgress } = require('./progressService');

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

/**
 * Overdue magnitude — how many days past ITS OWN planned_end/due_date an
 * entity is, today. Shared by every level (Task/Activity/Phase/Project) so
 * the Overdue badge can show a real number ("Overdue by 8d") instead of a
 * bare boolean — the one thing Overdue was missing that Delayed and Task's
 * own lateness already had. Caller is responsible for the "is this actually
 * overdue" gate (incomplete + status not stale — see activityService/
 * phaseService/projectService's isOverdue computation); this only does the
 * date math, same parseDate/daysBetween used everywhere else in this file.
 */
function getOverdueDays(plannedEnd) {
  const end = parseDate(plannedEnd);
  if (!end) return 0;
  return Math.max(0, daysBetween(today(), end));
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
 *   (b) any INCOMPLETE child task's due date running past the activity's
 *       planned_end
 * (b) is gated on the task still being incomplete — a task's due date used
 * to get compared against the activity's planned_end unconditionally, so a
 * task that had already been marked Complete kept pinning the Activity's
 * Delayed number at its old overrun forever, with no way for it to ever go
 * down even though the thing that caused it was finished. Task status is a
 * plain, directly-set column (unlike Activity/Phase's derived status), so
 * gating on it here is exact, not the staleness problem isOverdue had.
 *
 * Deliberately excludes the activity's own planned_end having passed —
 * that's what isOverdue is for; folding it in here would make Delayed and
 * Overdue fire off the same fact and read as interchangeable.
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
    if (end && t.dueDate && t.status !== 'Complete') {
      const due = parseDate(t.dueDate);
      maxDelay = Math.max(maxDelay, daysBetween(due, end));
    }
  }

  return Math.max(0, maxDelay);
}

/**
 * Phase: same shape one level up — activities in place of tasks. Same
 * exclusion applies: the phase's own planned_end passing is Overdue's
 * signal, not Delayed's.
 *
 * The "child overruns parent" term is gated on the Activity being
 * incomplete — same reasoning as getActivityDelayDays's task gate, but
 * checked via PROGRESS (getActivityProgress) rather than a status column:
 * pm_activities.status is never reliably written back to 'Completed' (it's
 * only ever derived fresh from progress on read, in activityService), so
 * gating on the raw column here would reproduce the exact isOverdue
 * staleness bug already fixed elsewhere — progress>=100 is the same signal
 * deriveStatus itself uses to decide "Completed".
 */
async function getPhaseDelayDays(phaseId, phasePlannedEnd) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`SELECT activity_id AS activityId, planned_end AS plannedEnd FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0`);

  const end = parseDate(phasePlannedEnd);

  // PERF: this used to be a sequential `for...await` loop — each Activity
  // waited on the previous one, and each Activity itself did TWO separate
  // round trips (getActivityDelayDays, then getActivityProgress) one after
  // another. Promise.all across activities, with the two per-activity
  // calls also run concurrently, turns what was 2×A serialized round trips
  // into effectively one concurrent batch.
  const perActivity = await Promise.all(result.recordset.map(async (a) => {
    const [activityDelay, progress] = await Promise.all([
      getActivityDelayDays(a.activityId, a.plannedEnd),
      (end && a.plannedEnd) ? getActivityProgress(a.activityId) : Promise.resolve(null),
    ]);
    let delay = activityDelay;
    if (end && a.plannedEnd && progress < 100) {
      const aEnd = parseDate(a.plannedEnd);
      delay = Math.max(delay, daysBetween(aEnd, end));
    }
    return delay;
  }));

  return Math.max(0, ...perActivity);
}

/**
 * Project: same shape again — phases in place of activities. Same
 * exclusion applies: the project's own planned_end passing is Overdue's
 * signal, not Delayed's. Same progress-based completion gate as
 * getPhaseDelayDays, for the same reason (pm_phases.status is equally
 * unreliable as a raw column).
 */
async function getProjectDelayDays(projectId, projectPlannedEnd) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT phase_id AS phaseId, planned_end AS plannedEnd FROM pm_phases WHERE project_id=@projectId AND is_deleted=0`);

  const end = parseDate(projectPlannedEnd);

  // PERF: same fix as getPhaseDelayDays above — was a sequential loop with
  // two serialized round trips per Phase; now concurrent both ways.
  const perPhase = await Promise.all(result.recordset.map(async (ph) => {
    const [phaseDelay, progress] = await Promise.all([
      getPhaseDelayDays(ph.phaseId, ph.plannedEnd),
      (end && ph.plannedEnd) ? getPhaseProgress(ph.phaseId) : Promise.resolve(null),
    ]);
    let delay = phaseDelay;
    if (end && ph.plannedEnd && progress < 100) {
      const phEnd = parseDate(ph.plannedEnd);
      delay = Math.max(delay, daysBetween(phEnd, end));
    }
    return delay;
  }));

  return Math.max(0, ...perPhase);
}

module.exports = { getTaskDelayDays, getActivityDelayDays, getPhaseDelayDays, getProjectDelayDays, getOverdueDays };