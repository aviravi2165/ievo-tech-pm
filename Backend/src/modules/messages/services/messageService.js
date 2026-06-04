/**
 * messageService.js — PostgreSQL version
 * Tables: comm_conversations, comm_participants, comm_messages,
 *         comm_attachments, comm_read_receipts, auth_users
 */

const { getPool } = require('../../../config/db');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeBodyHtml(html = '') {
  // Server-side strip of obviously dangerous tags.
  // Full DOMPurify sanitisation happens client-side.
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .trim();
}

function displayName(row) {
  if (!row) return 'Unknown';
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return name || row.email || 'Unknown';
}

async function assertConversationParticipant(conversationId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT participant_id
     FROM comm_participants
     WHERE conversation_id = $1
       AND user_id = $2
       AND is_deleted = FALSE`,
    [conversationId, userId]
  );
  if (!rows[0]) {
    const err = new Error('Conversation not found or access denied');
    err.statusCode = 403;
    throw err;
  }
}

async function getParticipantUserIds(conversationId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT user_id FROM comm_participants
     WHERE conversation_id = $1 AND is_deleted = FALSE`,
    [conversationId]
  );
  return rows.map(r => r.user_id);
}

async function getMemberUserIdsForGroups(groupIds = []) {
  if (!groupIds.length) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT user_id
     FROM comm_group_members
     WHERE group_id = ANY($1::int[])`,
    [groupIds]
  );
  return rows.map(r => r.user_id);
}

async function resolveRecipientUserIds(recipientIds = [], groupIds = []) {
  const ids = new Set(recipientIds.filter(Boolean));
  const groupMemberIds = await getMemberUserIdsForGroups(groupIds);
  groupMemberIds.forEach(id => ids.add(id));
  return [...ids];
}

async function linkAttachmentsToMessage(client, messageId, attachmentIds, uploadedBy) {
  for (const attachmentId of attachmentIds) {
    await client.query(
      `UPDATE comm_attachments
       SET message_id = $1
       WHERE attachment_id = $2 AND uploaded_by = $3 AND message_id IS NULL`,
      [messageId, attachmentId, uploadedBy]
    );
  }
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
    attachments:     row.attachments  || [],
    readReceipts:    row.read_receipts || [],
    parentMessage:   row.parent_message_id
      ? { messageId: row.parent_message_id, senderName: row.parent_sender_name, bodyHtml: row.parent_body_html }
      : null,
  };
}

// ── Send new conversation ─────────────────────────────────────────────────────

async function sendMessage(senderUserId, payload) {
  const {
    recipientIds = [],
    groupIds     = [],
    subject,
    bodyHtml,
    allowReply   = true,
    attachmentIds = [],
  } = payload;

  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const err = new Error('Message body is required');
    err.statusCode = 400;
    throw err;
  }

  const recipientUserIds = await resolveRecipientUserIds(recipientIds, groupIds);
  const uniqueParticipants = [...new Set([...recipientUserIds, senderUserId])];

  if (uniqueParticipants.length < 2) {
    const err = new Error('At least one recipient is required');
    err.statusCode = 400;
    throw err;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create conversation
    const convRes = await client.query(
      `INSERT INTO comm_conversations (subject, created_by, allow_reply, last_message_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING conversation_id, subject`,
      [subject, senderUserId, allowReply]
    );
    const conversation = convRes.rows[0];

    // 2. Insert participants
    for (const uid of uniqueParticipants) {
      await client.query(
        `INSERT INTO comm_participants (conversation_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_deleted = FALSE, is_archived = FALSE`,
        [conversation.conversation_id, uid]
      );
    }

    // 3. Insert message
    const msgRes = await client.query(
      `INSERT INTO comm_messages (conversation_id, sender_id, body_html)
       VALUES ($1, $2, $3)
       RETURNING message_id`,
      [conversation.conversation_id, senderUserId, sanitizedBody]
    );
    const messageId = msgRes.rows[0].message_id;

    // 4. Link attachments
    await linkAttachmentsToMessage(client, messageId, attachmentIds, senderUserId);

    // 5. Update last_message_at
    await client.query(
      `UPDATE comm_conversations SET last_message_at = NOW()
       WHERE conversation_id = $1`,
      [conversation.conversation_id]
    );

    await client.query('COMMIT');

    // Fetch sender name
    const senderRes = await pool.query(
      `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1`,
      [senderUserId]
    );

    return {
      conversationId: conversation.conversation_id,
      messageId,
      subject:        conversation.subject,
      senderName:     displayName(senderRes.rows[0]),
      participantIds: uniqueParticipants,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Reply ─────────────────────────────────────────────────────────────────────

async function replyToConversation(conversationId, senderUserId, payload) {
  const { bodyHtml, attachmentIds = [], parentMessageId = null } = payload;

  await assertConversationParticipant(conversationId, senderUserId);

  const pool = getPool();
  const { rows: convRows } = await pool.query(
    `SELECT allow_reply, is_deleted FROM comm_conversations WHERE conversation_id = $1`,
    [conversationId]
  );
  const conv = convRows[0];
  if (!conv || conv.is_deleted) {
    const err = new Error('Conversation not found'); err.statusCode = 404; throw err;
  }
  if (!conv.allow_reply) {
    const err = new Error('Replies are not allowed on this conversation'); err.statusCode = 403; throw err;
  }

  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const err = new Error('Message body is required'); err.statusCode = 400; throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const msgRes = await client.query(
      `INSERT INTO comm_messages (conversation_id, sender_id, body_html, parent_message_id)
       VALUES ($1, $2, $3, $4)
       RETURNING message_id`,
      [conversationId, senderUserId, sanitizedBody, parentMessageId || null]
    );
    const messageId = msgRes.rows[0].message_id;

    await linkAttachmentsToMessage(client, messageId, attachmentIds, senderUserId);

    await client.query(
      `UPDATE comm_conversations SET last_message_at = NOW() WHERE conversation_id = $1`,
      [conversationId]
    );

    await client.query('COMMIT');

    const metaRes = await pool.query(
      `SELECT subject FROM comm_conversations WHERE conversation_id = $1`,
      [conversationId]
    );
    const senderRes = await pool.query(
      `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1`,
      [senderUserId]
    );
    const participantIds = await getParticipantUserIds(conversationId);

    return {
      conversationId,
      messageId,
      subject:        metaRes.rows[0]?.subject,
      senderName:     displayName(senderRes.rows[0]),
      participantIds,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

async function getInbox(userId, page = 1, limit = 30) {
  const pool = getPool();
  const offset = (Math.max(page, 1) - 1) * limit;

  const { rows } = await pool.query(
    `SELECT
       c.conversation_id   AS "conversationId",
       c.subject,
       c.last_message_at   AS "latestAt",
       c.created_at        AS "createdAt",
       c.allow_reply       AS "allowReply",
       COALESCE(
         NULLIF(TRIM(CONCAT(su.first_name, ' ', su.last_name)), ''),
         su.email, 'Unknown'
       )                   AS "latestSender",
       LEFT(lm.body_html, 120) AS preview,
       (
         SELECT COUNT(*)::int
         FROM comm_messages um
         WHERE um.conversation_id = c.conversation_id
           AND um.is_deleted = FALSE
           AND um.sender_id <> $1::uuid
           AND NOT EXISTS (
             SELECT 1 FROM comm_read_receipts rr
             WHERE rr.message_id = um.message_id AND rr.user_id = $1::uuid
           )
       ) AS "unreadCount"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $1::uuid
       AND p.is_deleted = FALSE
       AND p.is_archived = FALSE
     LEFT JOIN LATERAL (
       SELECT body_html, sender_id
       FROM comm_messages
       WHERE conversation_id = c.conversation_id AND is_deleted = FALSE
       ORDER BY sent_at DESC LIMIT 1
     ) lm ON TRUE
     LEFT JOIN auth_users su ON su.user_id = lm.sender_id
     WHERE c.is_deleted = FALSE
     ORDER BY c.last_message_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return { conversations: rows, page, limit };
}

// ── Sent ──────────────────────────────────────────────────────────────────────

async function getSent(userId, page = 1, limit = 30) {
  const pool = getPool();
  const offset = (Math.max(page, 1) - 1) * limit;

  const { rows } = await pool.query(
    `SELECT
       c.conversation_id   AS "conversationId",
       c.subject,
       c.last_message_at   AS "latestAt",
       c.created_at        AS "createdAt",
       c.allow_reply       AS "allowReply",
       'You'               AS "latestSender",
       LEFT(lm.body_html, 120) AS preview,
       0                   AS "unreadCount"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $1::uuid
       AND p.is_deleted = FALSE
     LEFT JOIN LATERAL (
       SELECT body_html
       FROM comm_messages
       WHERE conversation_id = c.conversation_id AND is_deleted = FALSE
       ORDER BY sent_at DESC LIMIT 1
     ) lm ON TRUE
     WHERE c.is_deleted = FALSE
       AND c.created_by = $1::uuid
     ORDER BY c.last_message_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return { conversations: rows, page, limit };
}

// ── Unread count ──────────────────────────────────────────────────────────────

async function getUnreadCount(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM comm_messages m
     INNER JOIN comm_participants p
       ON p.conversation_id = m.conversation_id
       AND p.user_id = $1::uuid
       AND p.is_deleted = FALSE
       AND p.is_archived = FALSE
     INNER JOIN comm_conversations c
       ON c.conversation_id = m.conversation_id AND c.is_deleted = FALSE
     WHERE m.is_deleted = FALSE
       AND m.sender_id <> $1::uuid
       AND NOT EXISTS (
         SELECT 1 FROM comm_read_receipts rr
         WHERE rr.message_id = m.message_id AND rr.user_id = $1::uuid
       )`,
    [userId]
  );
  return rows[0]?.count ?? 0;
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchMessages(userId, query) {
  const pool = getPool();
  const pattern = `%${query}%`;

  const { rows } = await pool.query(
    `SELECT DISTINCT
       c.conversation_id AS "conversationId",
       c.subject,
       c.last_message_at AS "latestAt"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $1::uuid
       AND p.is_deleted = FALSE
       AND p.is_archived = FALSE
     LEFT JOIN comm_messages m
       ON m.conversation_id = c.conversation_id AND m.is_deleted = FALSE
     WHERE c.is_deleted = FALSE
       AND (c.subject ILIKE $2 OR m.body_html ILIKE $2)
     ORDER BY c.last_message_at DESC
     LIMIT 50`,
    [userId, pattern]
  );

  return rows;
}

// ── Thread ────────────────────────────────────────────────────────────────────

async function getThread(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);

  const pool = getPool();

  // Conversation + participants
  const convRes = await pool.query(
    `SELECT conversation_id AS "conversationId", subject, allow_reply AS "allowReply",
            created_at AS "createdAt", last_message_at AS "lastMessageAt"
     FROM comm_conversations
     WHERE conversation_id = $1 AND is_deleted = FALSE`,
    [conversationId]
  );

  if (!convRes.rows[0]) {
    const err = new Error('Conversation not found'); err.statusCode = 404; throw err;
  }

  const partRes = await pool.query(
    `SELECT p.user_id AS "userId", u.first_name AS "firstName",
            u.last_name AS "lastName", u.email
     FROM comm_participants p
     LEFT JOIN auth_users u ON u.user_id = p.user_id
     WHERE p.conversation_id = $1 AND p.is_deleted = FALSE`,
    [conversationId]
  );

  // Messages with attachments and read receipts as JSON arrays
  const msgRes = await pool.query(
    `SELECT
       m.message_id,
       m.conversation_id,
       m.sender_id,
       m.parent_message_id,
       m.body_html,
       m.sent_at,
       COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email, 'Unknown') AS sender_name,
       pm.body_html   AS parent_body_html,
       COALESCE(NULLIF(TRIM(CONCAT(pu.first_name, ' ', pu.last_name)), ''), pu.email) AS parent_sender_name,
       COALESCE(
         (SELECT JSON_AGG(JSON_BUILD_OBJECT(
           'attachmentId', a.attachment_id,
           'originalName', a.original_name,
           'mimeType',     a.mime_type,
           'fileSize',     a.file_size
         ))
         FROM comm_attachments a
         WHERE a.message_id = m.message_id AND a.is_deleted = FALSE),
         '[]'
       ) AS attachments,
       COALESCE(
         (SELECT JSON_AGG(JSON_BUILD_OBJECT(
           'userId',  rr.user_id,
           'readAt',  rr.read_at
         ))
         FROM comm_read_receipts rr
         WHERE rr.message_id = m.message_id),
         '[]'
       ) AS read_receipts
     FROM comm_messages m
     LEFT JOIN auth_users u  ON u.user_id  = m.sender_id
     LEFT JOIN comm_messages pm ON pm.message_id = m.parent_message_id
     LEFT JOIN auth_users pu ON pu.user_id = pm.sender_id
     WHERE m.conversation_id = $1 AND m.is_deleted = FALSE
     ORDER BY m.sent_at ASC`,
    [conversationId]
  );

  return {
    conversation: { ...convRes.rows[0], participants: partRes.rows },
    messages: msgRes.rows.map(mapThreadMessage),
  };
}

// ── Mark read ─────────────────────────────────────────────────────────────────

async function markMessageRead(messageId, userId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT m.message_id, m.conversation_id
     FROM comm_messages m
     INNER JOIN comm_participants p
       ON p.conversation_id = m.conversation_id
       AND p.user_id = $2::uuid AND p.is_deleted = FALSE
     WHERE m.message_id = $1 AND m.is_deleted = FALSE`,
    [messageId, userId]
  );

  if (!rows[0]) {
    const err = new Error('Message not found or access denied'); err.statusCode = 404; throw err;
  }

  await pool.query(
    `INSERT INTO comm_read_receipts (message_id, user_id)
     VALUES ($1, $2::uuid)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [messageId, userId]
  );

  return {
    messageId,
    userId,
    conversationId: rows[0].conversation_id,
    readAt: new Date().toISOString(),
  };
}

// ── Archive ───────────────────────────────────────────────────────────────────

async function archiveConversation(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);
  const pool = getPool();
  await pool.query(
    `UPDATE comm_participants SET is_archived = TRUE
     WHERE conversation_id = $1 AND user_id = $2::uuid AND is_deleted = FALSE`,
    [conversationId, userId]
  );
  return true;
}

