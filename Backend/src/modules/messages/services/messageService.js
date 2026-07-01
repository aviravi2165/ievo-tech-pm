'use strict';

const { getPool, withTransaction, sql } = require('../../../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeBodyHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .trim();
}

function displayName(row) {
  if (!row) return 'Unknown';
  return [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    || row.email || 'Unknown';
}

/** FOR JSON PATH returns NULL (not []) when the subquery has no rows. */
function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

function mapThreadMessage(row) {
  return {
    messageId:       row.message_id,
    conversationId:  row.conversation_id,
    senderId:        row.sender_id,
    senderName:      row.sender_name,
    bodyHtml:        row.body_html,
    sentAt:          row.sent_at,
    parentMessageId: row.parent_message_id,
    isSystem:        Boolean(row.is_system),
    attachments:     parseJsonArray(row.attachments),
    readReceipts:    parseJsonArray(row.read_receipts),
    parentMessage:   row.parent_message_id ? {
      messageId:  row.parent_message_id,
      senderName: row.parent_is_deleted ? null : row.parent_sender_name,
      bodyHtml:   row.parent_is_deleted ? null : row.parent_body_html,
      isDeleted:  Boolean(row.parent_is_deleted),
    } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema guard — ensures archived_at / left_at / rejoined_at columns exist on
// first use. Uses batch() because ALTER TABLE cannot run in a parameterised
// request.
// ─────────────────────────────────────────────────────────────────────────────

let _archiveColReady;

async function ensureParticipantArchiveColumn() {
  if (!_archiveColReady) {
    _archiveColReady = (async () => {
      const pool = await getPool();
      await pool.request().batch(`
        IF NOT EXISTS (
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('comm_participants') AND name = 'archived_at'
        )
          ALTER TABLE comm_participants ADD archived_at DATETIMEOFFSET;

        IF NOT EXISTS (
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('comm_participants') AND name = 'left_at'
        )
          ALTER TABLE comm_participants ADD left_at DATETIMEOFFSET;

        IF NOT EXISTS (
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('comm_participants') AND name = 'rejoined_at'
        )
          ALTER TABLE comm_participants ADD rejoined_at DATETIMEOFFSET;
      `);
    })().catch(err => {
      // FIX Bug 7: if the ALTER TABLE fails (e.g. permissions error on
      // first run), reset the singleton so the next call retries instead
      // of permanently returning the same rejected promise forever. Without
      // this reset, every subsequent call to any function that calls
      // ensureParticipantArchiveColumn() throws the original error even
      // if the column was manually added in the interim.
      _archiveColReady = null;
      throw err;
    });
  }
  await _archiveColReady;
}

// ─────────────────────────────────────────────────────────────────────────────
// Access guards
// ─────────────────────────────────────────────────────────────────────────────

async function assertConversationParticipant(conversationId, userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('convId', sql.Int,              conversationId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      -- Direct participant (BCC / CC threads)
      SELECT 1 AS ok
      FROM comm_participants p
      WHERE p.conversation_id = @convId AND p.user_id = @userId AND p.is_deleted = 0
      UNION ALL
      -- Conversation creator (covers missing participant rows from data migration)
      SELECT 1
      FROM comm_conversations c
      WHERE c.conversation_id = @convId AND c.created_by = @userId AND c.is_deleted = 0
      UNION ALL
      -- Anyone who has sent a message in this conversation
      SELECT 1
      FROM comm_messages m
      WHERE m.conversation_id = @convId AND m.sender_id = @userId AND m.is_deleted = 0
      UNION ALL
      -- Group thread member
      SELECT 1
      FROM comm_conversations c
      INNER JOIN comm_group_members gm ON gm.group_id = c.group_id
      WHERE c.conversation_id = @convId AND gm.user_id = @userId AND c.conv_type = 'group_thread'
      UNION ALL
      -- Super admin always has access
      SELECT 1
      FROM auth_users u
      WHERE u.user_id = @userId AND u.user_type = 'admin'
    `);
  if (!result.recordset[0]) {
    const e = new Error('Conversation not found or access denied');
    e.statusCode = 403; throw e;
  }
}

async function isThreadAdminOrSuperAdmin(conversationId, userId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('convId', sql.Int,              conversationId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        CASE WHEN c.created_by = @userId THEN 1 ELSE 0 END AS isCreator,
        CASE WHEN u.user_type = 'admin'  THEN 1 ELSE 0 END AS isSuperAdmin
      FROM comm_conversations c
      INNER JOIN auth_users u ON u.user_id = @userId
      WHERE c.conversation_id = @convId
    `);
  const r = result.recordset[0];
  if (!r) return false;
  return r.isCreator || r.isSuperAdmin;
}

async function assertThreadAdmin(conversationId, userId) {
  const allowed = await isThreadAdminOrSuperAdmin(conversationId, userId);
  if (!allowed) {
    const err = new Error('Only the thread creator or a super admin can do this');
    err.code = 'THREAD_FORBIDDEN'; err.statusCode = 403; throw err;
  }
}

async function getParticipantUserIds(conversationId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`
      SELECT user_id FROM comm_participants
      WHERE conversation_id = @convId AND is_deleted = 0
    `);
  return result.recordset.map(r => r.user_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers used by sendMessage
// ─────────────────────────────────────────────────────────────────────────────

async function getMemberUserIdsForGroups(groupIds = [], excludeUserId = null) {
  if (!groupIds.length) return [];
  const pool = await getPool();
  const req  = pool.request();
  const ph   = groupIds.map((id, i) => { req.input(`gid${i}`, sql.Int, id); return `@gid${i}`; });

  let sql_text = `
    SELECT DISTINCT gm.user_id
    FROM comm_group_members gm
    INNER JOIN comm_groups g ON g.group_id = gm.group_id
    WHERE gm.group_id IN (${ph.join(',')}) AND g.is_active = 1
  `;
  if (excludeUserId) {
    req.input('excludeUserId', sql.UniqueIdentifier, excludeUserId);
    sql_text += ' AND gm.user_id <> @excludeUserId';
  }
  const result = await req.query(sql_text);
  return result.recordset.map(r => r.user_id);
}

async function assertNoAdminRecipients(userIds = []) {
  const ids = [...new Set((userIds || []).map(String))].filter(Boolean);
  if (!ids.length) return;
  const pool = await getPool();
  const req  = pool.request();
  const ph   = ids.map((id, i) => { req.input(`uid${i}`, sql.UniqueIdentifier, id); return `@uid${i}`; });
  const result = await req.query(
    `SELECT user_id FROM auth_users WHERE user_id IN (${ph.join(',')}) AND user_type = 'admin'`
  );
  if (result.recordset.length) {
    const e = new Error('Super-admin accounts cannot be added as recipients or participants');
    e.statusCode = 400; throw e;
  }
}

async function assertActiveGroupMember(groupId, userId, reqFn = null) {
  // reqFn is a () => sql.Request factory (inside a transaction); if absent
  // we create our own request against the pool.
  let result;
  if (reqFn) {
    result = await reqFn()
      .input('groupId', sql.Int,              groupId)
      .input('userId',  sql.UniqueIdentifier, userId)
      .query(`
        SELECT g.is_disabled AS isDisabled,
               gm.user_id   AS memberUserId
        FROM comm_groups g
        LEFT JOIN comm_group_members gm
          ON gm.group_id = g.group_id AND gm.user_id = @userId
        WHERE g.group_id = @groupId AND g.is_active = 1
      `);
  } else {
    const pool = await getPool();
    result = await pool.request()
      .input('groupId', sql.Int,              groupId)
      .input('userId',  sql.UniqueIdentifier, userId)
      .query(`
        SELECT g.is_disabled AS isDisabled,
               gm.user_id   AS memberUserId
        FROM comm_groups g
        LEFT JOIN comm_group_members gm
          ON gm.group_id = g.group_id AND gm.user_id = @userId
        WHERE g.group_id = @groupId AND g.is_active = 1
      `);
  }
  const r = result.recordset[0];
  if (!r || !r.memberUserId) {
    const e = new Error('You are no longer a member of this group');
    e.statusCode = 403; throw e;
  }
  if (r.isDisabled) {
    const e = new Error('This group has been disabled. No new messages can be sent, but past messages remain visible.');
    e.statusCode = 403; throw e;
  }
}

// Conversation creation helper (runs inside a transaction via reqFn)
async function createConversation(reqFn, { subject, createdBy, allowReply, groupId = null, convType = 'bcc' }) {
  const result = await reqFn()
    .input('subject',    sql.NVarChar,        subject)
    .input('createdBy',  sql.UniqueIdentifier, createdBy)
    .input('allowReply', sql.Bit,              allowReply ? 1 : 0)
    .input('groupId',    sql.Int,              groupId)
    .input('convType',   sql.NVarChar,         convType)
    .query(`
      INSERT INTO comm_conversations (subject, created_by, allow_reply, group_id, conv_type, last_message_at)
      OUTPUT INSERTED.conversation_id, INSERTED.subject
      VALUES (@subject, @createdBy, @allowReply, @groupId, @convType, SYSDATETIMEOFFSET())
    `);
  return result.recordset[0];
}

// Participant upsert helper (runs inside a transaction via reqFn)
async function addParticipants(reqFn, conversationId, userIds, participantType = 'to') {
  const unique = [...new Set(userIds.map(String))];
  for (const uid of unique) {
    await reqFn()
      .input('convId', sql.Int,              conversationId)
      .input('uid',    sql.UniqueIdentifier, uid)
      .input('ptype',  sql.NVarChar,         participantType)
      .query(`
        MERGE comm_participants AS target
        USING (SELECT @convId AS conversation_id, @uid AS user_id, @ptype AS participant_type) AS source
        ON (target.conversation_id = source.conversation_id AND target.user_id = source.user_id)
        WHEN MATCHED THEN UPDATE SET
          is_deleted       = 0,
          is_archived      = 0,
          archived_at      = CASE WHEN target.is_deleted = 1 THEN NULL ELSE target.archived_at END,
          participant_type = source.participant_type,
          -- Re-adding someone who was previously removed (target.is_deleted
          -- = 1): deliberately do NOT touch left_at — it's preserved as the
          -- boundary marking the end of their ORIGINAL window (everything
          -- they could see before they were removed). rejoined_at is
          -- stamped as the start of their NEW window (everything from now
          -- on). getThread() then shows messages from either window while
          -- excluding the gap between left_at and rejoined_at — i.e. the
          -- time they were actually removed. joined_at is left untouched
          -- here on purpose: it's the absolute original join time and
          -- should never change again after the very first insert.
          rejoined_at      = CASE WHEN target.is_deleted = 1 THEN SYSDATETIMEOFFSET() ELSE target.rejoined_at END
        WHEN NOT MATCHED THEN INSERT (conversation_id, user_id, participant_type, joined_at)
          VALUES (source.conversation_id, source.user_id, source.participant_type, SYSDATETIMEOFFSET());
      `);
  }
}

async function insertMessage(reqFn, conversationId, senderId, bodyHtml, parentMessageId = null) {
  const result = await reqFn()
    .input('convId',          sql.Int,              conversationId)
    .input('senderId',        sql.UniqueIdentifier, senderId)
    .input('bodyHtml',        sql.NVarChar,         bodyHtml)
    .input('parentMessageId', sql.Int,              parentMessageId)
    .query(`
      INSERT INTO comm_messages (conversation_id, sender_id, body_html, parent_message_id)
      OUTPUT INSERTED.message_id
      VALUES (@convId, @senderId, @bodyHtml, @parentMessageId)
    `);
  return result.recordset[0].message_id;
}

async function linkAttachmentsToMessage(reqFn, messageId, attachmentIds, uploadedBy) {
  for (const id of attachmentIds) {
    await reqFn()
      .input('messageId',   sql.Int,              messageId)
      .input('attachId',    sql.Int,              id)
      .input('uploadedBy',  sql.UniqueIdentifier, uploadedBy)
      .query(`
        UPDATE comm_attachments
        SET message_id = @messageId
        WHERE attachment_id = @attachId
          AND uploaded_by   = @uploadedBy
          AND message_id IS NULL
      `);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Send message
// ─────────────────────────────────────────────────────────────────────────────

async function sendMessage(senderUserId, payload) {
  await ensureParticipantArchiveColumn();

  const {
    recipientIds         = [],
    groupIds             = [],
    expandedGroupMembers = [],
    subject,
    bodyHtml,
    allowReply   = true,
    attachmentIds = [],
    mode         = 'bcc',
  } = payload;

  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const e = new Error('Message body is required'); e.statusCode = 400; throw e;
  }
  if (!subject?.trim()) {
    const e = new Error('Subject is required'); e.statusCode = 400; throw e;
  }

  const pool = await getPool();

  // ── CC mode ───────────────────────────────────────────────────────────────
  if (mode === 'cc') {
    const groupMemberIds = await getMemberUserIdsForGroups(groupIds, senderUserId);
    const allRecipients  = [...new Set([
      ...recipientIds.filter(id => String(id) !== String(senderUserId)),
      ...groupMemberIds,
    ])];

    if (!allRecipients.length) {
      const e = new Error('At least one recipient is required'); e.statusCode = 400; throw e;
    }
    await assertNoAdminRecipients(allRecipients);

    return withTransaction(async (req) => {
      const conv = await createConversation(req, {
        subject: subject.trim(), createdBy: senderUserId, allowReply, convType: 'cc',
      });
      await addParticipants(req, conv.conversation_id, [senderUserId], 'to');
      await addParticipants(req, conv.conversation_id, allRecipients, 'cc');
      const messageId = await insertMessage(req, conv.conversation_id, senderUserId, sanitizedBody);
      await linkAttachmentsToMessage(req, messageId, attachmentIds, senderUserId);
      await req()
        .input('convId', sql.Int, conv.conversation_id)
        .query(`UPDATE comm_conversations SET last_message_at = SYSDATETIMEOFFSET() WHERE conversation_id = @convId`);

      const senderRes = await pool.request()
        .input('userId', sql.UniqueIdentifier, senderUserId)
        .query(`SELECT first_name, last_name, email FROM auth_users WHERE user_id = @userId`);

      return [{
        conversationId:  conv.conversation_id,
        messageId,
        subject:         conv.subject,
        senderName:      displayName(senderRes.recordset[0]),
        senderUserId,
        participantIds:  [senderUserId, ...allRecipients],
        mode: 'cc',
      }];
    });
  }

  // ── Group-thread mode ─────────────────────────────────────────────────────
  if (mode === 'group_thread') {
    const results = [];
    for (const groupId of groupIds) {
      const result = await withTransaction(async (req) => {
        await assertActiveGroupMember(groupId, senderUserId, req);

        const existingRes = await req()
          .input('groupId', sql.Int, groupId)
          .query(`
            SELECT TOP 1 conversation_id
            FROM comm_conversations
            WHERE group_id = @groupId AND is_deleted = 0
            ORDER BY last_message_at DESC
          `);

        let conversationId, participantIds;
        const memberIds    = await getMemberUserIdsForGroups([groupId]);
        const activeMembers = [...new Set([...memberIds, senderUserId].map(String))];

        if (existingRes.recordset[0]) {
          conversationId = existingRes.recordset[0].conversation_id;
          await addParticipants(req, conversationId, activeMembers, 'to');
          participantIds = activeMembers;
        } else {
          const grpRes = await req()
            .input('groupId', sql.Int, groupId)
            .query(`SELECT group_name FROM comm_groups WHERE group_id = @groupId`);
          const conv = await createConversation(req, {
            subject:    subject?.trim() || grpRes.recordset[0]?.group_name || 'Group Message',
            createdBy:  senderUserId,
            allowReply,
            groupId,
            convType: 'group_thread',
          });
          conversationId = conv.conversation_id;
          await addParticipants(req, conversationId, activeMembers, 'to');
          participantIds = activeMembers;
        }

        const messageId = await insertMessage(req, conversationId, senderUserId, sanitizedBody);
        await linkAttachmentsToMessage(req, messageId, attachmentIds, senderUserId);
        await req()
          .input('convId', sql.Int, conversationId)
          .query(`UPDATE comm_conversations SET last_message_at = SYSDATETIMEOFFSET() WHERE conversation_id = @convId`);

        const senderRes = await pool.request()
          .input('userId', sql.UniqueIdentifier, senderUserId)
          .query(`SELECT first_name, last_name, email FROM auth_users WHERE user_id = @userId`);

        return { conversationId, messageId, subject, senderName: displayName(senderRes.recordset[0]), senderUserId, participantIds, mode: 'group_thread', groupId };
      });
      results.push(result);
    }
    return results;
  }

  // ── BCC mode (one private thread per recipient) ───────────────────────────
  let groupDerivedIds;
  if (expandedGroupMembers.length > 0) {
    groupDerivedIds = expandedGroupMembers
      .map(m => m.userId || m.id)
      .filter(id => id && String(id) !== String(senderUserId));
  } else {
    groupDerivedIds = await getMemberUserIdsForGroups(groupIds, senderUserId);
  }

  const uniqueRecipients = [...new Set([
    ...recipientIds.filter(id => String(id) !== String(senderUserId)),
    ...groupDerivedIds,
  ])];

  if (!uniqueRecipients.length) {
    const e = new Error('At least one recipient is required'); e.statusCode = 400; throw e;
  }
  await assertNoAdminRecipients(uniqueRecipients);

  const results = [];
  for (const recipientId of uniqueRecipients) {
    const r = await withTransaction(async (req) => {
      const conv = await createConversation(req, {
        subject: subject.trim(), createdBy: senderUserId, allowReply, convType: 'bcc',
      });
      await addParticipants(req, conv.conversation_id, [senderUserId],  'to');
      await addParticipants(req, conv.conversation_id, [recipientId],   'bcc');
      const messageId = await insertMessage(req, conv.conversation_id, senderUserId, sanitizedBody);
      await linkAttachmentsToMessage(req, messageId, attachmentIds, senderUserId);
      await req()
        .input('convId', sql.Int, conv.conversation_id)
        .query(`UPDATE comm_conversations SET last_message_at = SYSDATETIMEOFFSET() WHERE conversation_id = @convId`);

      const senderRes = await pool.request()
        .input('userId', sql.UniqueIdentifier, senderUserId)
        .query(`SELECT first_name, last_name, email FROM auth_users WHERE user_id = @userId`);

      return {
        conversationId:  conv.conversation_id,
        messageId,
        subject:         conv.subject,
        senderName:      displayName(senderRes.recordset[0]),
        senderUserId,
        participantIds:  [senderUserId, recipientId],
        mode: 'bcc',
      };
    });
    results.push(r);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Remove / Add participant
// ─────────────────────────────────────────────────────────────────────────────

async function removeParticipant(conversationId, targetUserId, actorUserId) {
  await ensureParticipantArchiveColumn();
  const pool = await getPool();
  const res  = await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`SELECT created_by, conv_type FROM comm_conversations WHERE conversation_id = @convId AND is_deleted = 0`);

  if (!res.recordset[0]) {
    const e = new Error('Conversation not found'); e.statusCode = 404; throw e;
  }
  if (String(res.recordset[0].created_by) !== String(actorUserId)) {
    const e = new Error('Only the sender can remove participants'); e.statusCode = 403; throw e;
  }
  if (res.recordset[0].conv_type !== 'cc') {
    const e = new Error('Participants can only be removed from CC (Shared) conversations');
    e.statusCode = 400; throw e;
  }
  if (String(targetUserId) === String(actorUserId)) {
    const e = new Error('You cannot remove yourself from a conversation you created');
    e.statusCode = 400; throw e;
  }
  await pool.request()
    .input('convId',       sql.Int,              conversationId)
    .input('targetUserId', sql.UniqueIdentifier, targetUserId)
    .query(`
      UPDATE comm_participants
      SET is_deleted = 1,
          left_at    = COALESCE(left_at, SYSDATETIMEOFFSET())
      WHERE conversation_id = @convId AND user_id = @targetUserId
    `);
  return true;
}

async function addParticipant(conversationId, userIds, actorUserId, actorUserType) {
  await ensureParticipantArchiveColumn();
  const pool = await getPool();
  const res  = await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`SELECT created_by, conv_type, is_disabled FROM comm_conversations WHERE conversation_id = @convId AND is_deleted = 0`);

  if (!res.recordset[0]) {
    const e = new Error('Conversation not found'); e.statusCode = 404; throw e;
  }
  const conv = res.recordset[0];
  if (conv.conv_type !== 'cc') {
    const e = new Error('Participants can only be added to CC (Shared) conversations');
    e.statusCode = 400; throw e;
  }
  if (conv.is_disabled) {
    const e = new Error('This thread is disabled. Re-enable it before adding participants.');
    e.statusCode = 400; throw e;
  }

  const isCreator = String(conv.created_by) === String(actorUserId);
  let isSuperAdmin = actorUserType === 'admin';
  if (!isCreator && !isSuperAdmin) {
    const uRes = await pool.request()
      .input('actorId', sql.UniqueIdentifier, actorUserId)
      .query(`SELECT user_type FROM auth_users WHERE user_id = @actorId`);
    isSuperAdmin = uRes.recordset[0]?.user_type === 'admin';
  }
  if (!isCreator && !isSuperAdmin) {
    const e = new Error('Only the conversation creator or a super admin can add participants');
    e.statusCode = 403; throw e;
  }

  // Block super-admin accounts from being added
  const targetIds = [...new Set(userIds.map(String))];
  if (targetIds.length) {
    const req = pool.request();
    const ph  = targetIds.map((id, i) => { req.input(`tid${i}`, sql.UniqueIdentifier, id); return `@tid${i}`; });
    const adminCheck = await req.query(
      `SELECT user_id, user_type FROM auth_users WHERE user_id IN (${ph.join(',')}) AND user_type = 'admin'`
    );
    if (adminCheck.recordset.length) {
      const e = new Error('Cannot add super-admin accounts as participants');
      e.statusCode = 400; throw e;
    }
  }

  return withTransaction(async (req) => {
    await addParticipants(req, conversationId, targetIds, 'cc');
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reply
// ─────────────────────────────────────────────────────────────────────────────

async function replyToConversation(conversationId, senderUserId, payload) {
  const { bodyHtml, attachmentIds = [], parentMessageId = null } = payload;
  await assertConversationParticipant(conversationId, senderUserId);
  await ensureParticipantArchiveColumn();

  const pool = await getPool();
  const convRes = await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`
      SELECT allow_reply, is_deleted, conv_type, group_id, is_disabled
      FROM comm_conversations WHERE conversation_id = @convId
    `);

  const conv = convRes.recordset[0];
  if (!conv || conv.is_deleted) {
    const e = new Error('Conversation not found'); e.statusCode = 404; throw e;
  }
  if (!conv.allow_reply) {
    const e = new Error('Replies are not allowed'); e.statusCode = 403; throw e;
  }
  // FIX Bug 3: previously is_disabled was only checked for non-group
  // threads (the else branch). For group_thread conversations the code
  // relied solely on assertActiveGroupMember which checks
  // comm_groups.is_disabled — but if the conversation row itself was
  // disabled directly via disableThread() (comm_conversations.is_disabled),
  // a group member could still reply because the group_thread branch never
  // read that column. Now both paths check it.
  if (conv.is_disabled) {
    const e = new Error('This thread has been disabled. No new messages can be sent, but past messages remain visible.');
    e.statusCode = 403; throw e;
  }
  if (conv.conv_type === 'group_thread') {
    await assertActiveGroupMember(conv.group_id, senderUserId);
  }

  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const e = new Error('Message body is required'); e.statusCode = 400; throw e;
  }

  return withTransaction(async (req) => {
    const messageId = await insertMessage(req, conversationId, senderUserId, sanitizedBody, parentMessageId);
    await linkAttachmentsToMessage(req, messageId, attachmentIds, senderUserId);
    await req()
      .input('convId', sql.Int, conversationId)
      .query(`UPDATE comm_conversations SET last_message_at = SYSDATETIMEOFFSET() WHERE conversation_id = @convId`);
    await req()
      .input('convId', sql.Int, conversationId)
      .query(`UPDATE comm_participants SET is_archived = 0 WHERE conversation_id = @convId AND is_deleted = 0`);

    // NOTE: read these through req() (the transaction's own connection),
    // not a fresh pool.request(). A separate connection reading rows this
    // same open transaction just updated above would block under MSSQL's
    // default locking until the transaction commits — but commit can't
    // happen until this callback returns, which is waiting on that read.
    // That's a self-deadlock that wouldn't necessarily surface under
    // Postgres' MVCC, so it's an easy thing to miss in this migration.
    const metaRes   = await req()
      .input('convId', sql.Int, conversationId)
      .query(`SELECT subject, group_id AS groupId, conv_type AS convType FROM comm_conversations WHERE conversation_id = @convId`);
    const senderRes = await req()
      .input('userId', sql.UniqueIdentifier, senderUserId)
      .query(`SELECT first_name, last_name, email FROM auth_users WHERE user_id = @userId`);
    const participantRes = await req()
      .input('convId', sql.Int, conversationId)
      .query(`SELECT user_id FROM comm_participants WHERE conversation_id = @convId AND is_deleted = 0`);
    const participantIds = participantRes.recordset.map(r => r.user_id);

    // Fetch sent_at of the new message so socket payload is complete
    const msgRes = await req()
      .input('messageId', sql.Int, messageId)
      .query(`SELECT sent_at AS createdAt FROM comm_messages WHERE message_id = @messageId`);

    const meta = metaRes.recordset[0] || {};

    // If it's a group thread, look up the group name too
    let groupName = null;
    if (meta.groupId) {
      const grpRes = await req()
        .input('gid', sql.Int, meta.groupId)
        .query(`SELECT group_name FROM comm_groups WHERE group_id = @gid`);
      groupName = grpRes.recordset[0]?.group_name || null;
    }

    return {
      conversationId, messageId,
      subject:     meta.subject,
      senderName:  displayName(senderRes.recordset[0]),
      senderUserId, participantIds,
      groupId:   meta.groupId   || null,
      groupName: groupName      || null,
      convType:  meta.convType  || null,
      bodyHtml:  sanitizedBody,
      createdAt: msgRes.recordset[0]?.createdAt || new Date().toISOString(),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbox / Sent
// ─────────────────────────────────────────────────────────────────────────────

async function getInbox(userId, page = 1, limit = 30) {
  await ensureParticipantArchiveColumn();
  const pool   = await getPool();
  const offset = (Math.max(page, 1) - 1) * limit;

  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(`
      SELECT
        c.conversation_id AS conversationId,
        c.subject,
        c.last_message_at AS latestAt,
        c.created_at      AS createdAt,
        c.allow_reply     AS allowReply,
        c.conv_type       AS convType,
        c.created_by      AS createdBy,
        c.group_id        AS groupId,
        (
          SELECT CAST(COUNT(*) AS INT)
          FROM comm_participants cp
          WHERE cp.conversation_id = c.conversation_id AND cp.is_deleted = 0
        ) AS participantCount,
        COALESCE(NULLIF(TRIM(CONCAT(su.first_name,' ',su.last_name)),''), su.email, 'Unknown') AS latestSender,
        LEFT(lm.body_html, 120) AS preview,
        cg.group_name AS groupName,
        (
          SELECT STRING_AGG(
              COALESCE(NULLIF(TRIM(CONCAT(u2.first_name,' ',u2.last_name)),''), u2.email),
              ', '
            ) WITHIN GROUP (ORDER BY u2.first_name, u2.last_name)
          FROM comm_participants p2
          INNER JOIN auth_users u2 ON u2.user_id = p2.user_id
          WHERE p2.conversation_id = c.conversation_id
            AND p2.user_id <> @userId AND p2.is_deleted = 0
        ) AS participantNames,
        (
          SELECT CAST(COUNT(*) AS INT)
          FROM comm_messages um
          WHERE um.conversation_id = c.conversation_id
            AND um.is_deleted = 0
            AND um.sent_at > COALESCE(p.archived_at, '1753-01-01')
            AND um.sent_at <= COALESCE(p.left_at, '9999-12-31')
            AND um.sender_id <> @userId
            AND NOT EXISTS (
              SELECT 1 FROM comm_read_receipts rr
              WHERE rr.message_id = um.message_id AND rr.user_id = @userId
            )
        ) AS unreadCount
      FROM comm_conversations c
      INNER JOIN comm_participants p
        ON p.conversation_id = c.conversation_id
        AND p.user_id = @userId AND p.is_deleted = 0 AND p.is_archived = 0
      OUTER APPLY (
        SELECT TOP 1 body_html, sender_id
        FROM comm_messages
        WHERE conversation_id = c.conversation_id AND is_deleted = 0
          AND sent_at > COALESCE(p.archived_at, '1753-01-01')
          AND sent_at <= COALESCE(p.left_at, '9999-12-31')
        ORDER BY sent_at DESC
      ) lm
      LEFT JOIN auth_users su ON su.user_id = lm.sender_id
      LEFT JOIN comm_groups cg ON cg.group_id = c.group_id
      LEFT JOIN comm_group_hidden gh
        ON gh.group_id = c.group_id AND gh.user_id = @userId
      WHERE c.is_deleted = 0 AND gh.user_id IS NULL
      ORDER BY c.last_message_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  return { conversations: result.recordset, page, limit };
}

async function getSent(userId, page = 1, limit = 30) {
  const pool   = await getPool();
  const offset = (Math.max(page, 1) - 1) * limit;

  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(`
      SELECT
        c.conversation_id AS conversationId,
        c.subject,
        c.last_message_at AS latestAt,
        c.created_at      AS createdAt,
        c.allow_reply     AS allowReply,
        c.conv_type       AS convType,
        c.created_by      AS createdBy,
        c.group_id        AS groupId,
        (
          SELECT CAST(COUNT(*) AS INT)
          FROM comm_participants cp
          WHERE cp.conversation_id = c.conversation_id AND cp.is_deleted = 0
        ) AS participantCount,
        'You' AS latestSender,
        LEFT(lm.body_html, 120) AS preview,
        0 AS unreadCount,
        cg.group_name AS groupName,
        (
          SELECT STRING_AGG(
              COALESCE(NULLIF(TRIM(CONCAT(u2.first_name,' ',u2.last_name)),''), u2.email),
              ', '
            ) WITHIN GROUP (ORDER BY u2.first_name, u2.last_name)
          FROM comm_participants p2
          INNER JOIN auth_users u2 ON u2.user_id = p2.user_id
          WHERE p2.conversation_id = c.conversation_id
            AND p2.user_id <> @userId AND p2.is_deleted = 0
        ) AS participantNames
      FROM comm_conversations c
      INNER JOIN comm_participants p
        ON p.conversation_id = c.conversation_id
        AND p.user_id = @userId AND p.is_deleted = 0
      OUTER APPLY (
        SELECT TOP 1 body_html
        FROM comm_messages
        WHERE conversation_id = c.conversation_id AND is_deleted = 0
        ORDER BY sent_at DESC
      ) lm
      LEFT JOIN comm_groups cg ON cg.group_id = c.group_id
      LEFT JOIN comm_group_hidden gh
        ON gh.group_id = c.group_id AND gh.user_id = @userId
      WHERE c.is_deleted = 0 AND c.created_by = @userId AND gh.user_id IS NULL
      ORDER BY c.last_message_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  return { conversations: result.recordset, page, limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unread counts
// ─────────────────────────────────────────────────────────────────────────────

async function getUnreadCount(userId) {
  await ensureParticipantArchiveColumn();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT CAST(COUNT(DISTINCT m.conversation_id) AS INT) AS cnt
      FROM comm_messages m
      INNER JOIN comm_participants p
        ON p.conversation_id = m.conversation_id
        AND p.user_id = @userId AND p.is_deleted = 0 AND p.is_archived = 0
      INNER JOIN comm_conversations c
        ON c.conversation_id = m.conversation_id AND c.is_deleted = 0
      WHERE m.is_deleted = 0 AND m.sender_id <> @userId
        AND m.sent_at > COALESCE(p.archived_at, '1753-01-01')
        AND m.sent_at <= COALESCE(p.left_at, '9999-12-31')
        AND NOT EXISTS (
          SELECT 1 FROM comm_read_receipts rr
          WHERE rr.message_id = m.message_id AND rr.user_id = @userId
        )
    `);
  return result.recordset[0]?.cnt ?? 0;
}

async function getUnreadConversationIds(userId) {
  await ensureParticipantArchiveColumn();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT DISTINCT m.conversation_id AS conversationId
      FROM comm_messages m
      INNER JOIN comm_participants p
        ON p.conversation_id = m.conversation_id
        AND p.user_id = @userId AND p.is_deleted = 0 AND p.is_archived = 0
      INNER JOIN comm_conversations c
        ON c.conversation_id = m.conversation_id AND c.is_deleted = 0
      WHERE m.is_deleted = 0 AND m.sender_id <> @userId
        AND m.sent_at > COALESCE(p.archived_at, '1753-01-01')
        AND m.sent_at <= COALESCE(p.left_at, '9999-12-31')
        AND NOT EXISTS (
          SELECT 1 FROM comm_read_receipts rr
          WHERE rr.message_id = m.message_id AND rr.user_id = @userId
        )
    `);
  return result.recordset.map(r => r.conversationId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

async function searchMessages(userId, query) {
  await ensureParticipantArchiveColumn();
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('search', sql.NVarChar, `%${query}%`)
    .query(`
      SELECT DISTINCT
        c.conversation_id AS conversationId,
        c.subject,
        c.last_message_at AS latestAt
      FROM comm_conversations c
      INNER JOIN comm_participants p
        ON p.conversation_id = c.conversation_id
        AND p.user_id = @userId AND p.is_deleted = 0 AND p.is_archived = 0
      LEFT JOIN comm_messages m
        ON m.conversation_id = c.conversation_id AND m.is_deleted = 0
        AND m.sent_at > COALESCE(p.archived_at, '1753-01-01')
        AND m.sent_at <= COALESCE(p.left_at, '9999-12-31')
      WHERE c.is_deleted = 0 AND (c.subject LIKE @search OR m.body_html LIKE @search)
      ORDER BY c.last_message_at DESC
      OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY
    `);
  return result.recordset;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get thread
// ─────────────────────────────────────────────────────────────────────────────

async function getThread(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);
  await ensureParticipantArchiveColumn();

  const pool = await getPool();

  const convRes = await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`
      SELECT conversation_id AS conversationId, subject,
             allow_reply     AS allowReply,
             conv_type       AS convType,
             created_by      AS createdBy,
             group_id        AS groupId,
             is_disabled     AS isThreadDisabled,
             created_at      AS createdAt,
             last_message_at AS lastMessageAt
      FROM comm_conversations
      WHERE conversation_id = @convId AND is_deleted = 0
    `);

  const convRow = convRes.recordset[0];
  if (!convRow) {
    const e = new Error('Conversation not found'); e.statusCode = 404; throw e;
  }

  // FIX Bug 4: previously group_thread participants were read from
  // comm_group_members directly, bypassing comm_participants entirely.
  // This meant a removed group participant (who has left_at set in
  // comm_participants via removeMember) still appeared in the thread's
  // participant list because comm_group_members has no left_at concept.
  // Non-group threads used comm_participants WHERE is_deleted=0 — the two
  // paths were inconsistent.
  //
  // Fix: use comm_participants for both paths (which has is_deleted/left_at
  // populated correctly by addMembers/removeMember), but for group threads
  // enrich each row with the isAdmin/isCoAdmin/isCreator flags from the
  // group member table so the UI can show admin badges correctly.
  //
  // NOTE: the "currently active" check is is_deleted = 0 alone — NOT also
  // left_at IS NULL. left_at is intentionally preserved (not cleared) when
  // someone is re-added after being removed, since it marks the end of
  // their original viewing window for getThread()'s gap-exclusion logic
  // (see addParticipants() / the message-visibility query below). A
  // currently-active re-added member would incorrectly disappear from this
  // list if left_at IS NULL were still required here.
  let partRes;
  if (convRow.convType === 'group_thread') {
    partRes = await pool.request()
      .input('convId',   sql.Int, conversationId)
      .input('groupId',  sql.Int, convRow.groupId)
      .query(`
        SELECT
          p.user_id          AS userId,
          p.participant_type AS participantType,
          u.first_name       AS firstName,
          u.last_name        AS lastName,
          u.email,
          CAST(CASE WHEN g.created_by = p.user_id          THEN 1 ELSE 0 END AS BIT) AS isCreator,
          CAST(COALESCE(gm.is_co_admin, 0)                 AS BIT)                   AS isCoAdmin,
          CAST(CASE WHEN g.created_by = p.user_id
                      OR COALESCE(gm.is_co_admin, 0) = 1   THEN 1 ELSE 0 END AS BIT) AS isAdmin
        FROM comm_participants p
        LEFT JOIN auth_users        u  ON u.user_id  = p.user_id
        LEFT JOIN comm_groups       g  ON g.group_id = @groupId
        LEFT JOIN comm_group_members gm ON gm.group_id = @groupId AND gm.user_id = p.user_id
        WHERE p.conversation_id = @convId
          AND p.is_deleted = 0
        ORDER BY u.first_name, u.last_name
      `);
  } else {
    partRes = await pool.request()
      .input('convId', sql.Int, conversationId)
      .query(`
        SELECT p.user_id AS userId, p.participant_type AS participantType,
               u.first_name AS firstName, u.last_name AS lastName, u.email
        FROM comm_participants p
        LEFT JOIN auth_users u ON u.user_id = p.user_id
        WHERE p.conversation_id = @convId AND p.is_deleted = 0
        ORDER BY u.first_name, u.last_name
      `);
  }

  const curPartRes = await pool.request()
    .input('convId', sql.Int,              conversationId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT archived_at AS archivedAt, left_at AS leftAt, joined_at AS joinedAt, rejoined_at AS rejoinedAt
      FROM comm_participants
      WHERE conversation_id = @convId AND user_id = @userId
    `);

  // ── Super-admin governance path ──────────────────────────────────────────
  // assertConversationParticipant (above) has a super-admin bypass so admins
  // can reach this function for the Threads tab's manage-panel
  // (participants list, disable/enable). Message content is intentionally
  // off-limits for admins — they are not participants and the UI never
  // renders a chat window for them. We enforce the same restriction here at
  // the API level so that the JSON response never carries message history to
  // the admin's browser at all.
  //
  // The reliable signal: every genuine participant always has a
  // comm_participants row (sendMessage/addParticipants always inserts one).
  // If that row is absent yet the user passed the access guard, they got
  // through via the super-admin bypass — return governance-only payload.
  if (!curPartRes.recordset[0]) {
    const adminCheck = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`SELECT 1 AS ok FROM auth_users WHERE user_id = @userId AND user_type = 'admin'`);
    if (adminCheck.recordset[0]) {
      return {
        conversation: {
          ...convRow,
          participants:    partRes.recordset,
          userCanReply:    false,
          isGroupDisabled: Boolean(convRow.isThreadDisabled),
          archivedAt:      null,
          leftAt:          null,
        },
        messages: [], // admins never receive message content
      };
    }
  }

  const isThreadDisabled = Boolean(convRow.isThreadDisabled);
  let userCanReply  = Boolean(convRow.allowReply);
  let isGroupDisabled = false;

  if (convRow.convType === 'group_thread') {
    const memberRes = await pool.request()
      .input('convId', sql.Int,              conversationId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT g.is_disabled AS isDisabled,
               gm.user_id   AS memberUserId
        FROM comm_conversations c
        INNER JOIN comm_groups g ON g.group_id = c.group_id
        LEFT  JOIN comm_group_members gm
          ON gm.group_id = g.group_id AND gm.user_id = @userId
        WHERE c.conversation_id = @convId
      `);
    const mr = memberRes.recordset[0];
    isGroupDisabled = Boolean(mr?.isDisabled) || isThreadDisabled;
    // Only actual members (not super-admin observers) can reply
    userCanReply    = userCanReply && Boolean(mr?.memberUserId) && !isGroupDisabled;
  } else {
    isGroupDisabled = isThreadDisabled;
    userCanReply    = userCanReply && !isThreadDisabled;
  }

  const archivedAt = curPartRes.recordset[0]?.archivedAt || null;
  const leftAt     = curPartRes.recordset[0]?.leftAt     || null;
  const joinedAt   = curPartRes.recordset[0]?.joinedAt   || null;
  const rejoinedAt = curPartRes.recordset[0]?.rejoinedAt || null;

  // FIX Bug 8: passing null as sql.DateTimeOffset parameter and then
  // COALESCE-ing with a varchar literal '1753-01-01' triggers implicit
  // type-conversion in some SQL Server versions. Use concrete
  // DATETIMEOFFSET values when the DB values are null, binding them as
  // proper typed parameters to avoid any implicit cast warnings.
  const archivedBound = archivedAt  || new Date('1753-01-01T00:00:00Z');

  // A participant added mid-conversation (via the "add participant"/"add
  // member" flow) should only ever see messages sent after they joined —
  // never the conversation's prior history. joined_at defaults to the row's
  // creation time, so founding participants (who joined before the first
  // message existed) are unaffected; this only actually excludes anything
  // for someone added later. Take whichever bound is more recent: if they
  // later archived-then-unarchived AFTER joining, that more recent archive
  // timestamp should win; otherwise joined_at is the real floor.
  const visibilityFloor = joinedAt && joinedAt > archivedBound ? joinedAt : archivedBound;

  // Gap window: if this participant was removed and later re-added, left_at
  // marks the end of their ORIGINAL window and rejoined_at marks the start
  // of their NEW one — the time in between (while they were actually
  // removed) should stay hidden. The SQL below expresses this as:
  //   sent_at > visibilityFloor
  //   AND (left_at IS NULL OR sent_at <= left_at OR sent_at > rejoinedAt)
  // i.e. normal participants (left_at NULL) just use the floor as usual;
  // a removed-and-since-re-added participant additionally sees everything
  // up to their original left_at, OR anything after they came back —
  // with the gap between those two points excluded.


  const msgRes = await pool.request()
    .input('convId',       sql.Int,            conversationId)
    .input('visibleFrom',  sql.DateTimeOffset,  visibilityFloor)
  .input('leftAt', sql.DateTimeOffset, leftAt)
  .input('rejoinedAt', sql.DateTimeOffset, rejoinedAt)
    .query(`
      SELECT
        m.message_id,
        m.conversation_id,
        m.sender_id,
        m.parent_message_id,
        m.body_html,
        m.sent_at,
        m.is_system,
        COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email, 'Unknown') AS sender_name,
        pm.body_html  AS parent_body_html,
        pm.is_deleted AS parent_is_deleted,
        COALESCE(NULLIF(TRIM(CONCAT(pu.first_name,' ',pu.last_name)),''), pu.email) AS parent_sender_name,
        (
          SELECT a.attachment_id AS attachmentId,
                 a.original_name AS originalName,
                 a.mime_type     AS mimeType,
                 a.file_size     AS fileSize
          FROM comm_attachments a
          WHERE a.message_id = m.message_id AND a.is_deleted = 0
          FOR JSON PATH
        ) AS attachments,
        (
          SELECT CAST(rr.user_id AS NVARCHAR(36)) AS userId,
                 COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''), ru.email, CAST(rr.user_id AS NVARCHAR(36))) AS userName,
                 rr.read_at AS readAt
          FROM comm_read_receipts rr
          LEFT JOIN auth_users ru ON ru.user_id = rr.user_id
          WHERE rr.message_id = m.message_id AND rr.user_id <> m.sender_id
          FOR JSON PATH
        ) AS read_receipts
      FROM comm_messages m
      LEFT JOIN auth_users  u  ON u.user_id  = m.sender_id
      LEFT JOIN comm_messages pm ON pm.message_id = m.parent_message_id
      LEFT JOIN auth_users  pu ON pu.user_id = pm.sender_id
      WHERE m.conversation_id = @convId
        AND m.is_deleted = 0
        AND m.sent_at > @visibleFrom
        AND (
      @leftAt IS NULL
      OR m.sent_at <= @leftAt
      OR m.sent_at > @rejoinedAt
    )
      ORDER BY m.sent_at ASC
    `);

  return {
    conversation: {
      ...convRow,
      participants:   partRes.recordset,
      userCanReply,
      isGroupDisabled,
      archivedAt,
      leftAt,
    },
    messages: msgRes.recordset.map(mapThreadMessage),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark read
// ─────────────────────────────────────────────────────────────────────────────

async function markMessageRead(messageId, userId) {
  const pool = await getPool();

  // FIX Bug 2: block sender from creating a receipt on their own message.
  // Previously no check here — the DB write would succeed, the receipt row
  // would be filtered out in getThread's FOR JSON subquery (WHERE rr.user_id
  // <> m.sender_id), but the row would still exist as junk data and could
  // surface if that filter were ever missed.
  //
  // FIX Bug 6: block super admin from writing receipts on conversations they
  // aren't a real participant of. assertConversationParticipant allows super
  // admin through unconditionally — but a receipt row from a super admin
  // user_id appears as a named "read by" entry for all other participants of
  // that thread (a private BCC between two colleagues would show "read by
  // Admin" which is both wrong and a privacy violation).
  // We use the strict participant check (no super-admin bypass) here.

  const accessRes = await pool.request()
    .input('messageId', sql.Int,              messageId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      SELECT m.message_id, m.conversation_id, m.sender_id
      FROM comm_messages m
      WHERE m.message_id = @messageId AND m.is_deleted = 0
        AND (
          -- Direct participant (BCC / CC threads)
          EXISTS (
            SELECT 1 FROM comm_participants p
            WHERE p.conversation_id = m.conversation_id
              AND p.user_id = @userId AND p.is_deleted = 0
          )
          OR
          -- Conversation creator
          EXISTS (
            SELECT 1 FROM comm_conversations c
            WHERE c.conversation_id = m.conversation_id
              AND c.created_by = @userId AND c.is_deleted = 0
          )
          OR
          -- Group thread member
          EXISTS (
            SELECT 1 FROM comm_conversations c
            INNER JOIN comm_group_members gm ON gm.group_id = c.group_id
            WHERE c.conversation_id = m.conversation_id
              AND gm.user_id = @userId AND c.conv_type = 'group_thread'
          )
        )
    `);

  if (!accessRes.recordset[0]) {
    const e = new Error('Message not found or access denied'); e.statusCode = 404; throw e;
  }

  // Silently succeed if sender tries to mark their own message — no error
  // (client shouldn't do this, but don't break UX if it does), just no DB write.
  if (String(accessRes.recordset[0].sender_id) === String(userId)) {
    const nameRes = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''), email) AS name FROM auth_users WHERE user_id = @userId`);
    return {
      messageId, userId,
      conversationId: accessRes.recordset[0].conversation_id,
      readAt:   new Date().toISOString(),
      userName: nameRes.recordset[0]?.name || 'Someone',
    };
  }

  await pool.request()
    .input('messageId', sql.Int,              messageId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM comm_read_receipts WHERE message_id = @messageId AND user_id = @userId)
        INSERT INTO comm_read_receipts (message_id, user_id) VALUES (@messageId, @userId)
    `);

  const nameRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''), email) AS name
      FROM auth_users WHERE user_id = @userId
    `);

  return {
    messageId, userId,
    conversationId: accessRes.recordset[0].conversation_id,
    readAt:         new Date().toISOString(),
    userName:       nameRes.recordset[0]?.name || 'Someone',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Archive / Delete message
// ─────────────────────────────────────────────────────────────────────────────

async function archiveConversation(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);
  await ensureParticipantArchiveColumn();
  const pool = await getPool();
  await pool.request()
    .input('convId', sql.Int,              conversationId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      UPDATE comm_participants
      SET is_archived = 1, archived_at = SYSDATETIMEOFFSET()
      WHERE conversation_id = @convId AND user_id = @userId AND is_deleted = 0
    `);
  return true;
}

async function softDeleteMessage(messageId, userId) {
  const pool = await getPool();
  const res  = await pool.request()
    .input('messageId', sql.Int,              messageId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .query(`
      UPDATE comm_messages SET is_deleted = 1
      WHERE message_id = @messageId AND sender_id = @userId AND is_deleted = 0
    `);
  if (!res.rowsAffected[0]) {
    const e = new Error('Message not found or cannot be deleted'); e.statusCode = 404; throw e;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email digest
// ─────────────────────────────────────────────────────────────────────────────

async function getUsersForUnreadDigest() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      u.user_id    AS userId,
      u.email,
      u.first_name AS firstName,
      u.last_name  AS lastName,
      CAST(COUNT(m.message_id) AS INT) AS unreadCount
    FROM auth_users u
    INNER JOIN comm_participants  p ON p.user_id = u.user_id AND p.is_deleted = 0 AND p.is_archived = 0
    INNER JOIN comm_messages      m ON m.conversation_id = p.conversation_id AND m.is_deleted = 0 AND m.sender_id <> u.user_id
    INNER JOIN comm_conversations c ON c.conversation_id = m.conversation_id AND c.is_deleted = 0
    WHERE u.is_active = 1 AND u.required_email_notification = 1 AND u.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM comm_read_receipts rr WHERE rr.message_id = m.message_id AND rr.user_id = u.user_id)
    GROUP BY u.user_id, u.email, u.first_name, u.last_name
    HAVING COUNT(m.message_id) > 0
  `);
  return result.recordset;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin thread management (Threads tab — mirrors groupService for comm_groups)
// ─────────────────────────────────────────────────────────────────────────────

async function listAllThreadsForAdmin(userId) {
  const pool = await getPool();

  const meRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`SELECT user_type AS userType FROM auth_users WHERE user_id = @userId`);

  if (meRes.recordset[0]?.userType !== 'admin') {
    const e = new Error('Only a super admin can view all threads');
    e.statusCode = 403; throw e;
  }

  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        c.conversation_id AS conversationId,
        c.subject,
        c.created_at      AS createdAt,
        c.created_by      AS createdBy,
        c.conv_type       AS convType,
        c.is_disabled     AS isDisabled,
        CAST(0 AS BIT)    AS isAdmin,
        CAST(1 AS BIT)    AS isSuperAdmin,
        CAST(0 AS BIT)    AS isMember,
        (
          SELECT CAST(COUNT(*) AS INT)
          FROM comm_participants p2
          WHERE p2.conversation_id = c.conversation_id AND p2.is_deleted = 0
        ) AS participantCount
      FROM comm_conversations c
      LEFT JOIN comm_conversation_hidden ch
        ON ch.conversation_id = c.conversation_id AND ch.user_id = @userId
      WHERE c.is_deleted = 0
        AND c.conv_type = 'cc'
        AND ch.user_id IS NULL
      ORDER BY c.is_disabled ASC, c.created_at DESC
    `);
  return result.recordset;
}

async function disableThread(conversationId, actorUserId) {
  await assertThreadAdmin(conversationId, actorUserId);
  const pool = await getPool();
  await pool.request()
    .input('convId', sql.Int,              conversationId)
    .input('actor',  sql.UniqueIdentifier, actorUserId)
    .query(`
      UPDATE comm_conversations
      SET is_disabled = 1, disabled_at = SYSDATETIMEOFFSET(), disabled_by = @actor
      WHERE conversation_id = @convId
    `);
  return true;
}

async function enableThread(conversationId, actorUserId) {
  await assertThreadAdmin(conversationId, actorUserId);
  const pool = await getPool();
  await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`
      UPDATE comm_conversations
      SET is_disabled = 0, disabled_at = NULL, disabled_by = NULL
      WHERE conversation_id = @convId
    `);
  return true;
}

async function deleteThreadForActor(conversationId, actorUserId) {
  await assertThreadAdmin(conversationId, actorUserId);
  const pool = await getPool();

  const res = await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`SELECT is_disabled FROM comm_conversations WHERE conversation_id = @convId`);

  if (!res.recordset[0]) {
    const e = new Error('Thread not found'); e.statusCode = 404; throw e;
  }
  if (!res.recordset[0].is_disabled) {
    const e = new Error('Disable the thread before deleting it.'); e.statusCode = 400; throw e;
  }

  await pool.request()
    .input('convId', sql.Int,              conversationId)
    .input('actor',  sql.UniqueIdentifier, actorUserId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM comm_conversation_hidden WHERE conversation_id = @convId AND user_id = @actor)
        INSERT INTO comm_conversation_hidden (conversation_id, user_id) VALUES (@convId, @actor)
    `);
  return true;
}

async function hideDisabledThreadForUser(conversationId, userId) {
  const pool = await getPool();
  const res  = await pool.request()
    .input('convId', sql.Int, conversationId)
    .query(`SELECT is_disabled FROM comm_conversations WHERE conversation_id = @convId`);

  if (!res.recordset[0]) {
    const e = new Error('Thread not found'); e.statusCode = 404; throw e;
  }
  if (!res.recordset[0].is_disabled) {
    const e = new Error('You can only remove a thread from your tabs after it has been disabled.');
    e.statusCode = 400; throw e;
  }

  await assertConversationParticipant(conversationId, userId);

  await pool.request()
    .input('convId', sql.Int,              conversationId)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM comm_conversation_hidden WHERE conversation_id = @convId AND user_id = @userId)
        INSERT INTO comm_conversation_hidden (conversation_id, user_id) VALUES (@convId, @userId)
    `);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit message (sender only, within MESSAGE_EDIT_DEADLINE_MINUTES)
// ─────────────────────────────────────────────────────────────────────────────
async function editMessage(messageId, userId, newBodyHtml) {
  const deadlineMinutes = parseInt(process.env.MESSAGE_EDIT_DEADLINE_MINUTES || '10', 10);
  const sanitized = sanitizeBodyHtml(newBodyHtml);

  const pool = await getPool();
  const result = await pool.request()
    .input('messageId', sql.Int,             messageId)
    .input('userId',    sql.UniqueIdentifier, userId)
    .input('bodyHtml',  sql.NVarChar,         sanitized)
    .input('deadline',  sql.Int,              deadlineMinutes)
    .query(`
      UPDATE comm_messages
      SET    body_html  = @bodyHtml,
             is_edited  = 1,
             edited_at  = SYSDATETIMEOFFSET()
      OUTPUT INSERTED.message_id       AS messageId,
             INSERTED.conversation_id  AS conversationId,
             INSERTED.sender_id        AS senderId,
             INSERTED.body_html        AS bodyHtml,
             INSERTED.is_edited        AS isEdited,
             INSERTED.edited_at        AS editedAt
      WHERE  message_id = @messageId
        AND  sender_id  = @userId
        AND  is_deleted = 0
        AND  DATEDIFF(MINUTE, sent_at, SYSDATETIMEOFFSET()) <= @deadline
    `);

  if (!result.recordset.length) {
    const err = new Error('Cannot edit this message — either it is not yours, already deleted, or the edit window has passed.');
    err.statusCode = 403;
    throw err;
  }
  return result.recordset[0];
}

module.exports = {
  sanitizeBodyHtml, sendMessage, replyToConversation, removeParticipant,
  getInbox, getSent, getUnreadCount, getUnreadConversationIds,
  searchMessages, getThread, markMessageRead, archiveConversation,
  softDeleteMessage, getUsersForUnreadDigest,
  assertConversationParticipant, getParticipantUserIds,
  addParticipant,
  isThreadAdminOrSuperAdmin, assertThreadAdmin,
  listAllThreadsForAdmin, disableThread, enableThread,
  deleteThreadForActor, hideDisabledThreadForUser,
  editMessage,
  ensureParticipantArchiveColumn,
};