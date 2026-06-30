'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded } = require('./dependencyService');
const { broadcastStatusChanged, broadcastUnblocked } = require('../socket/socketHandler');

function parseIdList(val) {
  if (!val) return [];
  return String(val).split(',').filter(Boolean).map(Number);
}

/** FOR JSON PATH returns NULL (not []) when the subquery has no rows. */
function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

async function getTasksForActivity(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT t.task_id AS taskId, t.activity_id AS activityId,
             t.name, t.description, t.priority, t.status,
             t.due_date AS dueDate, t.estimated_hours AS estimatedHours,
             t.created_at AS createdAt,
             CASE WHEN t.due_date < CAST(GETDATE() AS DATE) AND t.status <> 'Done'
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isOverdue,
             (
               SELECT CAST(ta.user_id AS NVARCHAR(36)) AS userId,
                      COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name
               FROM pm_task_assignees ta LEFT JOIN auth_users u ON u.user_id=ta.user_id
               WHERE ta.task_id=t.task_id
               FOR JSON PATH
             ) AS assignees,
             (
               SELECT STRING_AGG(CAST(depends_on_task_id AS VARCHAR(20)), ',')
               FROM pm_task_deps WHERE task_id=t.task_id
             ) AS dependsOn
      FROM pm_tasks t WHERE t.activity_id=@activityId AND t.is_deleted=0
      ORDER BY t.created_at
    `);
  return result.recordset.map(r => ({
    ...r,
    assignees:  parseJsonArray(r.assignees),
    dependsOn:  parseIdList(r.dependsOn),
  }));
}

async function createTask(activityId, projectId, userId, body) {
  const { name, description, priority = 'Medium', dueDate, estimatedHours, assigneeIds = [] } = body;
  if (!name?.trim()) { const e = new Error('Task name required'); e.statusCode = 400; throw e; }

  let task;
  await withTransaction(async (req) => {
    const result = await req()
      .input('activityId',      sql.Int,                activityId)
      .input('name',            sql.NVarChar(200),      name.trim())
      .input('description',     sql.NVarChar(sql.MAX),  description || null)
      .input('priority',        sql.NVarChar(20),       priority)
      .input('dueDate',         sql.Date,               dueDate || null)
      .input('estimatedHours',  sql.Decimal(5, 1),      estimatedHours || null)
      .input('userId',          sql.UniqueIdentifier,   userId)
      .query(`
        INSERT INTO pm_tasks (activity_id,name,description,priority,due_date,estimated_hours,created_by)
        OUTPUT INSERTED.task_id AS taskId, INSERTED.name, INSERTED.status
        VALUES (@activityId,@name,@description,@priority,@dueDate,@estimatedHours,@userId)
      `);
    task = result.recordset[0];

    for (const uid of assigneeIds) {
      await req()
        .input('taskId', sql.Int,              task.taskId)
        .input('userId', sql.UniqueIdentifier, uid)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM pm_task_assignees WHERE task_id=@taskId AND user_id=@userId)
            INSERT INTO pm_task_assignees (task_id,user_id) VALUES (@taskId,@userId)
        `);
    }
  });

  await audit.log({ entityType:'task', entityId:task.taskId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
  return task;
}

const TASK_FIELD_TYPES = {
  name:            sql.NVarChar(200),
  description:     sql.NVarChar(sql.MAX),
  priority:        sql.NVarChar(20),
  due_date:        sql.Date,
  estimated_hours: sql.Decimal(5, 1),
};

async function updateTask(taskId, projectId, userId, body) {
  const fields = {};
  if (body.name           !== undefined) fields.name             = body.name.trim();
  if (body.description    !== undefined) fields.description      = body.description;
  if (body.priority       !== undefined) fields.priority         = body.priority;
  if (body.dueDate        !== undefined) fields.due_date         = body.dueDate;
  if (body.estimatedHours !== undefined) fields.estimated_hours  = body.estimatedHours;
  const keys = Object.keys(fields);
  if (keys.length) {
    const pool = await getPool();
    const req  = pool.request().input('taskId', sql.Int, taskId);
    const set  = keys.map((k, i) => {
      const ph = `f${i}`;
      req.input(ph, TASK_FIELD_TYPES[k], fields[k]);
      return `${k}=@${ph}`;
    }).join(', ');
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
  // Members can only update their own tasks (FR-31)
  if (projectRole === 'Member' && !cur.recordset[0].isAssigned) {
    const e = new Error('Members can only update their own assigned tasks'); e.statusCode = 403; throw e;
  }
  const oldStatus = cur.recordset[0].status;

  let unblockedIds = [];
  await withTransaction(async (req) => {
    await req()
      .input('status', sql.NVarChar(30), newStatus)
      .input('taskId',  sql.Int,         taskId)
      .query(`UPDATE pm_tasks SET status=@status WHERE task_id=@taskId`);
    unblockedIds = newStatus === 'Done' ? await resolveUnblocked(req, 'task', taskId) : [];
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
}

async function addAssignee(taskId, targetUserId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('taskId',       sql.Int,              taskId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM pm_task_assignees WHERE task_id=@taskId AND user_id=@targetUserId)
        INSERT INTO pm_task_assignees (task_id,user_id) VALUES (@taskId,@targetUserId)
    `);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'assignee_added', newValue:targetUserId });
}

async function removeAssignee(taskId, targetUserId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('taskId',       sql.Int,              taskId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_task_assignees WHERE task_id=@taskId AND user_id=@targetUserId`);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'assignee_removed', oldValue:targetUserId });
}

async function addTaskDep(taskId, dependsOnId, projectId, userId) {
  await withTransaction(async (req) => {
    await req()
      .input('taskId',      sql.Int, taskId)
      .input('dependsOnId', sql.Int, dependsOnId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_task_deps WHERE task_id=@taskId AND depends_on_task_id=@dependsOnId)
          INSERT INTO pm_task_deps (task_id,depends_on_task_id) VALUES (@taskId,@dependsOnId)
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

module.exports = { getTasksForActivity, createTask, updateTask, updateTaskStatus, deleteTask, addAssignee, removeAssignee, addTaskDep, removeTaskDep };
