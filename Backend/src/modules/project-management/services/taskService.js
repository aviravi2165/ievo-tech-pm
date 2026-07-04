'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded } = require('./dependencyService');
const { broadcastStatusChanged, broadcastUnblocked, broadcastAssignmentRequest } = require('../socket/socketHandler');
const pmChatService = require('./pmChatService');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIdList(val) {
  if (!val) return [];
  return String(val).split(',').filter(Boolean).map(Number);
}

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// Task statuses: To Do / Ongoing / Complete / Blocked
// (In Progress → Ongoing, Done → Complete, In Review removed)
const DONE_STATUS = 'Complete';

// ── Fetch tasks ───────────────────────────────────────────────────────────────

async function getTasksForActivity(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT t.task_id       AS taskId,
             t.activity_id  AS activityId,
             t.name, t.description, t.priority, t.status,
             t.due_date      AS dueDate,
             t.estimated_hours AS estimatedHours,
             t.created_at   AS createdAt,
             CASE WHEN t.due_date < CAST(GETDATE() AS DATE) AND t.status <> 'Complete'
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isOverdue,
             -- Accepted assignees (confirmed participants)
             (
               SELECT CAST(r.assignee_id AS NVARCHAR(36)) AS userId,
                      COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
                      r.status AS requestStatus
               FROM pm_task_assignment_requests r
               LEFT JOIN auth_users u ON u.user_id = r.assignee_id
               WHERE r.task_id = t.task_id AND r.status = 'Accepted'
               FOR JSON PATH
             ) AS assignees,
             -- All requests (for showing pending/declined badges)
             (
               SELECT CAST(r.assignee_id AS NVARCHAR(36)) AS userId,
                      COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
                      r.status AS requestStatus,
                      r.request_id AS requestId
               FROM pm_task_assignment_requests r
               LEFT JOIN auth_users u ON u.user_id = r.assignee_id
               WHERE r.task_id = t.task_id
               FOR JSON PATH
             ) AS allRequests,
             (
               SELECT STRING_AGG(CAST(depends_on_task_id AS VARCHAR(20)), ',')
               FROM pm_task_deps WHERE task_id = t.task_id
             ) AS dependsOn,
             -- Whether a chat thread already exists for this task (frontend uses this
             -- to decide whether to show "Open Chat" vs "Chat available once assigned")
             (
               SELECT CAST(CASE WHEN EXISTS (SELECT 1 FROM pm_task_threads WHERE task_id = t.task_id) THEN 1 ELSE 0 END AS BIT)
             ) AS hasThread
      FROM pm_tasks t
      WHERE t.activity_id = @activityId AND t.is_deleted = 0
      ORDER BY t.created_at
    `);

  return result.recordset.map(r => ({
    ...r,
    assignees:   parseJsonArray(r.assignees),
    allRequests: parseJsonArray(r.allRequests),
    dependsOn:   parseIdList(r.dependsOn),
  }));
}

// ── Create task + send assignment requests ────────────────────────────────────
//
// When a manager creates a task and selects assignees, each one gets an
// assignment REQUEST (status = Pending) — not a direct insert into
// pm_task_assignees. The request appears on the assignee's Dashboard.
// pm_task_assignees is no longer written here; accepted requests populate
// pm_activity_members (via acceptAssignmentRequest below).
//
// A task's Shared/CC chat thread is created immediately, seeded with the
// creator + the Activity's Manager(s) — assignees are added to it (and to
// the Activity's group thread) once they actually accept, in
// acceptAssignmentRequest.

async function createTask(activityId, projectId, userId, body) {
  const { name, description, priority = 'Medium', dueDate, estimatedHours, assigneeIds = [] } = body;
  if (!name?.trim()) { const e = new Error('Task name required'); e.statusCode = 400; throw e; }

  let task;
  await withTransaction(async (req) => {
    const result = await req()
      .input('activityId',     sql.Int,              activityId)
      .input('name',           sql.NVarChar(200),    name.trim())
      .input('description',    sql.NVarChar(sql.MAX),description || null)
      .input('priority',       sql.NVarChar(20),     priority)
      .input('dueDate',        sql.Date,             dueDate || null)
      .input('estimatedHours', sql.Decimal(5, 1),    estimatedHours || null)
      .input('userId',         sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO pm_tasks (activity_id, name, description, priority, due_date, estimated_hours, created_by)
        OUTPUT INSERTED.task_id AS taskId, INSERTED.name, INSERTED.status
        VALUES (@activityId, @name, @description, @priority, @dueDate, @estimatedHours, @userId)
      `);
    task = result.recordset[0];

    // Send an assignment request to each chosen assignee
    for (const uid of [...new Set(assigneeIds)]) {
      await req()
        .input('taskId',      sql.Int,              task.taskId)
        .input('assigneeId',  sql.UniqueIdentifier, uid)
        .input('requestedBy', sql.UniqueIdentifier, userId)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM pm_task_assignment_requests
            WHERE task_id = @taskId AND assignee_id = @assigneeId
          )
            INSERT INTO pm_task_assignment_requests (task_id, assignee_id, requested_by)
            VALUES (@taskId, @assigneeId, @requestedBy)
        `);
    }
  });

  // Notify assignees via socket so their future Dashboard badge updates live
  for (const uid of assigneeIds) {
    broadcastAssignmentRequest(uid, { taskId: task.taskId, taskName: task.name, projectId });
  }

  await audit.log({ entityType:'task', entityId:task.taskId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });

  // Seed the task's chat thread now (creator + Activity Manager(s)). Assignees
  // join once they accept — see acceptAssignmentRequest.
  await pmChatService.ensureTaskThread(task.taskId);

  return { ...task, allRequests: assigneeIds.map(uid => ({ userId: uid, requestStatus: 'Pending' })) };
}

// ── Fetch pending assignment requests for a user ──────────────────────────────
// Called by the Dashboard module — returns everything the user needs to
// render a "you've been assigned to task X in project Y — accept / decline?"
// card.

async function getMyAssignmentRequests(userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        r.request_id    AS requestId,
        r.task_id       AS taskId,
        r.status,
        r.created_at    AS createdAt,
        r.responded_at  AS respondedAt,
        t.name          AS taskName,
        t.description   AS taskDescription,
        t.priority,
        t.due_date      AS dueDate,
        t.status        AS taskStatus,
        -- activity
        a.activity_id   AS activityId,
        a.name          AS activityName,
        -- phase
        ph.phase_id     AS phaseId,
        ph.name         AS phaseName,
        -- project
        p.project_id    AS projectId,
        p.name          AS projectName,
        -- requested by
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS requestedByName
      FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks      t  ON t.task_id      = r.task_id
      INNER JOIN pm_activities a  ON a.activity_id  = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id    = a.phase_id
      INNER JOIN pm_projects   p  ON p.project_id   = ph.project_id
      INNER JOIN auth_users    u  ON u.user_id       = r.requested_by
      WHERE r.assignee_id = @userId
        AND t.is_deleted  = 0
        AND a.is_deleted  = 0
        AND ph.is_deleted = 0
        AND p.is_deleted  = 0
      ORDER BY r.created_at DESC
    `);
  return result.recordset;
}

