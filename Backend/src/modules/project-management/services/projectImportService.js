'use strict';

/**
 * projectImportService — build a project's Phase → Activity → Task structure from an Excel file.
 *
 * The file is one flat sheet ("Plan"), one row per task, using the column layout that
 * buildTemplateWorkbook() hands out (with a filled-in sample). A Phase or Activity name left blank
 * on a row means "same as the row above", so the names only need to be typed once per group.
 *
 * Two steps, both reading the same file with the same rules:
 *   previewImport() — parses and checks everything, writes nothing, returns counts and a list of
 *                     row-level problems (or an outline when there are none);
 *   runImport()     — repeats the checks, then creates everything through the SAME
 *                     phaseService.createPhase / activityService.createActivity /
 *                     taskService.createTask every other code path uses, so all the existing
 *                     rules and audit entries still apply. If one of those fails part-way, the
 *                     phases created so far are removed again (everything below a phase is
 *                     deleted with it), so a failed import leaves the project as it was.
 *
 * An import fills an EMPTY project: a project that already has phases keeps its own weightage
 * budget, which an import could not share fairly. Dependencies between items are not part of the
 * file; they can be added afterwards in the project like any other.
 */

const ExcelJS = require('exceljs');
const { getPool, sql } = require('../../../config/db');
const phaseService = require('./phaseService');
const activityService = require('./activityService');
const taskService = require('./taskService');

const SHEET = 'Plan';
const LIMITS = { rows: 1500, phases: 60, activities: 400, tasks: 1200, name: 200 };
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
// What a task can be set to at import. 'Blocked' is system-managed (from dependencies), so it is not offered.
const STATUS_ALIASES = { 'to do': 'To Do', todo: 'To Do', 'not started': 'To Do', ongoing: 'Ongoing', 'in progress': 'Ongoing',
  complete: 'Complete', completed: 'Complete', done: 'Complete' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Column order of the template. `key` is what the parser reads; `labels` are accepted header spellings.
const COLUMNS = [
  { key: 'phase',        header: 'Phase *',                   width: 26, labels: ['phase', 'phase name'] },
  { key: 'phaseStart',   header: 'Phase Start',               width: 13, labels: ['phase start'] },
  { key: 'phaseEnd',     header: 'Phase End',                 width: 13, labels: ['phase end'] },
  { key: 'phaseWeight',  header: 'Phase Weight %',            width: 14, labels: ['phase weight', 'phase weightage', 'phase weight %'] },
  { key: 'activity',     header: 'Activity *',                width: 28, labels: ['activity', 'activity name'] },
  { key: 'actStart',     header: 'Activity Start',            width: 14, labels: ['activity start'] },
  { key: 'actEnd',       header: 'Activity End',              width: 14, labels: ['activity end'] },
  { key: 'actWeight',    header: 'Activity Weight %',         width: 16, labels: ['activity weight', 'activity weightage', 'activity weight %'] },
  { key: 'actOwner',     header: 'Activity Owner Email',      width: 28, labels: ['activity owner', 'activity owner email', 'activity manager email'] },
  { key: 'task',         header: 'Task',                      width: 30, labels: ['task', 'task name'] },
  { key: 'priority',     header: 'Priority',                  width: 11, labels: ['priority', 'task priority'] },
  { key: 'taskStart',    header: 'Task Start',                width: 13, labels: ['task start'] },
  { key: 'taskDue',      header: 'Task Due Date',             width: 14, labels: ['task due', 'task due date', 'due date'] },
  { key: 'taskWeight',   header: 'Task Weight %',             width: 13, labels: ['task weight', 'task weightage', 'task weight %'] },
  { key: 'assignees',    header: 'Task Assignee Emails',      width: 32, labels: ['task assignee', 'task assignees', 'task assignee emails', 'assignee emails'] },
  { key: 'description',  header: 'Task Description',          width: 36, labels: ['task description', 'description'] },
  // Last on purpose: files made with the earlier 16-column format have no such column and still import.
  { key: 'taskStatus',   header: 'Task Status',               width: 13, labels: ['task status', 'status'] },
];
const REQUIRED_KEYS = ['phase', 'activity'];
const colLetter = (key) => String.fromCharCode(65 + COLUMNS.findIndex(c => c.key === key));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[*()]/g, '').replace(/\s+/g, ' ').trim();