// ── Soft delete message ───────────────────────────────────────────────────────

async function softDeleteMessage(messageId, userId) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE comm_messages SET is_deleted = TRUE
     WHERE message_id = $1 AND sender_id = $2::uuid AND is_deleted = FALSE`,
    [messageId, userId]
  );
  if (!rowCount) {
    const err = new Error('Message not found or cannot be deleted'); err.statusCode = 404; throw err;
  }
  return true;
}

// ── Email digest helper ───────────────────────────────────────────────────────

async function getUsersForUnreadDigest() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       u.user_id    AS "userId",
       u.email,
       u.first_name AS "firstName",
       u.last_name  AS "lastName",
       COUNT(m.message_id)::int AS "unreadCount"
     FROM auth_users u
     INNER JOIN comm_participants p
       ON p.user_id = u.user_id AND p.is_deleted = FALSE AND p.is_archived = FALSE
     INNER JOIN comm_messages m
       ON m.conversation_id = p.conversation_id
       AND m.is_deleted = FALSE AND m.sender_id <> u.user_id
     INNER JOIN comm_conversations c
       ON c.conversation_id = m.conversation_id AND c.is_deleted = FALSE
     WHERE u.is_active = TRUE
       AND u.required_email_notification = TRUE
       AND u.email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM comm_read_receipts rr
         WHERE rr.message_id = m.message_id AND rr.user_id = u.user_id
       )
     GROUP BY u.user_id, u.email, u.first_name, u.last_name
     HAVING COUNT(m.message_id) > 0`
  );
  return rows;
}

module.exports = {
  sanitizeBodyHtml,
  sendMessage,
  replyToConversation,
  getInbox,
  getSent,
  getUnreadCount,
  searchMessages,
  getThread,
  markMessageRead,
  archiveConversation,
  softDeleteMessage,
  getUsersForUnreadDigest,
  assertConversationParticipant,
  getParticipantUserIds,
};