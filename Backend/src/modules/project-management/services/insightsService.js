'use strict';

/**
 * insightsService — the Analytics tab's full catalog, both the ORIGINAL
 * fixed sections (Progress by Phase, Task Status, Priority, Workload,
 * Weekly Completions, On-Time Completion, Project Journey — `default:
 * true`) and the newer optional ones (Cumulative Flow, Cycle Time, Aging
 * WIP, Overdue Trend, Blocked Time, Planned vs Actual — `default: false`).
 * Unifying them means a default section gets the exact same remove/re-add
 * treatment as an optional one — no separate "you can't remove this"
 * carve-out.
 *
 * Deliberately a fixed, developer-defined catalog, NOT an admin-authored
 * template builder — a real chart/query builder is a much bigger, separate
 * feature (think Looker/Metabase) this app doesn't need. The optional
 * entries' DATA is computed fresh from data the app already tracks
 * elsewhere (mainly pm_audit_log's status history — see auditService.js);
 * the default entries' data is computed by useProjectAnalytics.js on the
 * frontend exactly as before — this service only tracks their VISIBILITY,
 * not their data, for either kind.
 *
 * pm_project_insights holds only OVERRIDES to each entry's own `default`
 * state: a project with zero rows shows exactly the catalog's defaults. A
 * row's `visible` bit flips that one entry only — removing a default
 * inserts/updates a `visible=0` row; adding an optional inserts/updates a
 * `visible=1` row. Same mechanism both directions.
 */
const { getPool, sql } = require('../../../config/db');

const DONE_TASK = 'Complete';
const BUCKETS = 10;

const CATALOG = [
  // ── Original fixed sections — visible by default ──────────────────────
  { key: 'progressByPhase',   label: 'Progress by Phase',        description: "Each phase's own completion percentage, most complete first.", default: true },
  { key: 'statusDistribution',label: 'Task Status Distribution', description: 'Every task across all activities in this project, by current status.', default: true },
  { key: 'priorityBreakdown', label: 'Priority Breakdown',       description: 'All tasks by priority level.', default: true },
  { key: 'teamWorkload',      label: 'Team Workload',            description: 'Active (not yet complete) and overdue tasks per assignee, busiest first.', default: true },
  { key: 'weeklyCompletions', label: 'Completions — Last 6 Weeks', description: 'Tasks currently marked Complete, bucketed by the week they actually finished.', default: true },
  { key: 'onTimeCompletion',  label: 'On-Time Completion',       description: 'Completed tasks, by whether they finished at or before their due date.', default: true },
  { key: 'projectJourney',    label: 'Project Journey',          description: 'Cumulative tasks completed over time, against an ideal pace when planned dates exist.', default: true },
  // ── Optional additions — hidden until added ────────────────────────────
  {
    key: 'cfd',
    label: 'Cumulative Flow Diagram',
    description: 'Stacked count of tasks in each status over time — a widening Blocked/Ongoing band flags where work is piling up.',
    default: false,
  },
  {
    key: 'cycleTime',
    label: 'Cycle Time Trend',
    description: "How long finished tasks took (started → completed) over the project's life, with a rolling average — shows whether flow is speeding up or slowing down.",
    default: false,
  },
  {
    key: 'agingWip',
    label: 'Aging Work In Progress',
    description: "Currently open tasks ranked by how long they've sat since their last status change — what's stuck.",
    default: false,
  },
  {
    key: 'overdueTrend',
    label: 'Overdue Trend',
    description: "How many tasks were overdue, week by week, reconstructed from due dates and status history — a trend, not just today's count.",
    default: false,
  },
  {
    key: 'blockedTime',
    label: 'Blocked Time by Activity',
    description: 'Total days each Activity has actually spent in a Blocked state — where the dependency chain costs the most.',
    default: false,
  },
  {
    key: 'phaseDuration',
    label: 'Planned vs Actual Duration',
    description: "Each Phase's planned span vs. its actual elapsed span — were we right about how long this would take.",
    default: false,
  },
];
const CATALOG_KEYS = new Set(CATALOG.map(c => c.key));
const DATA_KEYS = new Set(CATALOG.filter(c => !c.default).map(c => c.key)); // the ones this service computes data for

function getCatalog() { return CATALOG; }

// ── Effective visibility (catalog default, overridden per-project) ──────────