const httpError = (status, message, extra) => { const e = new Error(message); e.statusCode = status; if (extra) e.meta = extra; return e; };

// ── Cell reading ─────────────────────────────────────────────────────────────

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
    if ('result' in v) return cellText(v.result);                  // formula
    if ('text' in v) return String(v.text ?? '').trim();           // hyperlink
    if ('error' in v) return '';
  }
  return String(v).trim();
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const unwrap = (v) => ((v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) ? v.result : v);

/** Date cell -> 'YYYY-MM-DD'; undefined when blank, null when it is not a date. */
function readDate(cell) {
  const v = cell?.value;
  if (v == null || v === '') return undefined;
  const raw = unwrap(v);
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : isoOf(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  if (typeof raw === 'number') {                                   // Excel serial date typed into a General cell
    if (raw < 20000 || raw > 80000) return null;
    const t = new Date(Math.round((raw - 25569) * 86400000));
    return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const s = cellText(raw);
  if (!s) return undefined;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);          // 2026-03-31
  if (m) return isoOf(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);              // 31/03/2026 (day first, as in India)
  if (m) return isoOf(+m[3], +m[2], +m[1]);
  return null;
}

/** Weight cell -> number; undefined when blank, null when it is not a number. */
function readWeight(cell) {
  const v = cell?.value;
  if (v == null || v === '') return undefined;
  const raw = unwrap(v);
  let n;
  if (typeof raw === 'number') n = raw;
  else { const s = cellText(raw).replace('%', '').replace(',', '.').trim(); if (!s) return undefined; n = Number(s); }
  if (!Number.isFinite(n)) return null;
  if (typeof raw === 'number' && String(cell.numFmt || '').includes('%')) n *= 100;   // a cell formatted as % stores 0.4 for 40%
  return Math.round(n * 100) / 100;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Reads the workbook into { rows, problems }. Nothing is looked up in the database here. */
async function readRows(buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); }
  catch { throw httpError(400, 'This file could not be read. Please upload an .xlsx file (use the downloaded format).'); }
  const ws = wb.getWorksheet(SHEET) || wb.worksheets[0];
  if (!ws) throw httpError(400, 'The workbook has no sheets.');

  const colOf = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = norm(cellText(cell.value));
    const def = COLUMNS.find(c => c.labels.includes(h) || norm(c.header) === h);
    if (def && !colOf[def.key]) colOf[def.key] = col;
  });
  const missing = REQUIRED_KEYS.filter(k => !colOf[k]);
  if (missing.length) {
    throw httpError(400, `Column${missing.length > 1 ? 's' : ''} not found in row 1: ${missing.map(k => COLUMNS.find(c => c.key === k).header).join(', ')}. Please use the downloaded format and keep its header row.`);
  }

  const rows = [];
  const problems = [];
  const DATES = [['phaseStart', 'Phase Start'], ['phaseEnd', 'Phase End'], ['actStart', 'Activity Start'], ['actEnd', 'Activity End'], ['taskStart', 'Task Start'], ['taskDue', 'Task Due Date']];
  const WEIGHTS = [['phaseWeight', 'Phase Weight %'], ['actWeight', 'Activity Weight %'], ['taskWeight', 'Task Weight %']];
  const last = Math.min(ws.rowCount, LIMITS.rows + 1 + 200);   // a little slack for blank rows
  for (let r = 2; r <= last; r++) {
    const row = ws.getRow(r);
    const cell = (k) => (colOf[k] ? row.getCell(colOf[k]) : null);
    const text = (k) => cellText(cell(k)?.value);
    const item = { row: r, phase: text('phase'), activity: text('activity'), task: text('task'), priority: text('priority'),
      actOwner: text('actOwner').toLowerCase(), description: text('description'), status: text('taskStatus'),
      assignees: text('assignees').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean) };
    for (const [list, reader, hint] of [[DATES, readDate, 'a date. Use YYYY-MM-DD (for example 2026-03-31) or DD/MM/YYYY'], [WEIGHTS, readWeight, 'a number']]) {
      for (const [k, label] of list) {
        const val = colOf[k] ? reader(cell(k)) : undefined;
        if (val === null) problems.push({ row: r, column: label, message: `"${cellText(cell(k).value)}" is not ${hint}.` });
        else item[k] = val;
      }
    }
    const anyValue = [...DATES, ...WEIGHTS].some(([k]) => item[k] !== undefined);
    if (!item.phase && !item.activity && !item.task && !item.description && !item.actOwner && !item.priority && !item.status && !item.assignees.length && !anyValue) continue;
    rows.push(item);
  }
  if (!rows.length) throw httpError(400, 'The file has no data rows under the header. Fill in at least one Phase, Activity and Task.');
  if (rows.length > LIMITS.rows) throw httpError(400, `The file has more than ${LIMITS.rows} rows. Please split it into smaller imports.`);
  return { rows, problems };
}

