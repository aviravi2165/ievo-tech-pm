'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded } = require('./dependencyService');
const { getActivityProgress } = require('./progressService');
const { broadcastStatusChanged, broadcastUnblocked } = require('../socket/socketHandler');

/** STRING_AGG returns NULL (not '') when there are no rows — normalise to []. */
function parseIdList(val) {
  if (!val) return [];
  return String(val).split(',').filter(Boolean).map(Number);
}

async function getActivitiesForPhase(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`
      SELECT a.activity_id AS activityId, a.phase_id AS phaseId,
             a.name, a.description, a.display_order AS displayOrder,
             a.planned_start AS plannedStart, a.planned_end AS plannedEnd,
             a.status, a.status_override AS statusOverride, a.created_at AS createdAt,
             CASE WHEN a.planned_end < CAST(GETDATE() AS DATE) AND a.status <> 'Completed'
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isOverdue,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS ownerName,
             (
               SELECT STRING_AGG(CAST(depends_on_activity_id AS VARCHAR(20)), ',')
               FROM pm_activity_deps WHERE activity_id = a.activity_id
             ) AS dependsOn
      FROM pm_activities a LEFT JOIN auth_users u ON u.user_id = a.owner_id
      WHERE a.phase_id = @phaseId AND a.is_deleted = 0
      ORDER BY a.display_order
    `);
  const rows = result.recordset.map(r => ({ ...r, dependsOn: parseIdList(r.dependsOn) }));
  for (const act of rows) act.progress = await getActivityProgress(act.activityId);
  return rows;
}

async function createActivity(phaseId, projectId, userId, body) {
  const { name, description, plannedStart, plannedEnd, ownerId, displayOrder } = body;
  if (!name?.trim()) { const e = new Error('Activity name required'); e.statusCode = 400; throw e; }

  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId',      sql.Int,              phaseId)
    .input('name',         sql.NVarChar(200),    name.trim())
    .input('description',  sql.NVarChar(sql.MAX),description || null)
    .input('plannedStart', sql.Date,             plannedStart || null)
    .input('plannedEnd',   sql.Date,             plannedEnd || null)
    .input('ownerId',      sql.UniqueIdentifier, ownerId || null)
    .input('displayOrder', sql.Int,              displayOrder ?? null)
    .query(`
      INSERT INTO pm_activities (phase_id,name,description,planned_start,planned_end,owner_id,display_order)
      OUTPUT INSERTED.activity_id AS activityId, INSERTED.name, INSERTED.status
      VALUES (
        @phaseId, @name, @description, @plannedStart, @plannedEnd, @ownerId,
        COALESCE(@displayOrder, (SELECT COALESCE(MAX(display_order),0)+10 FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0))
      )
    `);
  const row = result.recordset[0];
  await audit.log({ entityType:'activity', entityId:row.activityId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });
  return row;
}

// Field -> mssql type map for dynamic UPDATE statements
const ACTIVITY_FIELD_TYPES = {
  name:          sql.NVarChar(200),
  description:   sql.NVarChar(sql.MAX),
  planned_start: sql.Date,
  planned_end:   sql.Date,
  owner_id:      sql.UniqueIdentifier,
  display_order: sql.Int,
};

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

  const pool = await getPool();
  const req  = pool.request().input('activityId', sql.Int, activityId);
  const set  = keys.map((k, i) => {
    const ph = `f${i}`;
    req.input(ph, ACTIVITY_FIELD_TYPES[k], fields[k]);
    return `${k}=@${ph}`;
  }).join(', ');
  await req.query(`UPDATE pm_activities SET ${set} WHERE activity_id=@activityId`);

  for (const key of keys) await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });
  return { activityId, ...fields };
}

async function updateActivityStatus(activityId, projectId, userId, newStatus) {
  const pool = await getPool();
  const cur = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT status FROM pm_activities WHERE activity_id=@activityId AND is_deleted=0`);
  if (!cur.recordset[0]) { const e = new Error('Activity not found'); e.statusCode = 404; throw e; }
  const oldStatus = cur.recordset[0].status;

  let unblockedIds = [];
  await withTransaction(async (req) => {
    await req()
      .input('status',     sql.NVarChar(30), newStatus)
      .input('activityId', sql.Int,          activityId)
      .query(`UPDATE pm_activities SET status=@status, status_override=1 WHERE activity_id=@activityId`);
    unblockedIds = newStatus === 'Completed' ? await resolveUnblocked(req, 'activity', activityId) : [];
  });

  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'status_changed', fieldChanged:'status', oldValue:oldStatus, newValue:newStatus });
  broadcastStatusChanged(projectId, { entityType:'activity', entityId:activityId, status:newStatus });
  if (unblockedIds.length) broadcastUnblocked(projectId, { entityType:'activity', unblockedIds });
  return { activityId, status:newStatus, unblockedActivityIds:unblockedIds };
}

async function deleteActivity(activityId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`UPDATE pm_activities SET is_deleted=1 WHERE activity_id=@activityId`);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'deleted' });
}

async function addActivityDep(activityId, dependsOnId, projectId, userId) {
  await withTransaction(async (req) => {
    await req()
      .input('activityId',  sql.Int, activityId)
      .input('dependsOnId', sql.Int, dependsOnId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_activity_deps WHERE activity_id=@activityId AND depends_on_activity_id=@dependsOnId)
          INSERT INTO pm_activity_deps (activity_id,depends_on_activity_id) VALUES (@activityId,@dependsOnId)
      `);
    await blockIfNeeded(req, 'activity', activityId, dependsOnId);
  });
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'dependency_added', newValue:dependsOnId });
}

async function removeActivityDep(activityId, dependsOnId, projectId, userId) {
  const pool = await getPool();
  await pool.request()
    .input('activityId',  sql.Int, activityId)
    .input('dependsOnId', sql.Int, dependsOnId)
    .query(`DELETE FROM pm_activity_deps WHERE activity_id=@activityId AND depends_on_activity_id=@dependsOnId`);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'dependency_removed', oldValue:dependsOnId });
}

module.exports = { getActivitiesForPhase, createActivity, updateActivity, updateActivityStatus, deleteActivity, addActivityDep, removeActivityDep };