// ── Accept / Decline request ──────────────────────────────────────────────────

async function acceptAssignmentRequest(requestId, userId) {
  const pool = await getPool();

  // Load the request (verify it belongs to this user and is still Pending)
  const reqResult = await pool.request()
    .input('requestId', sql.Int,              requestId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      SELECT r.request_id, r.task_id, r.status, t.activity_id, ph.project_id
      FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks      t  ON t.task_id     = r.task_id
      INNER JOIN pm_activities a  ON a.activity_id = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id   = a.phase_id
      WHERE r.request_id = @requestId AND r.assignee_id = @userId
    `);

  const row = reqResult.recordset[0];
  if (!row) { const e = new Error('Request not found'); e.statusCode = 404; throw e; }
  if (row.status !== 'Pending') { const e = new Error('Request already responded to'); e.statusCode = 400; throw e; }

  await withTransaction(async (req) => {
    // Mark request as Accepted
    await req()
      .input('requestId', sql.Int,              requestId)
      .input('userId',    sql.UniqueIdentifier, userId)
      .query(`
        UPDATE pm_task_assignment_requests
        SET status = 'Accepted', responded_at = SYSDATETIMEOFFSET()
        WHERE request_id = @requestId AND assignee_id = @userId
      `);

    // Insert confirmed assignee into pm_task_assignees (the live lookup table)
    await req()
      .input('taskId', sql.Int,              row.task_id)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_task_assignees WHERE task_id = @taskId AND user_id = @userId)
          INSERT INTO pm_task_assignees (task_id, user_id) VALUES (@taskId, @userId)
      `);

    // Auto-add accepted user to the activity's member roster (default Employee —
    // never downgrades if they already hold a higher role there)
    await req()
      .input('activityId', sql.Int,              row.activity_id)
      .input('userId',     sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id = @activityId AND user_id = @userId)
          INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @userId, 'Employee')
      `);

    // Also ensure they're in pm_members as a project Member (so they can see the project)
    await req()
      .input('projectId', sql.Int,              row.project_id)
      .input('userId',    sql.UniqueIdentifier, userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_members WHERE project_id = @projectId AND user_id = @userId)
          INSERT INTO pm_members (project_id, user_id, role) VALUES (@projectId, @userId, 'Member')
      `);
  });

  await audit.log({ entityType:'task', entityId:row.task_id, projectId:row.project_id, userId, action:'assignment_accepted' });

  // Fully auto-sync: they now show up in both the task's Shared chat and
  // the Activity's group chat.
  await pmChatService.onAssigneeAccepted(row.task_id, row.activity_id);

  return { requestId, status: 'Accepted', taskId: row.task_id };
}