/** Groups the flat rows into a Phase → Activity → Task tree (a blank Phase/Activity cell repeats the one above). */
function buildTree(rows, problems) {
  const phases = [];
  let curPhase = null; let curAct = null;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  // The same value repeated on every row of a group is fine; a different one is a mistake.
  const setOnce = (obj, field, value, row, column) => {
    if (value === undefined) return;
    if (obj[field] === undefined) { obj[field] = value; return; }
    if (obj[field] !== value) problems.push({ row, column, message: `Differs from an earlier row of the same group (${obj[field]} vs ${value}). Give each phase/activity one value.` });
  };

  for (const r of rows) {
    if (r.phase) {
      if (r.phase.length > LIMITS.name) problems.push({ row: r.row, column: 'Phase *', message: `Phase name is longer than ${LIMITS.name} characters.` });
      let p = phases.find(x => same(x.name, r.phase));
      if (!p) { p = { name: r.phase, row: r.row, activities: [] }; phases.push(p); }
      if (p !== curPhase) curAct = null;
      curPhase = p;
    }
    if (!curPhase) { problems.push({ row: r.row, column: 'Phase *', message: 'No phase yet — the first data row must name a Phase.' }); continue; }
    setOnce(curPhase, 'start', r.phaseStart, r.row, 'Phase Start');
    setOnce(curPhase, 'end', r.phaseEnd, r.row, 'Phase End');
    setOnce(curPhase, 'weight', r.phaseWeight, r.row, 'Phase Weight %');

    if (r.activity) {
      if (r.activity.length > LIMITS.name) problems.push({ row: r.row, column: 'Activity *', message: `Activity name is longer than ${LIMITS.name} characters.` });
      let a = curPhase.activities.find(x => same(x.name, r.activity));
      if (!a) { a = { name: r.activity, row: r.row, tasks: [] }; curPhase.activities.push(a); }
      curAct = a;
    }
    const hasActivityData = r.actStart !== undefined || r.actEnd !== undefined || r.actWeight !== undefined || r.actOwner || r.task || r.description;
    if (!curAct) {
      if (hasActivityData) problems.push({ row: r.row, column: 'Activity *', message: 'No activity yet — name the Activity on this row (or an earlier one in the phase).' });
      continue;
    }
    setOnce(curAct, 'start', r.actStart, r.row, 'Activity Start');
    setOnce(curAct, 'end', r.actEnd, r.row, 'Activity End');
    setOnce(curAct, 'weight', r.actWeight, r.row, 'Activity Weight %');
    if (r.actOwner) {
      if (curAct.ownerEmail && curAct.ownerEmail !== r.actOwner) problems.push({ row: r.row, column: 'Activity Owner Email', message: 'Differs from the owner on an earlier row of the same activity.' });
      curAct.ownerEmail = curAct.ownerEmail || r.actOwner;
      curAct.ownerRow = curAct.ownerRow || r.row;
    }

    if (r.task) {
      if (r.task.length > LIMITS.name) problems.push({ row: r.row, column: 'Task', message: `Task name is longer than ${LIMITS.name} characters.` });
      curAct.tasks.push({ name: r.task, row: r.row, priority: r.priority, status: r.status, start: r.taskStart, due: r.taskDue, weight: r.taskWeight, assignees: r.assignees, description: r.description || null });
    } else if (r.priority || r.status || r.taskStart !== undefined || r.taskDue !== undefined || r.taskWeight !== undefined || r.assignees.length || r.description) {
      problems.push({ row: r.row, column: 'Task', message: 'This row has task details but no Task name.' });
    }
  }
  return phases;
}

