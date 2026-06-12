const { getPool } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded } = require('./dependencyService');
const { broadcastStatusChanged, broadcastUnblocked } = require('../socket/socketHandler');

async function getTasksForActivity(activityId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT t.task_id AS "taskId", t.activity_id AS "activityId",
            t.name, t.description, t.priority, t.status,
            t.due_date AS "dueDate", t.estimated_hours AS "estimatedHours",
            t.created_at AS "createdAt",
            (t.due_date < CURRENT_DATE AND t.status <> 'Done') AS "isOverdue",
            COALESCE((
              SELECT JSON_AGG(JSON_BUILD_OBJECT('userId',ta.user_id,'name',
                COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''),u.email)))
              FROM pm_task_assignees ta LEFT JOIN auth_users u ON u.user_id=ta.user_id
              WHERE ta.task_id=t.task_id
            ),'[]') AS assignees,
            COALESCE((SELECT JSON_AGG(depends_on_task_id) FROM pm_task_deps WHERE task_id=t.task_id),'[]') AS "dependsOn"
     FROM pm_tasks t WHERE t.activity_id=$1 AND NOT t.is_deleted ORDER BY t.created_at`,
    [activityId]
  );
  return rows;
}

async function createTask(activityId, projectId, userId, body) {
  const { name, description, priority='Medium', dueDate, estimatedHours, assigneeIds=[] } = body;
  if (!name?.trim()) { const e = new Error('Task name required'); e.statusCode=400; throw e; }
  const pool = getPool(); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO pm_tasks (activity_id,name,description,priority,due_date,estimated_hours,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING task_id AS "taskId", name, status`,
      [activityId, name.trim(), description||null, priority, dueDate||null, estimatedHours||null, userId]
    );
    const taskId = rows[0].taskId;
    for (const uid of assigneeIds) {
      await client.query(`INSERT INTO pm_task_assignees (task_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [taskId, uid]);
    }
    await client.query('COMMIT');
    await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
    return rows[0];
  } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function updateTask(taskId, projectId, userId, body) {
  const fields = {};
  if (body.name            !== undefined) fields.name             = body.name.trim();
  if (body.description     !== undefined) fields.description      = body.description;
  if (body.priority        !== undefined) fields.priority         = body.priority;
  if (body.dueDate         !== undefined) fields.due_date         = body.dueDate;
  if (body.estimatedHours  !== undefined) fields.estimated_hours  = body.estimatedHours;
  const keys = Object.keys(fields);
  if (keys.length) {
    const set = keys.map((k,i)=>`${k}=$${i+2}`).join(', ');
    await getPool().query(`UPDATE pm_tasks SET ${set} WHERE task_id=$1`, [taskId,...keys.map(k=>fields[k])]);
    for (const key of keys) await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  }
  return { taskId, ...fields };
}

async function updateTaskStatus(taskId, projectId, userId, newStatus, projectRole) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT t.status, EXISTS(SELECT 1 FROM pm_task_assignees WHERE task_id=$1 AND user_id=$2) AS "isAssigned"
     FROM pm_tasks t WHERE t.task_id=$1 AND NOT t.is_deleted`,
    [taskId, userId]
  );
  if (!rows[0]) { const e = new Error('Task not found'); e.statusCode=404; throw e; }
  // Members can only update their own tasks (FR-31)
  if (projectRole === 'Member' && !rows[0].isAssigned) {
    const e = new Error('Members can only update their own assigned tasks'); e.statusCode=403; throw e;
  }
  const oldStatus = rows[0].status;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE pm_tasks SET status=$1 WHERE task_id=$2`, [newStatus, taskId]);
    const unblockedIds = newStatus === 'Done' ? await resolveUnblocked(client, 'task', taskId) : [];
    await client.query('COMMIT');
    await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'status_changed', fieldChanged:'status', oldValue:oldStatus, newValue:newStatus });
    broadcastStatusChanged(projectId, { entityType:'task', entityId:taskId, status:newStatus });
    if (unblockedIds.length) broadcastUnblocked(projectId, { entityType:'task', unblockedIds });
    return { taskId, status:newStatus, unblockedTaskIds:unblockedIds };
  } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function deleteTask(taskId, projectId, userId) {
  await getPool().query(`UPDATE pm_tasks SET is_deleted=TRUE WHERE task_id=$1`, [taskId]);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'deleted' });
}

async function addAssignee(taskId, targetUserId, projectId, userId) {
  await getPool().query(`INSERT INTO pm_task_assignees (task_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [taskId, targetUserId]);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'assignee_added', newValue:targetUserId });
}

async function removeAssignee(taskId, targetUserId, projectId, userId) {
  await getPool().query(`DELETE FROM pm_task_assignees WHERE task_id=$1 AND user_id=$2`, [taskId, targetUserId]);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'assignee_removed', oldValue:targetUserId });
}

async function addTaskDep(taskId, dependsOnId, projectId, userId) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO pm_task_deps (task_id,depends_on_task_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [taskId, dependsOnId]);
    await blockIfNeeded(client, 'task', taskId, dependsOnId);
    await client.query('COMMIT');
  } catch(err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'dependency_added', newValue:dependsOnId });
}

async function removeTaskDep(taskId, dependsOnId, projectId, userId) {
  await getPool().query(`DELETE FROM pm_task_deps WHERE task_id=$1 AND depends_on_task_id=$2`, [taskId, dependsOnId]);
  await audit.log({ entityType:'task', entityId:taskId, projectId, userId, action:'dependency_removed', oldValue:dependsOnId });
}

module.exports = { getTasksForActivity, createTask, updateTask, updateTaskStatus, deleteTask, addAssignee, removeAssignee, addTaskDep, removeTaskDep };