async function getVisibleInsights(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT insight_type AS insightType, visible, display_order AS displayOrder
      FROM pm_project_insights WHERE project_id=@projectId
    `);
  const overrides = {};
  result.recordset.forEach(r => { overrides[r.insightType] = r; });

  return CATALOG
    .map((c, i) => {
      const ov = overrides[c.key];
      return {
        insightType: c.key,
        visible: ov ? Boolean(ov.visible) : c.default,
        // Rows with an explicit order sort by that; anything else falls
        // back to its position in the catalog array, so newly-added
        // optionals (which get a real order on insert) land after the
        // still-default-ordered fixed sections rather than interleaving.
        displayOrder: ov?.displayOrder ?? i,
      };
    })
    .filter(c => c.visible)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

async function setInsightVisibility(projectId, insightType, visible, userId) {
  if (!CATALOG_KEYS.has(insightType)) {
    const e = new Error('Unknown insight type'); e.statusCode = 400; throw e;
  }
  const pool = await getPool();
  const orderResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM pm_project_insights WHERE project_id=@projectId`);
  await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('insightType', sql.VarChar(40), insightType)
    .input('visible', sql.Bit, visible ? 1 : 0)
    .input('displayOrder', sql.Int, orderResult.recordset[0].next)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      MERGE pm_project_insights AS tgt
      USING (SELECT @projectId AS projectId, @insightType AS insightType) AS src
        ON tgt.project_id = src.projectId AND tgt.insight_type = src.insightType
      WHEN MATCHED THEN
        UPDATE SET visible = @visible, changed_by = @userId, changed_at = SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN
        INSERT (project_id, insight_type, visible, display_order, changed_by)
        VALUES (@projectId, @insightType, @visible, @displayOrder, @userId);
    `);
}

// ── Shared: every live task under the project + its full status_changed
// history (real, user-driven transitions — see taskService.updateTaskStatus)
async function getProjectTasksWithHistory(projectId) {
  const pool = await getPool();
  const tasksResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT t.task_id AS taskId, t.name, t.status, t.due_date AS dueDate, t.created_at AS createdAt
      FROM pm_tasks t
      INNER JOIN pm_activities a ON a.activity_id = t.activity_id
      INNER JOIN pm_phases ph ON ph.phase_id = a.phase_id
      WHERE ph.project_id=@projectId AND t.is_deleted=0 AND a.is_deleted=0 AND ph.is_deleted=0
    `);
  const tasks = tasksResult.recordset;
  if (!tasks.length) return [];

  const historyResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT entity_id AS taskId, changed_at AS changedAt, old_value AS oldValue, new_value AS newValue
      FROM pm_audit_log
      WHERE project_id=@projectId AND entity_type='task' AND action='status_changed' AND field_changed='status'
      ORDER BY changed_at ASC, id ASC
    `);
  const historyByTask = {};
  historyResult.recordset.forEach(r => { (historyByTask[r.taskId] ||= []).push(r); });
  return tasks.map(t => ({ ...t, history: historyByTask[t.taskId] || [] }));
}

// Reconstructs what a task's status WAS as of `date`, from its ordered
// history — the same technique delayService/progressService use for "as of
// now", just walked forward to an arbitrary point instead of always "today".
function statusAsOf(task, date) {
  let status = task.history.length ? (task.history[0].oldValue || 'To Do') : task.status;
  for (const h of task.history) {
    if (new Date(h.changedAt) > date) break;
    status = h.newValue;
  }
  return status;
}

function dateBuckets(rangeStart, rangeEnd, n = BUCKETS) {
  if (!rangeStart || !rangeEnd || rangeEnd <= rangeStart) return [];
  const span = rangeEnd - rangeStart;
  return Array.from({ length: n }, (_, i) => new Date(rangeStart.getTime() + (span * i) / (n - 1)));
}

// 1. Cumulative Flow Diagram — status counts at each bucket date. Tasks not
// yet created by a given bucket date are excluded from that bucket's totals.
function buildCFD(tasks, rangeStart, rangeEnd) {
  return dateBuckets(rangeStart, rangeEnd).map(date => {
    const counts = { 'To Do': 0, Ongoing: 0, Blocked: 0, Complete: 0 };
    for (const t of tasks) {
      if (new Date(t.createdAt) > date) continue;
      const status = statusAsOf(t, date);
      if (counts[status] !== undefined) counts[status] += 1;
    }
    return { date, counts };
  });
}

// 2. Cycle Time Trend — per completed task, days from its first "Ongoing"
// transition (or creation, if it went straight to Complete) to its most
// recent Complete transition, plotted chronologically with a rolling
// average (window 5) so a noisy point-cloud still reads as a trend line.
function buildCycleTime(tasks) {
  const points = [];
  for (const t of tasks) {
    if (t.status !== DONE_TASK) continue;
    const completedEntry = [...t.history].reverse().find(h => h.newValue === DONE_TASK);
    if (!completedEntry) continue;
    const completedAt = new Date(completedEntry.changedAt);
    const startedEntry = t.history.find(h => h.newValue === 'Ongoing');
    const startedAt = startedEntry ? new Date(startedEntry.changedAt) : new Date(t.createdAt);
    const cycleDays = Math.max(0, Math.round((completedAt - startedAt) / 86400000));
    points.push({ date: completedAt, cycleDays, taskName: t.name });
  }
  points.sort((a, b) => a.date - b.date);
  const WINDOW = 5;
  points.forEach((p, i) => {
    const slice = points.slice(Math.max(0, i - WINDOW + 1), i + 1);
    p.rollingAvg = Math.round(slice.reduce((s, x) => s + x.cycleDays, 0) / slice.length);
  });
  return points;
}

// 3. Aging Work In Progress — open tasks ranked by days since their last
// status change (or creation, if it never changed), worst first.
function buildAgingWip(tasks, limit = 15) {
  const now = new Date();
  return tasks
    .filter(t => t.status !== DONE_TASK)
    .map(t => {
      const lastChange = t.history.length ? new Date(t.history[t.history.length - 1].changedAt) : new Date(t.createdAt);
      const ageDays = Math.max(0, Math.round((now - lastChange) / 86400000));
      return { taskId: t.taskId, name: t.name, status: t.status, ageDays };
    })
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, limit);
}

// 4. Overdue Trend — count of tasks overdue AS OF each bucket date
// (due date already passed, and not yet Complete at that point in time,
// per statusAsOf) — a trend of the project's health, not just today's
// snapshot the way isOverdue/delayDays (delayService.js) are.
function buildOverdueTrend(tasks, rangeStart, rangeEnd) {
  return dateBuckets(rangeStart, rangeEnd).map(date => {
    const count = tasks.filter(t => {
      if (!t.dueDate || new Date(t.dueDate) >= date) return false;
      return statusAsOf(t, date) !== DONE_TASK;
    }).length;
    return { date, count };
  });
}

// 5. Blocked Time by Activity — reconstructs Blocked intervals from each
// Activity's status_computed history (system-inferred, see
// auditService.recordStatusIfChanged — pm_activities.status is never
// reliably written back to a real value, so this is the only source of
// truth for "when did this actually become Blocked"), pairing each
// transition INTO Blocked with the next transition OUT of it (or now, if
// still Blocked).
async function buildBlockedTime(projectId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT a.activity_id AS activityId, a.name AS activityName,
             h.changed_at AS changedAt, h.new_value AS newValue
      FROM pm_audit_log h
      INNER JOIN pm_activities a ON a.activity_id = h.entity_id
      WHERE h.project_id=@projectId AND h.entity_type='activity' AND h.action='status_computed' AND h.field_changed='status'
      ORDER BY a.activity_id, h.changed_at ASC, h.id ASC
    `);
  const byActivity = {};
  result.recordset.forEach(r => {
    (byActivity[r.activityId] ||= { name: r.activityName, rows: [] }).rows.push(r);
  });

  const now = new Date();
  const out = [];
  for (const [activityId, { name, rows }] of Object.entries(byActivity)) {
    let blockedDays = 0;
    let blockedSince = null;
    for (const r of rows) {
      if (r.newValue === 'Blocked') blockedSince = new Date(r.changedAt);
      else if (blockedSince) {
        blockedDays += (new Date(r.changedAt) - blockedSince) / 86400000;
        blockedSince = null;
      }
    }
    if (blockedSince) blockedDays += (now - blockedSince) / 86400000;
    if (blockedDays > 0) out.push({ activityId: Number(activityId), name, blockedDays: Math.round(blockedDays * 10) / 10 });
  }
  return out.sort((a, b) => b.blockedDays - a.blockedDays);
}