// ── Checking ─────────────────────────────────────────────────────────────────

// Weights of one sibling group: all blank → split evenly; all given → must total 100; a mix is not allowed.
function resolveWeights(items, label, problems) {
  const given = items.filter(i => i.weight !== undefined);
  if (given.length === 0) {
    const n = items.length;
    const base = Math.floor(10000 / n) / 100;
    items.forEach((it, i) => { it.weightage = i === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base; });
    return;
  }
  if (given.length !== items.length) {
    problems.push({ row: items.find(i => i.weight === undefined).row, column: `${label} Weight %`, message: `Some ${label.toLowerCase()}s in this group have a weight and some do not. Fill the weight for all of them, or leave all blank for an equal split.` });
    return;
  }
  const total = Math.round(items.reduce((s, i) => s + i.weight, 0) * 100) / 100;
  for (const it of items) if (it.weight < 1 || it.weight > 100) problems.push({ row: it.row, column: `${label} Weight %`, message: 'Weight must be between 1 and 100.' });
  if (Math.abs(total - 100) > 0.01) problems.push({ row: items[0].row, column: `${label} Weight %`, message: `The ${label.toLowerCase()} weights in this group add up to ${total}, not 100.` });
  items.forEach(it => { it.weightage = it.weight; });
}

async function lookupUsers(emails) {
  const list = [...new Set(emails)];
  const found = new Map();
  if (!list.length) return found;
  const pool = await getPool();
  const req = pool.request();
  const params = list.map((e, i) => { req.input(`e${i}`, sql.NVarChar(320), e); return `@e${i}`; });
  const r = await req.query(`SELECT user_id AS userId, LOWER(email) AS email, is_active AS isActive FROM auth_users WHERE LOWER(email) IN (${params.join(',')})`);
  for (const u of r.recordset) found.set(u.email, u);
  return found;
}

