'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');
const audit = require('./auditService');
const { resolveUnblocked, blockIfNeeded } = require('./dependencyService');
const { getActivityProgress } = require('./progressService');
const { broadcastStatusChanged, broadcastUnblocked } = require('../socket/socketHandler');
const pmChatService = require('./pmChatService');

function parseIdList(val) {
  if (!val) return [];
  return String(val).split(',').filter(Boolean).map(Number);
}

// ── Fetch activities ──────────────────────────────────────────────────────────

async function getActivitiesForPhase(phaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('phaseId', sql.Int, phaseId)
    .query(`
      SELECT a.activity_id   AS activityId,
             a.phase_id      AS phaseId,
             a.name, a.description,
             a.display_order AS displayOrder,
             a.planned_start AS plannedStart,
             a.planned_end   AS plannedEnd,
             a.status, a.status_override AS statusOverride,
             a.created_at    AS createdAt,
             CASE WHEN a.planned_end < CAST(GETDATE() AS DATE) AND a.status <> 'Completed'
                  THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isOverdue,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS ownerName,
             (
               SELECT STRING_AGG(CAST(depends_on_activity_id AS VARCHAR(20)), ',')
               FROM pm_activity_deps WHERE activity_id = a.activity_id
             ) AS dependsOn,
             -- Activity member count for display
             (
               SELECT COUNT(*) FROM pm_activity_members WHERE activity_id = a.activity_id
             ) AS memberCount,
             -- Activity Manager names, for a quick "who to ping" chip
             (
               SELECT STRING_AGG(COALESCE(NULLIF(TRIM(CONCAT(mu.first_name,' ',mu.last_name)),''), mu.email), ', ')
               FROM pm_activity_members mgr
               INNER JOIN auth_users mu ON mu.user_id = mgr.user_id
               WHERE mgr.activity_id = a.activity_id AND mgr.role = 'Manager'
             ) AS managerNames
      FROM pm_activities a
      LEFT JOIN auth_users u ON u.user_id = a.owner_id
      WHERE a.phase_id = @phaseId AND a.is_deleted = 0
      ORDER BY a.display_order
    `);

  const rows = result.recordset.map(r => ({ ...r, dependsOn: parseIdList(r.dependsOn) }));
  for (const act of rows) act.progress = await getActivityProgress(act.activityId);
  return rows;
}

// ── Activity members ──────────────────────────────────────────────────────────

async function getActivityMembers(activityId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`
      SELECT am.user_id AS userId,
             am.role AS role,
             am.added_at AS addedAt,
             COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
             u.email
      FROM pm_activity_members am
      INNER JOIN auth_users u ON u.user_id = am.user_id
      WHERE am.activity_id = @activityId
      ORDER BY CASE am.role WHEN 'Manager' THEN 0 WHEN 'Employee' THEN 1 ELSE 2 END, u.first_name, u.last_name
    `);
  return result.recordset;
}

const ACTIVITY_MEMBER_ROLES = ['Manager', 'Employee', 'Viewer'];

