const { getPool } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded } = require('./dependencyService');
const { getActivityProgress } = require('./progressService');
const { broadcastStatusChanged, broadcastUnblocked } = require('../socket/socketHandler');

async function getActivitiesForPhase(phaseId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT a.activity_id AS "activityId", a.phase_id AS "phaseId",
            a.name, a.description, a.display_order AS "displayOrder",
            a.planned_start AS "plannedStart", a.planned_end AS "plannedEnd",
            a.status, a.status_override AS "statusOverride", a.created_at AS "createdAt",
            (a.planned_end < CURRENT_DATE AND a.status <> 'Completed') AS "isOverdue",
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''),u.email) AS "ownerName",
            COALESCE((SELECT JSON_AGG(depends_on_activity_id) FROM pm_activity_deps WHERE activity_id=a.activity_id),'[]') AS "dependsOn"
     FROM pm_activities a LEFT JOIN auth_users u ON u.user_id=a.owner_id
     WHERE a.phase_id=$1 AND NOT a.is_deleted ORDER BY a.display_order`,
    [phaseId]
  );
  for (const act of rows) act.progress = await getActivityProgress(act.activityId);
  return rows;
}

async function createActivity(phaseId, projectId, userId, body) {
  const { name, description, plannedStart, plannedEnd, ownerId, displayOrder } = body;
  if (!name?.trim()) { const e = new Error('Activity name required'); e.statusCode=400; throw e; }
  const { rows } = await getPool().query(
    `INSERT INTO pm_activities (phase_id,name,description,planned_start,planned_end,owner_id,display_order)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,(SELECT COALESCE(MAX(display_order),0)+10 FROM pm_activities WHERE phase_id=$1 AND NOT is_deleted)))
     RETURNING activity_id AS "activityId", name, status`,
    [phaseId, name.trim(), description||null, plannedStart||null, plannedEnd||null, ownerId||null, displayOrder??null]
  );
  await audit.log({ entityType:'activity', entityId:rows[0].activityId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
  return rows[0];
}

async function updateActivity(activityId, projectId, userId, body) {
  const fields = {};
  if (body.name         !== undefined) fields.name          = body.name.trim();
  if (body.description  !== undefined) fields.description   = body.description;
  if (body.plannedStart !== undefined) fields.planned_start = body.plannedStart;
  if (body.plannedEnd   !== undefined) fields.planned_end   = body.plannedEnd;
  if (body.ownerId      !== undefined) fields.owner_id      = body.ownerId;
  if (body.displayOrder !== undefined) fields.display_order = body.displayOrder;
  const keys = Object.keys(fields);
  if (!keys.length) return {};
  const set = keys.map((k,i)=>`${k}=$${i+2}`).join(', ');
  await getPool().query(`UPDATE pm_activities SET ${set} WHERE activity_id=$1`, [activityId,...keys.map(k=>fields[k])]);
  for (const key of keys) await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  return { activityId, ...fields };
}

async function updateActivityStatus(activityId, projectId, userId, newStatus) {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT status FROM pm_activities WHERE activity_id=$1 AND NOT is_deleted`, [activityId]);
  if (!rows[0]) { const e = new Error('Activity not found'); e.statusCode=404; throw e; }
  const oldStatus = rows[0].status;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE pm_activities SET status=$1,status_override=TRUE WHERE activity_id=$2`, [newStatus, activityId]);
    const unblockedIds = newStatus === 'Completed' ? await resolveUnblocked(client, 'activity', activityId) : [];
    await client.query('COMMIT');
    await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'status_changed', fieldChanged:'status', oldValue:oldStatus, newValue:newStatus });
    broadcastStatusChanged(projectId, { entityType:'activity', entityId:activityId, status:newStatus });
    if (unblockedIds.length) broadcastUnblocked(projectId, { entityType:'activity', unblockedIds });
    return { activityId, status:newStatus, unblockedActivityIds:unblockedIds };
  } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

async function deleteActivity(activityId, projectId, userId) {
  await getPool().query(`UPDATE pm_activities SET is_deleted=TRUE WHERE activity_id=$1`, [activityId]);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'deleted' });
}

async function addActivityDep(activityId, dependsOnId, projectId, userId) {
  await getPool().query(`INSERT INTO pm_activity_deps (activity_id,depends_on_activity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [activityId, dependsOnId]);
  await blockIfNeeded(getPool(), 'activity', activityId, dependsOnId);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'dependency_added', newValue:dependsOnId });
}

async function removeActivityDep(activityId, dependsOnId, projectId, userId) {
  await getPool().query(`DELETE FROM pm_activity_deps WHERE activity_id=$1 AND depends_on_activity_id=$2`, [activityId, dependsOnId]);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'dependency_removed', oldValue:dependsOnId });
}

module.exports = { getActivitiesForPhase, createActivity, updateActivity, updateActivityStatus, deleteActivity, addActivityDep, removeActivityDep };