/** Everything that can be checked without writing: structure, dates, weights, people, project state. */
async function analyse(projectId, buffer) {
  const { rows, problems } = await readRows(buffer);
  const phases = buildTree(rows, problems);

  const pool = await getPool();
  const proj = (await pool.request().input('id', sql.Int, projectId)
    .query(`SELECT planned_start AS plannedStart, is_active AS isActive, is_deleted AS isDeleted FROM pm_projects WHERE project_id=@id`)).recordset[0];
  if (!proj || proj.isDeleted) throw httpError(404, 'Project not found.');
  if (proj.isActive === false) throw httpError(409, 'This project is inactive — reactivate it before importing.');
  const existing = (await pool.request().input('id', sql.Int, projectId)
    .query(`SELECT COUNT(*) AS n FROM pm_phases WHERE project_id=@id AND is_deleted=0 AND is_active=1`)).recordset[0].n;
  if (existing > 0) throw httpError(409, `This project already has ${existing} phase${existing === 1 ? '' : 's'}. An Excel import fills an empty project — remove the existing phases first, or import into a new project.`);

  const activities = phases.flatMap(p => p.activities);
  const tasks = activities.flatMap(a => a.tasks);
  if (!phases.length) problems.push({ row: 2, column: 'Phase *', message: 'No phases found.' });
  if (phases.length > LIMITS.phases) problems.push({ row: 2, column: 'Phase *', message: `More than ${LIMITS.phases} phases in one import.` });
  if (activities.length > LIMITS.activities) problems.push({ row: 2, column: 'Activity *', message: `More than ${LIMITS.activities} activities in one import.` });
  if (tasks.length > LIMITS.tasks) problems.push({ row: 2, column: 'Task', message: `More than ${LIMITS.tasks} tasks in one import.` });

  // Weights, per sibling group.
  if (phases.length) resolveWeights(phases, 'Phase', problems);
  for (const p of phases) {
    if (!p.activities.length) { problems.push({ row: p.row, column: 'Activity *', message: `Phase "${p.name}" has no activity.` }); continue; }
    resolveWeights(p.activities, 'Activity', problems);
    for (const a of p.activities) if (a.tasks.length) resolveWeights(a.tasks, 'Task', problems);
  }

  // Dates (the same rules the create services enforce, reported with row numbers up front).
  const projectStart = proj.plannedStart ? new Date(proj.plannedStart).toISOString().slice(0, 10) : null;
  for (const p of phases) {
    if (p.start && p.end && p.end < p.start) problems.push({ row: p.row, column: 'Phase End', message: `Phase "${p.name}" ends before it starts.` });
    if (p.start && projectStart && p.start < projectStart) problems.push({ row: p.row, column: 'Phase Start', message: `Phase "${p.name}" starts before the project's start date (${projectStart}).` });
    for (const a of p.activities) {
      if (a.start && a.end && a.end < a.start) problems.push({ row: a.row, column: 'Activity End', message: `Activity "${a.name}" ends before it starts.` });
      if (a.start && p.start && a.start < p.start) problems.push({ row: a.row, column: 'Activity Start', message: `Activity "${a.name}" starts before its phase "${p.name}" (${p.start}).` });
      for (const t of a.tasks) {
        const known = t.priority ? PRIORITIES.find(x => x.toLowerCase() === t.priority.toLowerCase()) : 'Medium';
        if (!known) problems.push({ row: t.row, column: 'Priority', message: `"${t.priority}" is not a priority. Use Low, Medium, High or Critical.` });
        t.priority = known || 'Medium';
        const status = t.status ? STATUS_ALIASES[t.status.toLowerCase()] : 'To Do';
        if (!status) problems.push({ row: t.row, column: 'Task Status', message: `"${t.status}" is not a status. Use To Do, Ongoing or Complete.` });
        t.status = status || 'To Do';
        if (t.start && t.due && t.due < t.start) problems.push({ row: t.row, column: 'Task Due Date', message: `Task "${t.name}" is due before it starts.` });
        if (t.start && a.start && t.start < a.start) problems.push({ row: t.row, column: 'Task Start', message: `Task "${t.name}" starts before its activity "${a.name}" (${a.start}).` });
      }
    }
  }

  // People, by email.
  const emailRows = [];   // { email, row, column }
  for (const a of activities) {
    if (a.ownerEmail) emailRows.push({ email: a.ownerEmail, row: a.ownerRow, column: 'Activity Owner Email' });
    for (const t of a.tasks) for (const e of new Set(t.assignees)) emailRows.push({ email: e, row: t.row, column: 'Task Assignee Emails' });
  }
  const users = await lookupUsers(emailRows.map(x => x.email).filter(e => EMAIL_RE.test(e)));
  const idOf = new Map();   // email -> userId (only for valid, active users)
  for (const { email, row, column } of emailRows) {
    if (!EMAIL_RE.test(email)) { problems.push({ row, column, message: `"${email}" is not a valid email address.` }); continue; }
    const u = users.get(email);
    if (!u) { problems.push({ row, column, message: `No Specula user has the email ${email}.` }); continue; }
    if (u.isActive === false) { problems.push({ row, column, message: `${email} is an inactive user.` }); continue; }
    idOf.set(email, u.userId);
  }
  for (const a of activities) {
    a.ownerId = a.ownerEmail ? (idOf.get(a.ownerEmail) || null) : null;
    for (const t of a.tasks) t.assigneeIds = [...new Set(t.assignees)].map(e => idOf.get(e)).filter(Boolean);
  }

  problems.sort((x, y) => x.row - y.row);
  return { phases, problems, counts: { phases: phases.length, activities: activities.length, tasks: tasks.length } };
}

// ── Public API ───────────────────────────────────────────────────────────────

async function previewImport(projectId, buffer) {
  const { phases, problems, counts } = await analyse(projectId, buffer);
  return {
    ok: problems.length === 0,
    counts,
    problems: problems.slice(0, 100),
    moreProblems: Math.max(0, problems.length - 100),
    outline: problems.length ? [] : phases.map(p => ({
      name: p.name, weightage: p.weightage, start: p.start || null, end: p.end || null,
      activities: p.activities.map(a => ({ name: a.name, weightage: a.weightage, tasks: a.tasks.length, owner: a.ownerEmail || null })),
    })),
  };
}