// 6. Planned vs Actual Duration by Phase — planned span from the Phase's
// own dates; actual span from its status_computed history: first recorded
// status (proxy for "when tracking/work began") to the transition INTO
// 'Completed', or to now if it hasn't completed yet (marked `ongoing`).
async function buildPhaseDuration(projectId) {
  const pool = await getPool();
  const phasesResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`SELECT phase_id AS phaseId, name, planned_start AS plannedStart, planned_end AS plannedEnd FROM pm_phases WHERE project_id=@projectId AND is_deleted=0`);
  const phases = phasesResult.recordset;
  if (!phases.length) return [];

  const historyResult = await pool.request()
    .input('projectId', sql.Int, projectId)
    .query(`
      SELECT entity_id AS phaseId, changed_at AS changedAt, new_value AS newValue
      FROM pm_audit_log
      WHERE project_id=@projectId AND entity_type='phase' AND action='status_computed' AND field_changed='status'
      ORDER BY changed_at ASC, id ASC
    `);
  const historyByPhase = {};
  historyResult.recordset.forEach(r => { (historyByPhase[r.phaseId] ||= []).push(r); });

  const now = new Date();
  return phases
    .map(p => {
      const history = historyByPhase[p.phaseId] || [];
      const plannedDays = (p.plannedStart && p.plannedEnd)
        ? Math.round((new Date(p.plannedEnd) - new Date(p.plannedStart)) / 86400000)
        : null;
      const actualStart = history.length ? new Date(history[0].changedAt) : null;
      const completedEntry = history.find(h => h.newValue === 'Completed');
      const actualEnd = completedEntry ? new Date(completedEntry.changedAt) : (actualStart ? now : null);
      const actualDays = (actualStart && actualEnd) ? Math.round((actualEnd - actualStart) / 86400000) : null;
      return { phaseId: p.phaseId, name: p.name, plannedDays, actualDays, ongoing: !completedEntry && !!actualStart };
    })
    .filter(p => p.plannedDays != null || p.actualDays != null);
}

