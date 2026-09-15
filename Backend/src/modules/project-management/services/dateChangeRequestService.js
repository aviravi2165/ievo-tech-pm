'use strict';

/**
 * dateChangeRequestService — the "date lock + approval" feature.
 *
 * Once a Project/Phase/Activity/Task has a planned date set, changing it
 * directly is blocked (assertDateFieldsAllowed, called from the 4 update
 * services). Instead the requester submits a request (reason + chosen
 * approver); the approver approves (applies the change) or rejects it (no
 * change). Admins bypass the lock entirely, same as everywhere else in this
 * module.
 *
 * Who can be an approver is now a CURATED, global list — an admin, or a
 * user an admin has explicitly designated via pm_date_approvers (see
 * listApprovers/addApprover/removeApprover) — no longer any project member.
 * Project membership is irrelevant to approving: a designated approver can
 * decide requests on projects they're not even a member of, which is why
 * listForApprover/listHistoryForApprover work globally (no projectId
 * required) — that's the surface those approvers actually use.
 */

const { getPool, sql } = require('../../../config/db');
const audit = require('./auditService');

// Which table/column each entity type's lockable date fields map to.
const ENTITY_META = {
  project:  { table: 'pm_projects',   idCol: 'project_id',  fields: { plannedStart: 'planned_start', plannedEnd: 'planned_end' } },
  phase:    { table: 'pm_phases',     idCol: 'phase_id',    fields: { plannedStart: 'planned_start', plannedEnd: 'planned_end' } },
  activity: { table: 'pm_activities', idCol: 'activity_id', fields: { plannedStart: 'planned_start', plannedEnd: 'planned_end' } },
  task:     { table: 'pm_tasks',      idCol: 'task_id',     fields: { startDate: 'start_date', dueDate: 'due_date' } },
};
// Column used as a human-readable label for each entity type in request lists.
const NAME_COL = { project: 'name', phase: 'name', activity: 'name', task: 'name' };

function toDateStr(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Called from projectService.updateProject / phaseService.updatePhase /
 * activityService.updateActivity / taskService.updateTask BEFORE they apply
 * a body's date fields. `changes` is only the date keys actually present in
 * the request body, e.g. { plannedStart: '2026-01-01' }. Throws a 409 with
 * `.code = 'DATE_LOCKED'` and `.meta` (for the frontend to open the request
 * flow) if a field that already has a value is being changed by a non-admin.
 */
async function assertDateFieldsAllowed(entityType, entityId, changes, isAdmin, projectId) {
  if (isAdmin) return;
  const meta = ENTITY_META[entityType];
  if (!meta) return;
  const relevant = Object.keys(changes || {}).filter(k => meta.fields[k] !== undefined && changes[k] !== undefined);
  if (!relevant.length) return;

  const pool = await getPool();
  const cols = relevant.map(k => `${meta.fields[k]} AS ${k}`).join(', ');
  const r = await pool.request().input('id', sql.Int, entityId)
    .query(`SELECT ${cols} FROM ${meta.table} WHERE ${meta.idCol} = @id`);
  const current = r.recordset[0];
  if (!current) return;

  for (const field of relevant) {
    const oldStr = toDateStr(current[field]);
    const newStr = toDateStr(changes[field]);
    if (oldStr && oldStr !== newStr) {
      const e = new Error(
        `This ${entityType}'s ${field === 'plannedStart' || field === 'startDate' ? 'start date' : 'end/due date'} is locked once set — submit a date-change request for approval instead.`
      );
      e.statusCode = 409;
      e.code = 'DATE_LOCKED';
      e.meta = { entityType, entityId, field, oldValue: oldStr, newValue: newStr, projectId };
      throw e;
    }
  }
}

// Is this user allowed to be picked as an approver at all? An admin, or a
// user an admin has explicitly designated (pm_date_approvers) — global,
// not scoped to any one project.
async function isValidApprover(userId) {
  const pool = await getPool();
  const r = await pool.request().input('userId', sql.UniqueIdentifier, userId).query(`
    SELECT 1 AS ok
    FROM auth_users u
    WHERE u.user_id = @userId AND u.is_active = 1
      AND (u.user_type = 'admin' OR EXISTS (SELECT 1 FROM pm_date_approvers a WHERE a.user_id = @userId))
  `);
  return r.recordset.length > 0;
}

// Every eligible approver — every active admin, UNION the designated list —
// for the requester's approver picker (a fixed list now, not a free search).
async function listEligibleApprovers() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT user_id AS userId,
           COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''), email) AS name,
           email
    FROM auth_users
    WHERE is_active = 1 AND (
      user_type = 'admin'
      OR user_id IN (SELECT user_id FROM pm_date_approvers)
    )
    ORDER BY name
  `);
  return r.recordset;
}

// ── Approver management (admin-only, route-gated) ──────────────────────────
async function listApprovers() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT a.user_id AS userId,
           COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
           u.email, a.added_at AS addedAt,
           COALESCE(NULLIF(TRIM(CONCAT(bu.first_name,' ',bu.last_name)),''), bu.email) AS addedByName
    FROM pm_date_approvers a
    INNER JOIN auth_users u ON u.user_id = a.user_id AND u.is_active = 1
    LEFT JOIN  auth_users bu ON bu.user_id = a.added_by
    ORDER BY u.first_name, u.last_name
  `);
  return r.recordset;
}