async function removePhases(phaseIds) {
  if (!phaseIds.length) return;
  const pool = await getPool();
  const req = pool.request();
  const params = phaseIds.map((id, i) => { req.input(`p${i}`, sql.Int, id); return `@p${i}`; });
  // The chat threads made for these activities/tasks hide with them (soft delete, like the rest of the app),
  // so a rolled-back import leaves nothing behind in anyone's conversation list.
  const convs = (await req.query(`
    SELECT pat.conversation_id AS id FROM pm_activity_threads pat
      JOIN pm_activities a ON a.activity_id = pat.activity_id WHERE a.phase_id IN (${params.join(',')})
    UNION
    SELECT ptt.conversation_id FROM pm_task_threads ptt
      JOIN pm_tasks t ON t.task_id = ptt.task_id JOIN pm_activities a ON a.activity_id = t.activity_id WHERE a.phase_id IN (${params.join(',')})`)).recordset.map(r => r.id);
  // Activities, tasks, requests, threads and proof rows go with their phase (all cascade).
  await pool.request().query(`DELETE FROM pm_phases WHERE phase_id IN (${phaseIds.map(Number).join(',')})`);
  if (convs.length) {
    await pool.request().query(`UPDATE comm_conversations SET is_deleted = 1 WHERE conversation_id IN (${convs.map(c => `'${c}'`).join(',')})`);
  }
}

async function runImport(projectId, userId, buffer) {
  const { phases, problems, counts } = await analyse(projectId, buffer);
  if (problems.length) throw httpError(400, `The file has ${problems.length} problem${problems.length === 1 ? '' : 's'}. Fix them and upload again.`, { problems: problems.slice(0, 100) });

  const createdPhaseIds = [];
  try {
    for (const p of phases) {
      const phase = await phaseService.createPhase(projectId, userId, {
        name: p.name, plannedStart: p.start || null, plannedEnd: p.end || null, weightage: p.weightage,
      });
      createdPhaseIds.push(phase.phaseId);
      for (const a of p.activities) {
        const activity = await activityService.createActivity(phase.phaseId, projectId, userId, {
          name: a.name, plannedStart: a.start || null, plannedEnd: a.end || null, weightage: a.weightage, ownerId: a.ownerId || null,
        });
        for (const t of a.tasks) {
          const task = await taskService.createTask(activity.activityId, projectId, userId, {
            name: t.name, description: t.description, priority: t.priority, startDate: t.start || null, dueDate: t.due || null,
            weightage: t.weightage, assigneeIds: t.assigneeIds,
          });
          // A task that is already Ongoing / Complete (for example when a finished project is rebuilt) is
          // moved there through the normal status change, so progress and the audit log follow.
          if (t.status !== 'To Do') await taskService.updateTaskStatus(task.taskId, projectId, userId, t.status, 'Manager', false);
        }
      }
    }
  } catch (err) {
    try { await removePhases(createdPhaseIds); }
    catch (cleanupErr) { console.error('[pm:import] rollback failed:', cleanupErr.message); err.message += ' (Some of the imported rows could not be cleaned up — please check the project.)'; }
    throw err;
  }
  return { imported: true, counts };
}

// ── The downloadable format ──────────────────────────────────────────────────

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);

