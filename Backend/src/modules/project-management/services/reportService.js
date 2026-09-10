'use strict';

/**
 * reportService — a project's "Report" chat.
 *
 * Each project has ONE report conversation, built on the messaging system the
 * same way pmChatService builds activity threads: a comm_groups group_thread +
 * comm_conversations row, bridged by pm_project_reports(project_id ->
 * conversation_id). That gives it messages, file attachments and live sockets
 * for free, and it renders in the normal chat UI.
 *
 * Membership is EXPLICIT and admin-curated (pm_report_members) — NOT every
 * project member. Effective audience = those rows UNION every admin (admins can
 * always see/post). The conversation's comm_participants / comm_group_members
 * are kept in sync with that set, mirroring pmChatService.syncActivityThreadParticipants.
 */

const { getPool, withTransaction, sql } = require('../../../config/db');

const GROUP_NAME_MAX = 150;
const SUBJECT_MAX    = 300;
const clip = (s, max) => { const v = String(s ?? ''); return v.length <= max ? v : v.slice(0, max - 1) + '…'; };

// ── Low-level participant helpers (same MERGE/soft-delete pattern pmChatService uses) ──
async function upsertParticipants(reqFn, conversationId, userIds) {
  for (const uid of [...new Set(userIds.map(String))]) {
    await reqFn()
      .input('convId', sql.Int, conversationId)
      .input('uid', sql.UniqueIdentifier, uid)
      .query(`
        MERGE comm_participants AS target
        USING (SELECT @convId AS conversation_id, @uid AS user_id) AS source
        ON (target.conversation_id = source.conversation_id AND target.user_id = source.user_id)
        WHEN MATCHED AND target.is_deleted = 1 THEN UPDATE SET is_deleted = 0, participant_type = 'to', rejoined_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN INSERT (conversation_id, user_id, participant_type, joined_at)
          VALUES (source.conversation_id, source.user_id, 'to', SYSDATETIMEOFFSET());
      `);
  }
}
async function removeParticipantsSoft(reqFn, conversationId, userIds) {
  for (const uid of [...new Set(userIds.map(String))]) {
    await reqFn()
      .input('convId', sql.Int, conversationId)
      .input('uid', sql.UniqueIdentifier, uid)
      .query(`UPDATE comm_participants SET is_deleted = 1, left_at = SYSDATETIMEOFFSET()
              WHERE conversation_id = @convId AND user_id = @uid AND is_deleted = 0`);
  }
}
async function getActiveParticipantIds(conversationId) {
  const pool = await getPool();
  const r = await pool.request().input('convId', sql.Int, conversationId)
    .query(`SELECT user_id AS userId FROM comm_participants WHERE conversation_id=@convId AND is_deleted=0`);
  return r.recordset.map(x => String(x.userId));
}

// The effective audience = explicit report members UNION every active admin.
async function getDesiredMemberIds(projectId) {
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId).query(`
    SELECT user_id FROM pm_report_members WHERE project_id = @projectId
    UNION
    SELECT user_id FROM auth_users WHERE user_type = 'admin' AND is_active = 1
  `);
  return r.recordset.map(x => String(x.user_id));
}

// ── Bridge ────────────────────────────────────────────────────────────────
async function getProjectReport(projectId) {
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId).query(`
    SELECT rep.conversation_id AS conversationId, c.group_id AS groupId
    FROM pm_project_reports rep
    INNER JOIN comm_conversations c ON c.conversation_id = rep.conversation_id
    WHERE rep.project_id = @projectId
  `);
  const row = r.recordset[0];
  return row ? { conversationId: row.conversationId, groupId: row.groupId } : null;
}

async function ensureProjectReport(projectId, creatorId) {
  const existing = await getProjectReport(projectId);
  if (existing) return existing;

  const pool = await getPool();
  const p = await pool.request().input('projectId', sql.Int, projectId)
    .query(`SELECT name FROM pm_projects WHERE project_id=@projectId`);
  const proj = p.recordset[0];
  if (!proj) return null;

  const groupName = clip(`${proj.name} · Report`, GROUP_NAME_MAX);
  const subject   = clip(`${proj.name} — Report`, SUBJECT_MAX);
  const seedIds   = [...new Set([String(creatorId), ...(await getDesiredMemberIds(projectId))])];

  let bridge;
  await withTransaction(async (req) => {
    const g = await req().input('groupName', sql.NVarChar, groupName).input('createdBy', sql.UniqueIdentifier, creatorId)
      .query(`INSERT INTO comm_groups (group_name, created_by, description)
              OUTPUT INSERTED.group_id VALUES (@groupName, @createdBy, 'Auto-managed project report chat')`);
    const groupId = g.recordset[0].group_id;

    const c = await req().input('subject', sql.NVarChar, subject).input('createdBy', sql.UniqueIdentifier, creatorId).input('groupId', sql.Int, groupId)
      .query(`INSERT INTO comm_conversations (subject, created_by, allow_reply, group_id, conv_type, last_message_at)
              OUTPUT INSERTED.conversation_id VALUES (@subject, @createdBy, 1, @groupId, 'group_thread', SYSDATETIMEOFFSET())`);
    const conversationId = c.recordset[0].conversation_id;

    for (const uid of seedIds) {
      await req().input('groupId', sql.Int, groupId).input('userId', sql.UniqueIdentifier, uid)
        .query(`IF NOT EXISTS (SELECT 1 FROM comm_group_members WHERE group_id=@groupId AND user_id=@userId)
                  INSERT INTO comm_group_members (group_id, user_id) VALUES (@groupId, @userId)`);
    }
    await upsertParticipants(req, conversationId, seedIds);
    await req().input('projectId', sql.Int, projectId).input('convId', sql.Int, conversationId)
      .query(`INSERT INTO pm_project_reports (project_id, conversation_id) VALUES (@projectId, @convId)`);
    bridge = { conversationId, groupId };
  });
  return bridge;
}