async function addApprover(targetUserId, addedBy) {
  const pool = await getPool();
  await pool.request().input('userId', sql.UniqueIdentifier, targetUserId).input('addedBy', sql.UniqueIdentifier, addedBy)
    .query(`IF NOT EXISTS (SELECT 1 FROM pm_date_approvers WHERE user_id=@userId)
              INSERT INTO pm_date_approvers (user_id, added_by) VALUES (@userId, @addedBy)`);
  return listApprovers();
}

async function removeApprover(targetUserId) {
  const pool = await getPool();
  await pool.request().input('userId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_date_approvers WHERE user_id=@userId`);
  return listApprovers();
}

async function createRequest({ projectId, entityType, entityId, field, newValue, reason, requestedBy, approverId }) {
  const meta = ENTITY_META[entityType];
  if (!meta || !meta.fields[field]) { const e = new Error('Invalid entity type or field.'); e.statusCode = 400; throw e; }
  if (!reason?.trim()) { const e = new Error('A reason is required.'); e.statusCode = 400; throw e; }
  if (!newValue) { const e = new Error('A new date is required.'); e.statusCode = 400; throw e; }
  if (!approverId) { const e = new Error('Please choose who should approve this change.'); e.statusCode = 400; throw e; }
  if (!(await isValidApprover(approverId))) {
    const e = new Error('The chosen approver must be an admin or an approver an admin has added.'); e.statusCode = 400; throw e;
  }

  const pool = await getPool();
  const cur = await pool.request().input('id', sql.Int, entityId)
    .query(`SELECT ${meta.fields[field]} AS val FROM ${meta.table} WHERE ${meta.idCol} = @id`);
  const oldValue = toDateStr(cur.recordset[0]?.val);

  const ins = await pool.request()
    .input('projectId',   sql.Int,              projectId)
    .input('entityType',  sql.NVarChar(20),     entityType)
    .input('entityId',    sql.Int,              entityId)
    .input('field',       sql.NVarChar(20),     field)
    .input('oldValue',    sql.Date,             oldValue)
    .input('newValue',    sql.Date,             newValue)
    .input('reason',      sql.NVarChar(500),    reason.trim())
    .input('requestedBy', sql.UniqueIdentifier, requestedBy)
    .input('approverId',  sql.UniqueIdentifier, approverId)
    .query(`
      INSERT INTO pm_date_change_requests
        (project_id, entity_type, entity_id, field_changed, old_value, new_value, reason, requested_by, approver_id)
      OUTPUT INSERTED.request_id AS requestId
      VALUES (@projectId, @entityType, @entityId, @field, @oldValue, @newValue, @reason, @requestedBy, @approverId)
    `);

  await audit.log({ entityType, entityId, projectId, userId: requestedBy, action: 'date_change_requested', fieldChanged: field, oldValue, newValue });
  return getRequestById(ins.recordset[0].requestId);
}

const SELECT_BASE = `
  SELECT r.request_id AS requestId, r.project_id AS projectId, r.entity_type AS entityType, r.entity_id AS entityId,
         r.field_changed AS fieldChanged, r.old_value AS oldValue, r.new_value AS newValue, r.reason,
         r.status, r.decision_note AS decisionNote, r.decided_at AS decidedAt, r.created_at AS createdAt,
         p.name AS projectName,
         r.requested_by AS requestedById,
         COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''), ru.email) AS requestedByName,
         r.approver_id AS approverId,
         COALESCE(NULLIF(TRIM(CONCAT(au.first_name,' ',au.last_name)),''), au.email) AS approverName,
         r.decided_by AS decidedById,
         COALESCE(NULLIF(TRIM(CONCAT(du.first_name,' ',du.last_name)),''), du.email) AS decidedByName
  FROM pm_date_change_requests r
  INNER JOIN pm_projects p    ON p.project_id = r.project_id
  INNER JOIN auth_users  ru   ON ru.user_id   = r.requested_by
  INNER JOIN auth_users  au   ON au.user_id   = r.approver_id
  LEFT JOIN  auth_users  du   ON du.user_id   = r.decided_by
`;

// Resolve each row's entity display name (small N — one query per distinct
// entity type present in the result set, not per row).
async function attachEntityNames(rows) {
  const byType = {};
  for (const row of rows) (byType[row.entityType] ||= new Set()).add(row.entityId);
  const names = {};
  const pool = await getPool();
  for (const [entityType, idSet] of Object.entries(byType)) {
    const meta = ENTITY_META[entityType];
    if (!meta) continue;
    const ids = [...idSet];
    const req = pool.request();
    const placeholders = ids.map((id, i) => { req.input(`id${i}`, sql.Int, id); return `@id${i}`; }).join(',');
    const r = await req.query(`SELECT ${meta.idCol} AS id, ${NAME_COL[entityType]} AS name FROM ${meta.table} WHERE ${meta.idCol} IN (${placeholders})`);
    for (const row of r.recordset) names[`${entityType}:${row.id}`] = row.name;
  }
  return rows.map(row => ({ ...row, entityName: names[`${row.entityType}:${row.entityId}`] || `${row.entityType} #${row.entityId}` }));
}

async function getRequestById(requestId) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, requestId).query(`${SELECT_BASE} WHERE r.request_id = @id`);
  const [row] = await attachEntityNames(r.recordset);
  return row || null;
}