/** The sample workbook. Dates start from `startIso` (the project's start, else today) so the sample imports as it is. */
async function buildTemplateWorkbook(startIso) {
  const d0 = startIso || new Date().toISOString().slice(0, 10);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Specula';

  // ---- Plan ----
  const ws = wb.addWorksheet(SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map(c => ({ key: c.key, header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.height = 30;
  head.eachCell((cell) => {
    const required = String(cell.value).includes('*');
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: required ? 'FFD8320C' : 'FF334456' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });

  // Dummy data: an interior fit-out project. Weights add up to 100 in every group.
  const D = addDays;
  const S = [
    // phase, pStart, pEnd, pW, activity, aStart, aEnd, aW, owner, task, priority, tStart, tDue, tW, assignees, desc
    ['Design & Approval', d0, D(d0, 20), 40, 'Concept design', d0, D(d0, 9), 50, null, 'Prepare mood board and material palette', 'High', d0, D(d0, 4), 50, null, 'Three themes with material samples'],
    [null, null, null, null, null, null, null, null, null, 'Client walkthrough of the concept', 'Medium', D(d0, 5), D(d0, 9), 50, null, null],
    [null, null, null, null, 'Working drawings', D(d0, 10), D(d0, 20), 50, null, 'Prepare floor plan and furniture layout', 'High', D(d0, 10), D(d0, 15), 60, null, null],
    [null, null, null, null, null, null, null, null, null, 'Get client sign-off on drawings', 'Critical', D(d0, 16), D(d0, 20), 40, null, 'Signed copy can be attached to the task as proof'],
    ['Execution', D(d0, 21), D(d0, 60), 60, 'Civil and partition work', D(d0, 21), D(d0, 40), 60, null, 'Mark layout on site', 'Medium', D(d0, 21), D(d0, 24), 30, null, null],
    [null, null, null, null, null, null, null, null, null, 'Build partitions and ceiling frame', 'High', D(d0, 25), D(d0, 40), 70, null, null],
    [null, null, null, null, 'Electrical and lighting', D(d0, 41), D(d0, 60), 40, null, 'Complete wiring and fixture installation', 'High', D(d0, 41), D(d0, 55), 70, null, null],
    [null, null, null, null, null, null, null, null, null, 'Final testing and handover checklist', 'Low', D(d0, 56), D(d0, 60), 30, null, null],
  ];
  const dateKeys = ['phaseStart', 'phaseEnd', 'actStart', 'actEnd', 'taskStart', 'taskDue'];
  S.forEach(r => {
    const row = ws.addRow(r);
    for (const k of dateKeys) { const c = row.getCell(colLetter(k)); if (typeof c.value === 'string' && c.value) c.value = asDate(c.value); }
  });
  for (let r = 2; r <= 300; r++) {
    for (const k of dateKeys) ws.getCell(`${colLetter(k)}${r}`).numFmt = 'yyyy-mm-dd';
    ws.getCell(`${colLetter('taskStatus')}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"To Do,Ongoing,Complete"'], showErrorMessage: true, errorTitle: 'Task Status', error: 'Choose To Do, Ongoing or Complete.' };
    ws.getCell(`${colLetter('priority')}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Low,Medium,High,Critical"'], showErrorMessage: true, errorTitle: 'Priority', error: 'Choose Low, Medium, High or Critical.' };
  }
  ws.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

  // ---- How to fill ----
  const help = wb.addWorksheet('How to fill');
  help.getColumn(1).width = 26; help.getColumn(2).width = 100;
  const lines = [
    ['How this file works', ''],
    ['The sheet', 'Fill the "Plan" sheet: one row per task. Phase, Activity and Task make up the project structure. Delete the sample rows and type your own.'],
    ['Required', 'Phase and Activity (red headings). A Task is optional: an Activity with no Task name is created without tasks.'],
    ['Repeating names', 'Leave Phase or Activity blank to mean "same as the row above". You can also repeat the name; the same name in the same group is read as one item.'],
    ['Dates', 'Write dates as YYYY-MM-DD (2026-03-31) or DD/MM/YYYY. An activity cannot start before its phase, and a phase cannot start before the project\'s start date. Dates are optional.'],
    ['Weights (%)', 'Each group of siblings (the phases of the project, the activities of a phase, the tasks of an activity) must add up to 100. Leave ALL of a group blank for an equal split. Mixing filled and blank weights in one group is not allowed.'],
    ['Priority', 'Low, Medium, High or Critical. Blank = Medium.'],
    ['Task Status', 'Optional, last column. To Do, Ongoing or Complete. Blank = To Do. Use it when you rebuild a project that is already under way.'],
    ['Activity Owner Email', 'Optional. The person becomes the Manager of that activity. Must be the email of an active Specula user.'],
    ['Task Assignee Emails', 'Optional. One or more emails separated by commas. Each person gets an assignment request that they accept from their dashboard, the same as when a task is assigned by hand.'],
    ['Importing', 'Open the project, press "Import from Excel", choose this file and check the preview. Nothing is created until you confirm.'],
    ['Good to know', 'An import fills an EMPTY project (one with no phases yet). Dependencies between items are not part of the file; add them in the project afterwards. Up to 1500 rows per file.'],
  ];
  lines.forEach((l, i) => {
    const row = help.addRow(l);
    row.getCell(1).font = i === 0 ? { bold: true, size: 14 } : { bold: true };
    row.getCell(1).alignment = { vertical: 'top' };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  });

  return wb;
}

module.exports = { previewImport, runImport, buildTemplateWorkbook, COLUMNS };
