'use strict';

/**
 * aiLearningService — the "AI Learning" module: one continuous chat/journal
 * thread per employee, built on the messaging system exactly like a
 * project's Report chat (see project-management/services/reportService.js,
 * which this closely mirrors): a comm_groups group_thread + a
 * comm_conversations row, bridged here by ai_learning_threads(employee_id ->
 * conversation_id). That gives it messages, attachments and live sockets for
 * free — actual message send/fetch reuses the existing generic
 * /api/messages/:conversationId/thread + /reply endpoints untouched; this
 * service only handles WHO gets a thread and who may see/reply to it.
 *
 * RBAC mapping (this app has no separate Lead/Leadership role — see the
 * final report's Assumptions):
 *   - Employee: their own thread only.
 *   - Manager: auth_users.mgr_user_id === employeeId (their direct reports).
 *   - Admin (user_type='admin'): every thread — admins are added as real
 *     comm_participants (not just the messaging module's super-admin
 *     governance bypass, which deliberately withholds message CONTENT from
 *     non-participant admins) so they can actually read/reply.
 */

const { getPool, withTransaction, sql } = require('../../../config/db');

const GROUP_NAME_MAX = 150;
const SUBJECT_MAX    = 300;
const clip = (s, max) => { const v = String(s ?? ''); return v.length <= max ? v : v.slice(0, max - 1) + '…'; };

// ── Low-level participant helpers (same MERGE/soft-delete pattern used by
// pmChatService/reportService elsewhere in this codebase) ──
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

// The effective audience for one employee's thread: the employee
// themselves, their CURRENT direct manager (if any), and every active admin.
async function getDesiredMemberIds(employeeId) {
  const pool = await getPool();
  const r = await pool.request().input('employeeId', sql.UniqueIdentifier, employeeId).query(`
    SELECT @employeeId AS user_id
    UNION
    SELECT mgr_user_id FROM auth_users WHERE user_id = @employeeId AND mgr_user_id IS NOT NULL
    UNION
    SELECT user_id FROM auth_users WHERE user_type = 'admin' AND is_active = 1
  `);
  return r.recordset.map(x => String(x.user_id));
}

// ── Bridge ────────────────────────────────────────────────────────────────
async function getThreadRow(employeeId) {
  const pool = await getPool();
  const r = await pool.request().input('employeeId', sql.UniqueIdentifier, employeeId).query(`
    SELECT t.conversation_id AS conversationId, c.group_id AS groupId, c.last_message_at AS lastMessageAt
    FROM ai_learning_threads t
    INNER JOIN comm_conversations c ON c.conversation_id = t.conversation_id
    WHERE t.employee_id = @employeeId
  `);
  const row = r.recordset[0];
  return row ? { conversationId: row.conversationId, groupId: row.groupId, lastMessageAt: row.lastMessageAt } : null;
}

async function ensureThread(employeeId, creatorId) {
  const existing = await getThreadRow(employeeId);
  if (existing) return existing;

  const pool = await getPool();
  const e = await pool.request().input('employeeId', sql.UniqueIdentifier, employeeId)
    .query(`SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''), email) AS name FROM auth_users WHERE user_id=@employeeId`);
  const employee = e.recordset[0];
  if (!employee) return null;

  const groupName = clip(`${employee.name} · AI Learning`, GROUP_NAME_MAX);
  const subject   = clip(`${employee.name} — AI Learning`, SUBJECT_MAX);
  const seedIds   = [...new Set([String(creatorId), ...(await getDesiredMemberIds(employeeId))])];

  let bridge;
  await withTransaction(async (req) => {
    const g = await req().input('groupName', sql.NVarChar, groupName).input('createdBy', sql.UniqueIdentifier, creatorId)
      .query(`INSERT INTO comm_groups (group_name, created_by, description)
              OUTPUT INSERTED.group_id VALUES (@groupName, @createdBy, 'Auto-managed AI Learning journal')`);
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
    await req().input('employeeId', sql.UniqueIdentifier, employeeId).input('convId', sql.Int, conversationId)
      .query(`INSERT INTO ai_learning_threads (employee_id, conversation_id) VALUES (@employeeId, @convId)`);
    bridge = { conversationId, groupId };
  });
  return bridge;
}

// Reconcile the conversation's members with the desired set (employee +
// current manager + admins) — handles a manager reassignment after the
// thread already existed, same as reportService.syncReportParticipants.
async function syncThreadParticipants(employeeId, actorId) {
  let bridge = await getThreadRow(employeeId);
  if (!bridge) bridge = await ensureThread(employeeId, actorId);
  if (!bridge) return null;
  const { conversationId, groupId } = bridge;

  const [desiredIds, current] = await Promise.all([getDesiredMemberIds(employeeId), getActiveParticipantIds(conversationId)]);
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
  return bridge;
}