// Requests pending THIS user's approval (optionally scoped to one project;
// omit projectId for a designated approver's global "awaiting you" list —
// they need this to work across projects they aren't even a member of).
async function listForApprover(userId, projectId) {
  const pool = await getPool();
  const req = pool.request().input('userId', sql.UniqueIdentifier, userId);
  let where = `r.approver_id = @userId AND r.status = 'pending'`;
  if (projectId) { req.input('projectId', sql.Int, projectId); where += ` AND r.project_id = @projectId`; }
  const r = await req.query(`${SELECT_BASE} WHERE ${where} ORDER BY r.created_at DESC`);
  return attachEntityNames(r.recordset);
}

// Full log (any status) of every request ever addressed to this approver —
// "who requested this, and why" — across all projects. The visibility an
// admin-designated approver needs since they may not be a member of the
// project the request came from.
async function listHistoryForApprover(userId) {
  const pool = await getPool();
  const r = await pool.request().input('userId', sql.UniqueIdentifier, userId)
    .query(`${SELECT_BASE} WHERE r.approver_id = @userId ORDER BY r.created_at DESC`);
  return attachEntityNames(r.recordset);
}

// Everything this user has requested (any status, optionally scoped to one project).
async function listMine(userId, projectId) {
  const pool = await getPool();
  const req = pool.request().input('userId', sql.UniqueIdentifier, userId);
  let where = `r.requested_by = @userId`;
  if (projectId) { req.input('projectId', sql.Int, projectId); where += ` AND r.project_id = @projectId`; }
  const r = await req.query(`${SELECT_BASE} WHERE ${where} ORDER BY r.created_at DESC`);
  return attachEntityNames(r.recordset);
}