async function addActivityMember(activityId, targetUserId, role, actorUserId, projectId) {
  const finalRole = ACTIVITY_MEMBER_ROLES.includes(role) ? role : 'Employee';
  const pool = await getPool();
  await pool.request()
    .input('activityId', sql.Int,              activityId)
    .input('userId',     sql.UniqueIdentifier, targetUserId)
    .input('role',       sql.NVarChar(20),     finalRole)
    .query(`
      IF EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@userId)
        UPDATE pm_activity_members SET role=@role WHERE activity_id=@activityId AND user_id=@userId
      ELSE
        INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @userId, @role)
    `);

  // Ensure they're a project member too (as a baseline Member, never downgrades an existing role)
  const phResult = await pool.request()
    .input('activityId', sql.Int, activityId)
    .query(`SELECT ph.project_id FROM pm_activities a INNER JOIN pm_phases ph ON ph.phase_id=a.phase_id WHERE a.activity_id=@activityId`);
  const pid = projectId || phResult.recordset[0]?.project_id;
  if (pid) {
    await pool.request()
      .input('projectId', sql.Int,              pid)
      .input('userId',    sql.UniqueIdentifier, targetUserId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_members WHERE project_id=@projectId AND user_id=@userId)
          INSERT INTO pm_members (project_id, user_id, role) VALUES (@projectId, @userId, 'Member')
      `);
  }
  await audit.log({ entityType:'activity', entityId:activityId, projectId:pid, userId:actorUserId, action:'member_added', fieldChanged:'role', newValue:finalRole });

  if (finalRole === 'Manager') await pmChatService.onActivityManagersChanged(activityId);
  else await pmChatService.syncActivityThreadParticipants(activityId);
}

async function updateActivityMemberRole(activityId, targetUserId, role, actorUserId, projectId) {
  if (!ACTIVITY_MEMBER_ROLES.includes(role)) { const e = new Error('Invalid role'); e.statusCode = 400; throw e; }
  const pool = await getPool();
  const updateResult = await pool.request()
    .input('activityId', sql.Int,              activityId)
    .input('userId',     sql.UniqueIdentifier, targetUserId)
    .input('role',       sql.NVarChar(20),     role)
    .query(`UPDATE pm_activity_members SET role=@role WHERE activity_id=@activityId AND user_id=@userId`);
  if (!updateResult.rowsAffected[0]) { const e = new Error('Activity member not found'); e.statusCode = 404; throw e; }

  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId:actorUserId, action:'member_role_changed', fieldChanged:'role', newValue:role });
  await pmChatService.onActivityManagersChanged(activityId);
}

async function removeActivityMember(activityId, targetUserId, actorUserId, projectId) {
  const pool = await getPool();
  await pool.request()
    .input('activityId', sql.Int,              activityId)
    .input('userId',     sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@userId`);
  await audit.log({ entityType:'activity', entityId:activityId, projectId, userId:actorUserId, action:'member_removed', oldValue:targetUserId });
  await pmChatService.onActivityManagersChanged(activityId);
}

// ── Create activity (optionally seed initial activity members) ─────────────────

async function createActivity(phaseId, projectId, userId, body) {
  const { name, description, plannedStart, plannedEnd, ownerId, displayOrder, memberIds = [] } = body;
  if (!name?.trim()) { const e = new Error('Activity name required'); e.statusCode = 400; throw e; }

  const pool = await getPool();
  let row;

  await withTransaction(async (req) => {
    const result = await req()
      .input('phaseId',      sql.Int,              phaseId)
      .input('name',         sql.NVarChar(200),    name.trim())
      .input('description',  sql.NVarChar(sql.MAX),description || null)
      .input('plannedStart', sql.Date,             plannedStart || null)
      .input('plannedEnd',   sql.Date,             plannedEnd   || null)
      .input('ownerId',      sql.UniqueIdentifier, ownerId      || null)
      .input('displayOrder', sql.Int,              displayOrder ?? null)
      .query(`
        INSERT INTO pm_activities (phase_id, name, description, planned_start, planned_end, owner_id, display_order)
        OUTPUT INSERTED.activity_id AS activityId, INSERTED.name, INSERTED.status
        VALUES (
          @phaseId, @name, @description, @plannedStart, @plannedEnd, @ownerId,
          COALESCE(@displayOrder, (SELECT COALESCE(MAX(display_order),0)+10 FROM pm_activities WHERE phase_id=@phaseId AND is_deleted=0))
        )
      `);
    row = result.recordset[0];

    // The chosen owner (if any) becomes the activity's first Manager.
    if (ownerId) {
      await req()
        .input('activityId', sql.Int,              row.activityId)
        .input('uid',        sql.UniqueIdentifier, ownerId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@uid)
            INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @uid, 'Manager')
        `);
    }

    // Seed additional activity members (default role: Employee)
    for (const raw of [...new Set(memberIds)]) {
      const uid  = typeof raw === 'object' ? raw.userId : raw;
      const role = (typeof raw === 'object' && ACTIVITY_MEMBER_ROLES.includes(raw.role)) ? raw.role : 'Employee';
      if (!uid || String(uid) === String(ownerId)) continue; // owner already seeded as Manager above
      await req()
        .input('activityId', sql.Int,              row.activityId)
        .input('uid',        sql.UniqueIdentifier, uid)
        .input('role',       sql.NVarChar(20),     role)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@uid)
            INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @uid, @role)
        `);
    }
  });

  await audit.log({ entityType:'activity', entityId:row.activityId, projectId, userId, action:'created', fieldChanged:'name', newValue:name.trim() });

  // Seed the Activity chat thread now that Managers exist (safe no-op if none yet).
  await pmChatService.ensureActivityThread(row.activityId);
  await pmChatService.syncActivityThreadParticipants(row.activityId);

  return row;
}