// ── Access ────────────────────────────────────────────────────────────────
async function canAccessThread(viewerId, employeeId, isAdmin) {
  if (isAdmin) return true;
  if (String(viewerId) === String(employeeId)) return true;
  const pool = await getPool();
  const r = await pool.request().input('employeeId', sql.UniqueIdentifier, employeeId).input('viewerId', sql.UniqueIdentifier, viewerId)
    .query(`SELECT 1 AS ok FROM auth_users WHERE user_id = @employeeId AND mgr_user_id = @viewerId`);
  return r.recordset.length > 0;
}

// Does this viewer manage anyone (or is admin)? Decides which of the two
// views (employee single-chat vs manager list+conversation) the frontend
// should render — mirrors the "isSuperAdmin"-style capability flags used
// elsewhere in this app rather than a separate role table.
async function getViewerContext(viewerId, isAdmin) {
  if (isAdmin) return { isManagerOrAdmin: true };
  const pool = await getPool();
  const r = await pool.request().input('viewerId', sql.UniqueIdentifier, viewerId)
    .query(`SELECT 1 AS ok FROM auth_users WHERE mgr_user_id = @viewerId AND is_active = 1`);
  return { isManagerOrAdmin: r.recordset.length > 0 };
}

// The thread the current user's own single-chat view uses — always
// ensure/create-able, since it's their own journal.
async function getMyThread(userId) {
  const bridge = await syncThreadParticipants(userId, userId);
  return bridge ? { conversationId: bridge.conversationId } : null;
}

// A manager/admin opening a specific employee's timeline. Does NOT create a
// thread that doesn't exist yet (an employee who's never posted has no
// conversationId — the frontend shows "No updates yet" instead of
// fabricating an empty chat) but DOES sync participants on an existing one,
// so a newly-authorized manager/admin becomes a real participant before the
// generic /thread endpoint is called.
async function getEmployeeThread(employeeId, viewerId, isAdmin) {
  if (!(await canAccessThread(viewerId, employeeId, isAdmin))) {
    const e = new Error("You don't have access to this employee's AI Learning timeline."); e.statusCode = 403; throw e;
  }
  const existing = await getThreadRow(employeeId);
  if (!existing) return { conversationId: null };
  const bridge = await syncThreadParticipants(employeeId, viewerId);
  return { conversationId: bridge?.conversationId ?? existing.conversationId };
}

// ── Manager/admin employee list — sorted by latest activity, newest first ──
async function listAuthorizedEmployees(viewerId, isAdmin, search) {
  const pool = await getPool();
  const req = pool.request();
  let where = `u.is_active = 1 AND u.user_type <> 'admin'`;
  if (!isAdmin) {
    req.input('viewerId', sql.UniqueIdentifier, viewerId);
    where += ` AND u.mgr_user_id = @viewerId`;
  }
  if (search?.trim()) {
    req.input('search', sql.NVarChar(200), `%${search.trim()}%`);
    where += ` AND (u.first_name LIKE @search OR u.last_name LIKE @search OR u.email LIKE @search
                     OR u.employee_code LIKE @search OR CONCAT(u.first_name,' ',u.last_name) LIKE @search)`;
  }
  const r = await req.query(`
    SELECT u.user_id AS employeeId,
           COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
           u.email, u.employee_code AS employeeCode, d.dept_name AS deptName,
           t.conversation_id AS conversationId,
           c.last_message_at AS lastMessageAt,
           lm.body_html AS lastMessagePreview,
           lm.sender_id AS lastMessageSenderId
    FROM auth_users u
    LEFT JOIN dept_master d ON d.dept_id = u.dept_id
    LEFT JOIN ai_learning_threads t ON t.employee_id = u.user_id
    LEFT JOIN comm_conversations c ON c.conversation_id = t.conversation_id
    LEFT JOIN comm_messages lm ON lm.message_id = (
      SELECT TOP 1 message_id FROM comm_messages
      WHERE conversation_id = t.conversation_id AND is_deleted = 0
      ORDER BY sent_at DESC
    )
    WHERE ${where}
    ORDER BY CASE WHEN c.last_message_at IS NULL THEN 1 ELSE 0 END, c.last_message_at DESC, u.first_name, u.last_name
  `);
  // Strip any HTML tags from the preview (bodyHtml can contain <br>/<b>/etc.) —
  // a plain-text snippet is all a list row needs.
  return r.recordset.map(row => ({
    ...row,
    lastMessagePreview: row.lastMessagePreview ? row.lastMessagePreview.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) : null,
  }));
}

module.exports = {
  getThreadRow, ensureThread, syncThreadParticipants, canAccessThread,
  getViewerContext, getMyThread, getEmployeeThread, listAuthorizedEmployees,
};