async function decide(requestId, actorId, isAdmin, action, note) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, requestId).query(`
    SELECT request_id AS requestId, project_id AS projectId, entity_type AS entityType, entity_id AS entityId,
           field_changed AS fieldChanged, new_value AS newValue, approver_id AS approverId, status
    FROM pm_date_change_requests WHERE request_id = @id
  `);
  const request = r.recordset[0];
  if (!request) { const e = new Error('Request not found.'); e.statusCode = 404; throw e; }
  if (request.status !== 'pending') { const e = new Error('This request has already been decided.'); e.statusCode = 409; throw e; }
  if (!isAdmin && String(actorId) !== String(request.approverId)) {
    const e = new Error('Only the chosen approver (or an admin) can decide this request.'); e.statusCode = 403; throw e;
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  if (action === 'approve') {
    const meta = ENTITY_META[request.entityType];
    const col = meta.fields[request.fieldChanged];
    await pool.request().input('id', sql.Int, request.entityId).input('val', sql.Date, request.newValue)
      .query(`UPDATE ${meta.table} SET ${col} = @val WHERE ${meta.idCol} = @id`);
    await audit.log({
      entityType: request.entityType, entityId: request.entityId, projectId: request.projectId, userId: actorId,
      action: 'date_change_approved', fieldChanged: request.fieldChanged, newValue: request.newValue,
    });
  } else {
    await audit.log({
      entityType: request.entityType, entityId: request.entityId, projectId: request.projectId, userId: actorId,
      action: 'date_change_rejected', fieldChanged: request.fieldChanged, newValue: request.newValue,
    });
  }

  await pool.request().input('id', sql.Int, requestId).input('status', sql.NVarChar(20), newStatus)
    .input('decidedBy', sql.UniqueIdentifier, actorId).input('note', sql.NVarChar(500), note || null)
    .query(`UPDATE pm_date_change_requests SET status=@status, decided_by=@decidedBy, decided_at=SYSDATETIMEOFFSET(), decision_note=@note WHERE request_id=@id`);

  return getRequestById(requestId);
}

async function cancel(requestId, actorId) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, requestId).query(
    `SELECT requested_by AS requestedBy, status FROM pm_date_change_requests WHERE request_id = @id`
  );
  const row = r.recordset[0];
  if (!row) { const e = new Error('Request not found.'); e.statusCode = 404; throw e; }
  if (String(row.requestedBy) !== String(actorId)) { const e = new Error('Only the requester can cancel this.'); e.statusCode = 403; throw e; }
  if (row.status !== 'pending') { const e = new Error('This request has already been decided.'); e.statusCode = 409; throw e; }
  await pool.request().input('id', sql.Int, requestId).query(`UPDATE pm_date_change_requests SET status='cancelled' WHERE request_id=@id`);
  return getRequestById(requestId);
}

module.exports = {
  assertDateFieldsAllowed, createRequest, listForApprover, listHistoryForApprover, listMine, decide, cancel, getRequestById,
  isValidApprover, listEligibleApprovers, listApprovers, addApprover, removeApprover,
};