async function declineAssignmentRequest(requestId, userId) {
  const pool = await getPool();

  const reqResult = await pool.request()
    .input('requestId', sql.Int,              requestId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      SELECT r.request_id, r.task_id, r.status, ph.project_id
      FROM pm_task_assignment_requests r
      INNER JOIN pm_tasks      t  ON t.task_id     = r.task_id
      INNER JOIN pm_activities a  ON a.activity_id = t.activity_id
      INNER JOIN pm_phases     ph ON ph.phase_id   = a.phase_id
      WHERE r.request_id = @requestId AND r.assignee_id = @userId
    `);

  const row = reqResult.recordset[0];
  if (!row) { const e = new Error('Request not found'); e.statusCode = 404; throw e; }
  if (row.status !== 'Pending') { const e = new Error('Request already responded to'); e.statusCode = 400; throw e; }

  await pool.request()
    .input('requestId', sql.Int,              requestId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      UPDATE pm_task_assignment_requests
      SET status = 'Declined', responded_at = SYSDATETIMEOFFSET()
      WHERE request_id = @requestId AND assignee_id = @userId
    `);

  await audit.log({ entityType:'task', entityId:row.task_id, projectId:row.project_id, userId, action:'assignment_declined' });
  // Nothing to sync in chat — a Pending request was never added to either thread.
  return { requestId, status: 'Declined', taskId: row.task_id };
}

// ── Update / Delete task ──────────────────────────────────────────────────────

const TASK_FIELD_TYPES = {
  name:            sql.NVarChar(200),
  description:     sql.NVarChar(sql.MAX),
  priority:        sql.NVarChar(20),
  due_date:        sql.Date,
  estimated_hours: sql.Decimal(5, 1),
};

async function updateTask(taskId, projectId, userId, body) {
  const fields = {};
  if (body.name           !== undefined) fields.name            = body.name.trim();
  if (body.description    !== undefined) fields.description     = body.description;
  if (body.priority       !== undefined) fields.priority        = body.priority;
  if (body.dueDate        !== undefined) fields.due_date        = body.dueDate;
  if (body.estimatedHours !== undefined) fields.estimated_hours = body.estimatedHours;
  const keys = Object.keys(fields);
  if (keys.length) {
    const pool = await getPool();
    const req  = pool.request().input('taskId', sql.Int, taskId);
    const set  = keys.map((k, i) => { const ph = `f${i}`; req.input(ph, TASK_FIELD_TYPES[k], fields[k]); return `${k}=@${ph}`; }).join(', ');
    await req.query(`UPDATE pm_tasks SET ${set} WHERE task_id=@taskId`);
    for (const key of keys) await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  }
  return { taskId, ...fields };
}

