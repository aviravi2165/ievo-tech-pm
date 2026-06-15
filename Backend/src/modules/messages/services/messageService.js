/**
 * messageService.js
 *
 * Send modes:
 *   'bcc'         — default. One conversation per recipient. Nobody sees others. (existing behaviour)
 *   'cc'          — one shared conversation. All participants see each other. Removable.
 *   'group_thread'— message goes into existing group conversation (or creates one).
 *
 * Schema addition required (run once):
 *   ALTER TABLE comm_conversations
 *     ADD COLUMN IF NOT EXISTS conv_type VARCHAR(10) NOT NULL DEFAULT 'bcc'
 *       CHECK (conv_type IN ('bcc','cc','group_thread'));
 *
 *   ALTER TABLE comm_participants
 *     ADD COLUMN IF NOT EXISTS participant_type VARCHAR(10) NOT NULL DEFAULT 'to'
 *       CHECK (participant_type IN ('to','cc','bcc'));
 */

const { getPool } = require('../../../config/db');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeBodyHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .trim();
}

function displayName(row) {
  if (!row) return 'Unknown';
  return [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || 'Unknown';
}

async function assertConversationParticipant(conversationId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT participant_id FROM comm_participants
     WHERE conversation_id = $1 AND user_id = $2 AND is_deleted = FALSE`,
    [conversationId, userId]
  );
  if (!rows[0]) {
    const err = new Error('Conversation not found or access denied');
    err.statusCode = 403; throw err;
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
    `SELECT DISTINCT gm.user_id,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email) AS name,
            u.email
     FROM comm_group_members gm
     LEFT JOIN auth_users u ON u.user_id = gm.user_id
     WHERE gm.group_id = ANY($1::int[])`,
    [groupIds]
  );
  return rows;
}

async function linkAttachmentsToMessage(client, messageId, attachmentIds, uploadedBy) {
  for (const id of attachmentIds) {
    await client.query(
      `UPDATE comm_attachments SET message_id = $1
       WHERE attachment_id = $2 AND uploaded_by = $3 AND message_id IS NULL`,
      [messageId, id, uploadedBy]
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
    attachments:     row.attachments   || [],
    readReceipts:    row.read_receipts || [],
    parentMessage:   row.parent_message_id ? {
      messageId:  row.parent_message_id,
      senderName: row.parent_sender_name,
      bodyHtml:   row.parent_body_html,
    } : null,
  };
}

// ── Create one conversation (shared helper) ───────────────────────────────────

async function createConversation(client, {
  subject, createdBy, allowReply, groupId = null, convType = 'bcc',
}) {
  const { rows } = await client.query(
    `INSERT INTO comm_conversations
       (subject, created_by, allow_reply, group_id, conv_type, last_message_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING conversation_id, subject`,
    [subject, createdBy, allowReply, groupId, convType]
  );
  return rows[0];
}

async function addParticipants(client, conversationId, userIds, participantType = 'to') {
  for (const uid of userIds) {
    await client.query(
      `INSERT INTO comm_participants (conversation_id, user_id, participant_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET is_deleted = FALSE, is_archived = FALSE, participant_type = $3`,
      [conversationId, uid, participantType]
    );
  }
}

async function insertMessage(client, conversationId, senderId, bodyHtml, parentMessageId = null) {
  const { rows } = await client.query(
    `INSERT INTO comm_messages (conversation_id, sender_id, body_html, parent_message_id)
     VALUES ($1, $2, $3, $4)
     RETURNING message_id`,
    [conversationId, senderId, bodyHtml, parentMessageId || null]
  );
  return rows[0].message_id;
}

// ── sendMessage ───────────────────────────────────────────────────────────────
/**
 * payload.mode:
 *   'bcc'          — each recipient (and each group member) gets their own private conversation
 *   'cc'           — one shared conversation, all recipients see each other
 *   'group_thread' — sends to group's shared conversation (finds existing or creates new)
 *
 * payload.recipientIds  — individual user UUIDs
 * payload.groupIds      — group IDs (behaviour depends on mode)
 * payload.expandedGroupMembers — [{ id, name, email }] already-expanded members from frontend
 *                                Used when user chose to expand-and-send individually
 */
async function sendMessage(senderUserId, payload) {
  const {
    recipientIds         = [],
    groupIds             = [],
    expandedGroupMembers = [],   // pre-expanded by frontend for bcc group send
    subject,
    bodyHtml,
    allowReply  = true,
    attachmentIds = [],
    mode        = 'bcc',         // 'bcc' | 'cc' | 'group_thread'
  } = payload;

  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const err = new Error('Message body is required'); err.statusCode = 400; throw err;
  }

  const pool = getPool();

  // ── CC mode: one shared thread, all see each other ────────────────────────
  if (mode === 'cc') {
    // Collect all individual recipients + expand all groups
    const groupMemberRows = await getMemberUserIdsForGroups(groupIds);
    const groupMemberIds  = groupMemberRows.map(r => r.user_id);
    const allRecipients   = [...new Set([...recipientIds, ...groupMemberIds])];
    const allParticipants = [...new Set([...allRecipients, senderUserId])];

    if (allParticipants.length < 2) {
      const err = new Error('At least one recipient is required'); err.statusCode = 400; throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const conv = await createConversation(client, {
        subject, createdBy: senderUserId, allowReply, convType: 'cc',
      });
      // Sender is 'to', recipients are 'cc'
      await addParticipants(client, conv.conversation_id, [senderUserId], 'to');
      await addParticipants(client, conv.conversation_id, allRecipients, 'cc');
      const messageId = await insertMessage(client, conv.conversation_id, senderUserId, sanitizedBody);
      await linkAttachmentsToMessage(client, messageId, attachmentIds, senderUserId);
      await client.query(
        `UPDATE comm_conversations SET last_message_at = NOW() WHERE conversation_id = $1`,
        [conv.conversation_id]
      );
      await client.query('COMMIT');
      const senderRes = await pool.query(
        `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1`, [senderUserId]
      );
      return [{
        conversationId: conv.conversation_id, messageId,
        subject: conv.subject,
        senderName: displayName(senderRes.rows[0]),
        senderUserId, participantIds: allParticipants,
        mode: 'cc',
      }];
    } catch (err) {
      await client.query('ROLLBACK'); throw err;
    } finally {
      client.release();
    }
  }

  // ── Group-thread mode: send to group's shared conversation ────────────────
  if (mode === 'group_thread') {
    const results = [];
    for (const groupId of groupIds) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Find or create the group's shared conversation
        const { rows: existing } = await client.query(
          `SELECT conversation_id FROM comm_conversations
           WHERE group_id = $1 AND is_deleted = FALSE
           ORDER BY last_message_at DESC LIMIT 1`,
          [groupId]
        );

        let conversationId;
        let participantIds;

        if (existing[0]) {
          conversationId = existing[0].conversation_id;
          // Ensure sender is in the conversation
          await client.query(
            `INSERT INTO comm_participants (conversation_id, user_id, participant_type)
             VALUES ($1, $2, 'to')
             ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_deleted = FALSE`,
            [conversationId, senderUserId]
          );
          participantIds = await getParticipantUserIds(conversationId);
        } else {
          // Create new group conversation
          const { rows: grpInfo } = await client.query(
            `SELECT group_name FROM comm_groups WHERE group_id = $1`, [groupId]
          );
          const conv = await createConversation(client, {
            subject: subject || grpInfo[0]?.group_name || 'Group Message',
            createdBy: senderUserId, allowReply, groupId, convType: 'group_thread',
          });
          conversationId = conv.conversation_id;

          // Add all group members
          const groupMemberRows = await getMemberUserIdsForGroups([groupId]);
          const members = [...new Set([...groupMemberRows.map(r => r.user_id), senderUserId])];
          await addParticipants(client, conversationId, members, 'to');
          participantIds = members;
        }

        const messageId = await insertMessage(client, conversationId, senderUserId, sanitizedBody);
        await linkAttachmentsToMessage(client, messageId, attachmentIds, senderUserId);
        await client.query(
          `UPDATE comm_conversations SET last_message_at = NOW() WHERE conversation_id = $1`,
          [conversationId]
        );
        await client.query('COMMIT');

        const senderRes = await pool.query(
          `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1`, [senderUserId]
        );
        results.push({
          conversationId, messageId, subject,
          senderName: displayName(senderRes.rows[0]),
          senderUserId, participantIds, mode: 'group_thread', groupId,
        });
      } catch (err) {
        await client.query('ROLLBACK'); throw err;
      } finally {
        client.release();
      }
    }
    return results;
  }

  // ── BCC mode (default): one private conversation per recipient ────────────
  // Collect all individual recipients
  // expandedGroupMembers = already expanded by frontend (user chose expand-then-send)
  // groupIds without expansion = each group member gets individual conv
  const groupMemberRows = expandedGroupMembers.length > 0
    ? expandedGroupMembers
    : await getMemberUserIdsForGroups(groupIds);
  const groupMemberIds = groupMemberRows.map(r => r.user_id || r.id).filter(Boolean);
  const allRecipients  = [...new Set([...recipientIds, ...groupMemberIds])];
  allRecipients.push(senderUserId);
  const uniqueRecipients = [...new Set(allRecipients)].filter(id => id !== senderUserId);

  if (uniqueRecipients.length === 0) {
    const err = new Error('At least one recipient is required'); err.statusCode = 400; throw err;
  }

  const results = [];
  for (const recipientId of uniqueRecipients) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const conv = await createConversation(client, {
        subject, createdBy: senderUserId, allowReply, convType: 'bcc',
      });
      await addParticipants(client, conv.conversation_id, [senderUserId, recipientId], 'to');
      const messageId = await insertMessage(client, conv.conversation_id, senderUserId, sanitizedBody);
      await linkAttachmentsToMessage(client, messageId, attachmentIds, senderUserId);
      await client.query(
        `UPDATE comm_conversations SET last_message_at = NOW() WHERE conversation_id = $1`,
        [conv.conversation_id]
      );
      await client.query('COMMIT');
      const senderRes = await pool.query(
        `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1`, [senderUserId]
      );
      results.push({
        conversationId: conv.conversation_id, messageId,
        subject: conv.subject,
        senderName: displayName(senderRes.rows[0]),
        senderUserId, participantIds: [senderUserId, recipientId], mode: 'bcc',
      });
    } catch (err) {
      await client.query('ROLLBACK'); throw err;
    } finally {
      client.release();
    }
  }
  return results;
}

// ── Remove participant from CC thread ─────────────────────────────────────────

async function removeParticipant(conversationId, targetUserId, actorUserId) {
  // Only the creator/sender can remove participants, and only from CC threads
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT created_by, conv_type FROM comm_conversations
     WHERE conversation_id = $1 AND is_deleted = FALSE`,
    [conversationId]
  );
  if (!rows[0]) {
    const err = new Error('Conversation not found'); err.statusCode = 404; throw err;
  }
  if (String(rows[0].created_by) !== String(actorUserId)) {
    const err = new Error('Only the sender can remove participants'); err.statusCode = 403; throw err;
  }
  if (rows[0].conv_type !== 'cc') {
    const err = new Error('Participants can only be removed from CC conversations');
    err.statusCode = 400; throw err;
  }
  await pool.query(
    `UPDATE comm_participants SET is_deleted = TRUE
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, targetUserId]
  );
  return true;
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
    const err = new Error('Replies are not allowed'); err.statusCode = 403; throw err;
  }
  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const err = new Error('Message body is required'); err.statusCode = 400; throw err;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const messageId = await insertMessage(client, conversationId, senderUserId, sanitizedBody, parentMessageId);
    await linkAttachmentsToMessage(client, messageId, attachmentIds, senderUserId);
    await client.query(
      `UPDATE comm_conversations SET last_message_at = NOW() WHERE conversation_id = $1`,
      [conversationId]
    );
    await client.query(
      `UPDATE comm_participants SET is_archived = FALSE
       WHERE conversation_id = $1 AND is_deleted = FALSE`,
      [conversationId]
    );
    await client.query('COMMIT');
    const metaRes   = await pool.query(
      `SELECT subject FROM comm_conversations WHERE conversation_id = $1`, [conversationId]
    );
    const senderRes = await pool.query(
      `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1`, [senderUserId]
    );
    const participantIds = await getParticipantUserIds(conversationId);
    return {
      conversationId, messageId,
      subject:    metaRes.rows[0]?.subject,
      senderName: displayName(senderRes.rows[0]),
      senderUserId, participantIds,
    };
  } catch (err) {
    await client.query('ROLLBACK'); throw err;
  } finally {
    client.release();
  }
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

async function getInbox(userId, page = 1, limit = 30) {
  const pool   = getPool();
  const offset = (Math.max(page, 1) - 1) * limit;
  const { rows } = await pool.query(
    `SELECT
       c.conversation_id  AS "conversationId",
       c.subject,
       c.last_message_at  AS "latestAt",
       c.created_at       AS "createdAt",
       c.allow_reply      AS "allowReply",
       c.conv_type        AS "convType",
       (SELECT COUNT(*)::int FROM comm_participants cp
        WHERE cp.conversation_id = c.conversation_id AND cp.is_deleted = FALSE
       )                  AS "participantCount",
       COALESCE(NULLIF(TRIM(CONCAT(su.first_name,' ',su.last_name)),''), su.email, 'Unknown') AS "latestSender",
       LEFT(lm.body_html, 120) AS preview,
       cg.group_name      AS "groupName",
       (SELECT STRING_AGG(
           COALESCE(NULLIF(TRIM(CONCAT(u2.first_name,' ',u2.last_name)),''), u2.email),
           ', ' ORDER BY u2.first_name, u2.last_name
         )
         FROM comm_participants p2
         INNER JOIN auth_users u2 ON u2.user_id = p2.user_id
         WHERE p2.conversation_id = c.conversation_id
           AND p2.user_id <> $1::uuid AND p2.is_deleted = FALSE
       )                  AS "participantNames",
       (SELECT COUNT(*)::int
        FROM comm_messages um
        WHERE um.conversation_id = c.conversation_id
          AND um.is_deleted = FALSE
          AND um.sender_id <> $1::uuid
          AND NOT EXISTS (
            SELECT 1 FROM comm_read_receipts rr
            WHERE rr.message_id = um.message_id AND rr.user_id = $1::uuid
          )
       )                  AS "unreadCount"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE AND p.is_archived = FALSE
     LEFT JOIN LATERAL (
       SELECT body_html, sender_id FROM comm_messages
       WHERE conversation_id = c.conversation_id AND is_deleted = FALSE
       ORDER BY sent_at DESC LIMIT 1
     ) lm ON TRUE
     LEFT JOIN auth_users su ON su.user_id = lm.sender_id
     LEFT JOIN comm_groups cg ON cg.group_id = c.group_id
     WHERE c.is_deleted = FALSE
     ORDER BY c.last_message_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { conversations: rows, page, limit };
}

// ── Sent ──────────────────────────────────────────────────────────────────────

async function getSent(userId, page = 1, limit = 30) {
  const pool   = getPool();
  const offset = (Math.max(page, 1) - 1) * limit;
  const { rows } = await pool.query(
    `SELECT
       c.conversation_id  AS "conversationId",
       c.subject,
       c.last_message_at  AS "latestAt",
       c.created_at       AS "createdAt",
       c.allow_reply      AS "allowReply",
       c.conv_type        AS "convType",
       (SELECT COUNT(*)::int FROM comm_participants cp
        WHERE cp.conversation_id = c.conversation_id AND cp.is_deleted = FALSE
       )                  AS "participantCount",
       'You'              AS "latestSender",
       LEFT(lm.body_html, 120) AS preview,
       0 AS "unreadCount",
       cg.group_name AS "groupName",
       (SELECT STRING_AGG(
           COALESCE(NULLIF(TRIM(CONCAT(u2.first_name,' ',u2.last_name)),''), u2.email),
           ', ' ORDER BY u2.first_name, u2.last_name
         )
         FROM comm_participants p2
         INNER JOIN auth_users u2 ON u2.user_id = p2.user_id
         WHERE p2.conversation_id = c.conversation_id
           AND p2.user_id <> $1::uuid AND p2.is_deleted = FALSE
       )                  AS "participantNames"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE
     LEFT JOIN LATERAL (
       SELECT body_html FROM comm_messages
       WHERE conversation_id = c.conversation_id AND is_deleted = FALSE
       ORDER BY sent_at DESC LIMIT 1
     ) lm ON TRUE
     LEFT JOIN comm_groups cg ON cg.group_id = c.group_id
     WHERE c.is_deleted = FALSE AND c.created_by = $1::uuid
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
    `SELECT COUNT(DISTINCT m.conversation_id)::int AS count
     FROM comm_messages m
     INNER JOIN comm_participants p
       ON p.conversation_id = m.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE AND p.is_archived = FALSE
     INNER JOIN comm_conversations c
       ON c.conversation_id = m.conversation_id AND c.is_deleted = FALSE
     WHERE m.is_deleted = FALSE AND m.sender_id <> $1::uuid
       AND NOT EXISTS (
         SELECT 1 FROM comm_read_receipts rr
         WHERE rr.message_id = m.message_id AND rr.user_id = $1::uuid
       )`,
    [userId]
  );
  return rows[0]?.count ?? 0;
}

async function getUnreadConversationIds(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT m.conversation_id AS "conversationId"
     FROM comm_messages m
     INNER JOIN comm_participants p
       ON p.conversation_id = m.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE AND p.is_archived = FALSE
     INNER JOIN comm_conversations c
       ON c.conversation_id = m.conversation_id AND c.is_deleted = FALSE
     WHERE m.is_deleted = FALSE AND m.sender_id <> $1::uuid
       AND NOT EXISTS (
         SELECT 1 FROM comm_read_receipts rr
         WHERE rr.message_id = m.message_id AND rr.user_id = $1::uuid
       )`,
    [userId]
  );
  return rows.map(r => r.conversationId);
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchMessages(userId, query) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT c.conversation_id AS "conversationId", c.subject, c.last_message_at AS "latestAt"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE AND p.is_archived = FALSE
     LEFT JOIN comm_messages m
       ON m.conversation_id = c.conversation_id AND m.is_deleted = FALSE
     WHERE c.is_deleted = FALSE AND (c.subject ILIKE $2 OR m.body_html ILIKE $2)
     ORDER BY c.last_message_at DESC LIMIT 50`,
    [userId, `%${query}%`]
  );
  return rows;
}

// ── Thread ────────────────────────────────────────────────────────────────────

async function getThread(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);
  const pool = getPool();
  const convRes = await pool.query(
    `SELECT conversation_id AS "conversationId", subject, allow_reply AS "allowReply",
            conv_type AS "convType", created_by AS "createdBy",
            created_at AS "createdAt", last_message_at AS "lastMessageAt"
     FROM comm_conversations WHERE conversation_id = $1 AND is_deleted = FALSE`,
    [conversationId]
  );
  if (!convRes.rows[0]) {
    const err = new Error('Conversation not found'); err.statusCode = 404; throw err;
  }
  const partRes = await pool.query(
    `SELECT p.user_id AS "userId", p.participant_type AS "participantType",
            u.first_name AS "firstName", u.last_name AS "lastName", u.email
     FROM comm_participants p
     LEFT JOIN auth_users u ON u.user_id = p.user_id
     WHERE p.conversation_id = $1 AND p.is_deleted = FALSE`,
    [conversationId]
  );
  const msgRes = await pool.query(
    `SELECT m.message_id, m.conversation_id, m.sender_id, m.parent_message_id,
            m.body_html, m.sent_at,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email, 'Unknown') AS sender_name,
            pm.body_html AS parent_body_html,
            COALESCE(NULLIF(TRIM(CONCAT(pu.first_name,' ',pu.last_name)),''), pu.email) AS parent_sender_name,
            COALESCE(
              (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                'attachmentId', a.attachment_id, 'originalName', a.original_name,
                'mimeType', a.mime_type, 'fileSize', a.file_size
              )) FROM comm_attachments a
               WHERE a.message_id = m.message_id AND a.is_deleted = FALSE), '[]'
            ) AS attachments,
            COALESCE(
              (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                'userId', rr.user_id,
                'userName', COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''), ru.email, rr.user_id::text),
                'readAt', rr.read_at
              )) FROM comm_read_receipts rr
               LEFT JOIN auth_users ru ON ru.user_id = rr.user_id
               WHERE rr.message_id = m.message_id AND rr.user_id <> m.sender_id), '[]'
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
       ON p.conversation_id = m.conversation_id AND p.user_id = $2::uuid AND p.is_deleted = FALSE
     WHERE m.message_id = $1 AND m.is_deleted = FALSE`,
    [messageId, userId]
  );
  if (!rows[0]) {
    const err = new Error('Message not found or access denied'); err.statusCode = 404; throw err;
  }
  await pool.query(
    `INSERT INTO comm_read_receipts (message_id, user_id) VALUES ($1, $2::uuid)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [messageId, userId]
  );
  const { rows: nameRows } = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''), email) AS name
     FROM auth_users WHERE user_id = $1::uuid`,
    [userId]
  );
  return {
    messageId, userId,
    conversationId: rows[0].conversation_id,
    readAt: new Date().toISOString(),
    userName: nameRows[0]?.name || 'Someone',
  };
}

// ── Archive ───────────────────────────────────────────────────────────────────

async function archiveConversation(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);
  await getPool().query(
    `UPDATE comm_participants SET is_archived = TRUE
     WHERE conversation_id = $1 AND user_id = $2::uuid AND is_deleted = FALSE`,
    [conversationId, userId]
  );
  return true;
}

// ── Soft delete message ───────────────────────────────────────────────────────

async function softDeleteMessage(messageId, userId) {
  const { rowCount } = await getPool().query(
    `UPDATE comm_messages SET is_deleted = TRUE
     WHERE message_id = $1 AND sender_id = $2::uuid AND is_deleted = FALSE`,
    [messageId, userId]
  );
  if (!rowCount) {
    const err = new Error('Message not found or cannot be deleted'); err.statusCode = 404; throw err;
  }
  return true;
}

// ── Email digest ──────────────────────────────────────────────────────────────

async function getUsersForUnreadDigest() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT u.user_id AS "userId", u.email, u.first_name AS "firstName", u.last_name AS "lastName",
            COUNT(m.message_id)::int AS "unreadCount"
     FROM auth_users u
     INNER JOIN comm_participants p ON p.user_id = u.user_id AND p.is_deleted = FALSE AND p.is_archived = FALSE
     INNER JOIN comm_messages m ON m.conversation_id = p.conversation_id AND m.is_deleted = FALSE AND m.sender_id <> u.user_id
     INNER JOIN comm_conversations c ON c.conversation_id = m.conversation_id AND c.is_deleted = FALSE
     WHERE u.is_active = TRUE AND u.required_email_notification = TRUE AND u.email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM comm_read_receipts rr WHERE rr.message_id = m.message_id AND rr.user_id = u.user_id)
     GROUP BY u.user_id, u.email, u.first_name, u.last_name
     HAVING COUNT(m.message_id) > 0`
  );
  return rows;
}

module.exports = {
  sanitizeBodyHtml, sendMessage, replyToConversation, removeParticipant,
  getInbox, getSent, getUnreadCount, getUnreadConversationIds,
  searchMessages, getThread, markMessageRead, archiveConversation,
  softDeleteMessage, getUsersForUnreadDigest,
  assertConversationParticipant, getParticipantUserIds,
};