// ── Update / delete activity ──────────────────────────────────────────────────

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
  const set  = keys.map((k, i) => { const ph = `f${i}`; req.input(ph, ACTIVITY_FIELD_TYPES[k], fields[k]); return `${k}=@${ph}`; }).join(', ');
  await req.query(`UPDATE pm_activities SET ${set} WHERE activity_id=@activityId`);

  for (const key of keys) await audit.log({ entityType:'activity', entityId:activityId, projectId, userId, action:'updated', fieldChanged:key, newValue:fields[key] });

  // A new owner is folded into pm_activity_members as a Manager, keeping
  // the legacy owner_id field and the role-based roster in step.
  if (body.ownerId !== undefined && body.ownerId) {
    await pool.request()
      .input('activityId', sql.Int,              activityId)
      .input('uid',        sql.UniqueIdentifier, body.ownerId)
      .query(`
        IF EXISTS (SELECT 1 FROM pm_activity_members WHERE activity_id=@activityId AND user_id=@uid)
          UPDATE pm_activity_members SET role='Manager' WHERE activity_id=@activityId AND user_id=@uid
        ELSE
          INSERT INTO pm_activity_members (activity_id, user_id, role) VALUES (@activityId, @uid, 'Manager')
      `);
    await pmChatService.onActivityManagersChanged(activityId);
  }

  return { activityId, ...fields };
}

async function updateActivityStatus(activityId, projectId, userId, newStatus) {
  const pool = await getPool();
  const cur  = await pool.request()
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
  // Thread history is preserved (comm_conversations rows are never deleted here) —
  // only the pm_* rows are marked deleted, matching how everything else in this
  // module soft-deletes rather than destroying data.
}

// ── Activity dependencies ─────────────────────────────────────────────────────

async function addActivityDep(activityId, dependsOnId, projectId, userId) {
  await withTransaction(async (req) => {
    await req()
      .input('activityId',  sql.Int, activityId)
      .input('dependsOnId', sql.Int, dependsOnId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM pm_activity_deps WHERE activity_id=@activityId AND depends_on_activity_id=@dependsOnId)
          INSERT INTO pm_activity_deps (activity_id, depends_on_activity_id) VALUES (@activityId, @dependsOnId)
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

// ── Chat thread lookup (used by activityRoutes GET /:id/chat) ──────────────────

async function getOrCreateActivityThread(activityId) {
  // Returns { conversationId, groupId } — groupId is used by ChatButton
  // to open the Groups tab to the correct group, not the inbox.
  const existing = await pmChatService.getActivityThreadId(activityId);
  if (existing) return existing;
  const conversationId = await pmChatService.ensureActivityThread(activityId);
  // Re-fetch so we always return the full { conversationId, groupId } shape
  const thread = await pmChatService.getActivityThreadId(activityId);
  return thread || { conversationId, groupId: null };
}

module.exports = {
  ACTIVITY_MEMBER_ROLES,
  getOrCreateActivityThread,
  getActivitiesForPhase,
  getActivityMembers,
  addActivityMember,
  updateActivityMemberRole,
  removeActivityMember,
  createActivity,
  updateActivity,
  updateActivityStatus,
  deleteActivity,
  addActivityDep,
  removeActivityDep,
};