async function updateTaskStatus(taskId, projectId, userId, newStatus, projectRole) {
  const pool = await getPool();
  const cur = await pool.request()
    .input('taskId', sql.Int,              taskId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT t.status,
        CAST(CASE WHEN EXISTS(SELECT 1 FROM pm_task_assignees WHERE task_id=@taskId AND user_id=@userId)
             THEN 1 ELSE 0 END AS BIT) AS isAssigned
      FROM pm_tasks t WHERE t.task_id=@taskId AND t.is_deleted=0
    `);
  if (!cur.recordset[0]) { const e = new Error('Task not found'); e.statusCode = 404; throw e; }
  if (projectRole === 'Member' && !cur.recordset[0].isAssigned) {
    const e = new Error('Members can only update their own assigned tasks'); e.statusCode = 403; throw e;
  }
  const oldStatus = cur.recordset[0].status;

  let unblockedIds = [];
  await withTransaction(async (req) => {
    await req()
      .input('status', sql.NVarChar(30), newStatus)
      .input('taskId', sql.Int,          taskId)
      .query(`UPDATE pm_tasks SET status=@status WHERE task_id=@taskId`);
    unblockedIds = newStatus === DONE_STATUS ? await resolveUnblocked(req, 'task', taskId) : [];
  });

  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'status_changed', fieldChanged:'status', oldValue:oldStatus, newValue:newStatus });
  broadcastStatusChanged(projectId, { entityType:'task', entityId:taskId, status:newStatus });
  if (unblockedIds.length) broadcastUnblocked(projectId, { entityType:'task', unblockedIds });
  return { taskId, status:newStatus, unblockedTaskIds:unblockedIds };
}

async function deleteTask(taskId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`UPDATE pm_tasks SET is_deleted=1 WHERE task_id=@taskId`);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'deleted' });
  // The task's chat thread (if any) is left intact for history — it simply
  // stops appearing as "linked to an open task" in the UI. Nothing to sync.
}

// ── Send a new assignment request (post-creation) ─────────────────────────────

async function sendAssignmentRequest(taskId, targetUserId, projectId, actorUserId) {
  const pool = await getPool();

  // Look up task name for the notification payload
  const taskResult = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT name FROM pm_tasks WHERE task_id=@taskId AND is_deleted=0`);
  if (!taskResult.recordset[0]) { const e = new Error('Task not found'); e.statusCode = 404; throw e; }

  await pool.request()
    .input('taskId',      sql.Int,              taskId)
    .input('assigneeId',  sql.UniqueIdentifier, targetUserId)
    .input('requestedBy', sql.UniqueIdentifier, actorUserId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM pm_task_assignment_requests WHERE task_id=@taskId AND assignee_id=@assigneeId)
        INSERT INTO pm_task_assignment_requests (task_id, assignee_id, requested_by)
        VALUES (@taskId, @assigneeId, @requestedBy)
    `);

  broadcastAssignmentRequest(targetUserId, { taskId, taskName: taskResult.recordset[0].name, projectId });
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId:actorUserId, action:'assignee_requested', newValue:targetUserId });
}

async function removeAssignmentRequest(taskId, targetUserId, projectId, actorUserId) {
  const pool = await getPool();

  const taskResult = await pool.request()
    .input('taskId', sql.Int, taskId)
    .query(`SELECT activity_id AS activityId FROM pm_tasks WHERE task_id=@taskId`);
  const activityId = taskResult.recordset[0]?.activityId;

  await pool.request()
    .input('taskId',     sql.Int,              taskId)
    .input('assigneeId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_task_assignment_requests WHERE task_id=@taskId AND assignee_id=@assigneeId`);
  // Also remove from confirmed assignees if they had accepted
  await pool.request()
    .input('taskId', sql.Int,              taskId)
    .input('userId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_task_assignees WHERE task_id=@taskId AND user_id=@userId`);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId:actorUserId, action:'assignee_removed', oldValue:targetUserId });

  // Fully auto-sync: drop them from the task thread, and from the Activity
  // thread too if this was their last accepted task in that activity.
  if (activityId) await pmChatService.onAssigneeRemoved(taskId, activityId);
}

// ── Dependency management ─────────────────────────────────────────────────────

async function addTaskDep(taskId, dependsOnId, projectId, userId) {
  await withTransaction(async (req) => {
    await req()
      .input('taskId',      sql.Int, taskId)
      .input('dependsOnId', sql.Int, dependsOnId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_task_deps WHERE task_id=@taskId AND depends_on_task_id=@dependsOnId)
          INSERT INTO pm_task_deps (task_id, depends_on_task_id) VALUES (@taskId, @dependsOnId)
      `);
    await blockIfNeeded(req, 'task', taskId, dependsOnId);
  });
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'dependency_added', newValue:dependsOnId });
}

async function removeTaskDep(taskId, dependsOnId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('taskId',      sql.Int, taskId)
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`DELETE FROM pm_task_deps WHERE task_id=@taskId AND depends_on_task_id=@dependsOnId`);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'dependency_removed', oldValue:dependsOnId });
}

// ── Chat thread lookup (used by taskRoutes GET /:id/chat) ──────────────────────

async function getOrCreateTaskThread(taskId) {
  return pmChatService.ensureTaskThread(taskId);
}

module.exports = {
  getTasksForActivity,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  sendAssignmentRequest,
  removeAssignmentRequest,
  getMyAssignmentRequests,
  acceptAssignmentRequest,
  declineAssignmentRequest,
  addTaskDep,
  removeTaskDep,
  getOrCreateTaskThread,
};