// Reconcile the conversation's members with the desired set (report members ∪ admins).
async function syncReportParticipants(projectId, creatorId) {
  let bridge = await getProjectReport(projectId);
  if (!bridge) bridge = await ensureProjectReport(projectId, creatorId);
  if (!bridge) return;
  const { conversationId, groupId } = bridge;

  const [desiredIds, current] = await Promise.all([getDesiredMemberIds(projectId), getActiveParticipantIds(conversationId)]);
  const desired  = new Set(desiredIds);
  const toAdd    = desiredIds.filter(id => !current.includes(id));
  const toRemove = current.filter(id => !desired.has(id));

  await withTransaction(async (req) => {
    if (toAdd.length)    await upsertParticipants(req, conversationId, toAdd);
    if (toRemove.length) await removeParticipantsSoft(req, conversationId, toRemove);
    if (groupId) {
      for (const uid of desiredIds) {
        await req().input('groupId', sql.Int, groupId).input('userId', sql.UniqueIdentifier, uid)
          .query(`IF NOT EXISTS (SELECT 1 FROM comm_group_members WHERE group_id=@groupId AND user_id=@userId)
                    INSERT INTO comm_group_members (group_id, user_id) VALUES (@groupId, @userId)`);
      }
      for (const uid of toRemove) {
        await req().input('groupId', sql.Int, groupId).input('userId', sql.UniqueIdentifier, uid)
          .query(`DELETE FROM comm_group_members WHERE group_id=@groupId AND user_id=@userId`);
      }
    }
  });
}

// ── Access ────────────────────────────────────────────────────────────────
async function canAccessReport(userId, projectId, isAdmin) {
  if (isAdmin) return true;
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId).input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT 1 AS ok FROM pm_report_members WHERE project_id=@projectId AND user_id=@userId`);
  return r.recordset.length > 0;
}

// ── Members ───────────────────────────────────────────────────────────────
async function listReportMembers(projectId) {
  const pool = await getPool();
  const r = await pool.request().input('projectId', sql.Int, projectId).query(`
    SELECT u.user_id AS userId, u.email,
           COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
           m.added_at AS addedAt
    FROM pm_report_members m INNER JOIN auth_users u ON u.user_id = m.user_id
    WHERE m.project_id = @projectId AND u.is_active = 1
    ORDER BY u.first_name, u.last_name
  `);
  return r.recordset;
}

async function addReportMember(projectId, targetUserId, addedBy) {
  const pool = await getPool();
  await pool.request().input('projectId', sql.Int, projectId).input('userId', sql.UniqueIdentifier, targetUserId).input('addedBy', sql.UniqueIdentifier, addedBy)
    .query(`IF NOT EXISTS (SELECT 1 FROM pm_report_members WHERE project_id=@projectId AND user_id=@userId)
              INSERT INTO pm_report_members (project_id, user_id, added_by) VALUES (@projectId, @userId, @addedBy)`);
  await syncReportParticipants(projectId, addedBy);
  return listReportMembers(projectId);
}

async function removeReportMember(projectId, targetUserId, actorUserId) {
  const pool = await getPool();
  await pool.request().input('projectId', sql.Int, projectId).input('userId', sql.UniqueIdentifier, targetUserId)
    .query(`DELETE FROM pm_report_members WHERE project_id=@projectId AND user_id=@userId`);
  await syncReportParticipants(projectId, actorUserId);
  return listReportMembers(projectId);
}

// The report as the frontend needs it: conversation to open + members + canManage.
async function getReportForUser(projectId, userId, isAdmin) {
  if (!(await canAccessReport(userId, projectId, isAdmin))) {
    const e = new Error('You do not have access to this project report.'); e.statusCode = 403; throw e;
  }
  let bridge = await getProjectReport(projectId);
  if (!bridge) bridge = await ensureProjectReport(projectId, userId);
  else if (isAdmin) {
    // An admin opening the report must be a live participant to read/post.
    const current = await getActiveParticipantIds(bridge.conversationId);
    if (!current.includes(String(userId))) await syncReportParticipants(projectId, userId);
  }
  const members = await listReportMembers(projectId);
  return { ...bridge, members, canManage: !!isAdmin };
}

// ── DPR: every project whose report this user can see ─────────────────────
async function listAccessibleReports(userId, isAdmin) {
  const pool = await getPool();
  const req = pool.request().input('userId', sql.UniqueIdentifier, userId);
  // Admin → every project; else only projects where the user is a report member.
  const where = isAdmin
    ? 'p.is_deleted = 0'
    : `p.is_deleted = 0 AND EXISTS (SELECT 1 FROM pm_report_members rm WHERE rm.project_id = p.project_id AND rm.user_id = @userId)`;
  const r = await req.query(`
    SELECT p.project_id AS projectId, p.name, p.status,
           rep.conversation_id AS conversationId, cc.group_id AS groupId,
           (SELECT COUNT(*) FROM pm_report_members m WHERE m.project_id = p.project_id) AS memberCount
    FROM pm_projects p
    LEFT JOIN pm_project_reports rep ON rep.project_id = p.project_id
    LEFT JOIN comm_conversations cc ON cc.conversation_id = rep.conversation_id
    WHERE ${where}
    ORDER BY p.name
  `);
  return r.recordset;
}

module.exports = {
  getProjectReport, ensureProjectReport, syncReportParticipants,
  canAccessReport, listReportMembers, addReportMember, removeReportMember,
  getReportForUser, listAccessibleReports,
};