// ── Compute data for every VISIBLE, non-default insight ─────────────────────
// Default sections' data is computed by useProjectAnalytics.js on the
// frontend (unchanged) — this only covers the optional catalog entries,
// filtered to DATA_KEYS so a visible default never falls through to the
// `default:` case below for nothing.
async function getInsightsData(projectId) {
  const visible = await getVisibleInsights(projectId);
  const addedTypes = new Set(visible.map(a => a.insightType).filter(k => DATA_KEYS.has(k)));
  if (!addedTypes.size) return {};

  const needsTasks = ['cfd', 'cycleTime', 'agingWip', 'overdueTrend'].some(k => addedTypes.has(k));
  const tasks = needsTasks ? await getProjectTasksWithHistory(projectId) : [];

  let rangeStart = null, rangeEnd = null;
  if (addedTypes.has('cfd') || addedTypes.has('overdueTrend')) {
    const pool = await getPool();
    const projResult = await pool.request().input('projectId', sql.Int, projectId)
      .query('SELECT planned_start AS plannedStart FROM pm_projects WHERE project_id=@projectId');
    const plannedStart = projResult.recordset[0]?.plannedStart;
    const earliestTask = tasks.length ? new Date(Math.min(...tasks.map(t => new Date(t.createdAt)))) : null;
    rangeStart = plannedStart ? new Date(plannedStart) : earliestTask;
    rangeEnd = new Date();
  }

  const data = {};
  for (const insightType of addedTypes) {
    switch (insightType) {
      case 'cfd':          data.cfd = buildCFD(tasks, rangeStart, rangeEnd); break;
      case 'cycleTime':     data.cycleTime = buildCycleTime(tasks); break;
      case 'agingWip':      data.agingWip = buildAgingWip(tasks); break;
      case 'overdueTrend':  data.overdueTrend = buildOverdueTrend(tasks, rangeStart, rangeEnd); break;
      case 'blockedTime':   data.blockedTime = await buildBlockedTime(projectId); break;
      case 'phaseDuration': data.phaseDuration = await buildPhaseDuration(projectId); break;
      default: break;
    }
  }
  return data;
}

module.exports = {
  getCatalog, getVisibleInsights, setInsightVisibility, getInsightsData,
};
