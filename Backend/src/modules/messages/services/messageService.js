'use strict';
const { getPool } = require('../../../config/db');

let archiveColumnReady;

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
  return [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    || row.email || 'Unknown';
}

async function ensureParticipantArchiveColumn() {
  if (!archiveColumnReady) {
    archiveColumnReady = getPool().query(
      `ALTER TABLE comm_participants
       ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
       ALTER TABLE comm_participants
       ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ`
    );
  }
  await archiveColumnReady;
}

async function assertConversationParticipant(conversationId, userId) {
  const { rows } = await getPool().query(
    `SELECT participant_id FROM comm_participants
     WHERE conversation_id = $1 AND user_id = $2::uuid AND is_deleted = FALSE`,
    [conversationId, userId]
  );
  if (!rows[0]) {
    const e = new Error('Conversation not found or access denied');
    e.statusCode = 403; throw e;
  }
}

async function getParticipantUserIds(conversationId) {
  const { rows } = await getPool().query(
    `SELECT user_id FROM comm_participants
     WHERE conversation_id = $1 AND is_deleted = FALSE`,
    [conversationId]
  );
  return rows.map(r => r.user_id);
}

/**
 * Expand group IDs into member user IDs.
 * IMPORTANT: excludes senderUserId so the sender is never added as a recipient
 * of their own message via a group membership.
 */
async function getMemberUserIdsForGroups(groupIds = [], excludeUserId = null) {
  if (!groupIds.length) return [];
  const { rows } = await getPool().query(
    `SELECT DISTINCT gm.user_id
     FROM comm_group_members gm
     INNER JOIN comm_groups g ON g.group_id = gm.group_id
     WHERE gm.group_id = ANY($1::int[])
       AND g.is_active = TRUE
       ${excludeUserId ? 'AND gm.user_id <> $2::uuid' : ''}`,
    excludeUserId ? [groupIds, excludeUserId] : [groupIds]
  );
  return rows.map(r => r.user_id);
}

async function linkAttachmentsToMessage(client, messageId, attachmentIds, uploadedBy) {
  for (const id of attachmentIds) {
    await client.query(
      `UPDATE comm_attachments SET message_id = $1
       WHERE attachment_id = $2 AND uploaded_by = $3::uuid AND message_id IS NULL`,
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
      senderName: row.parent_is_deleted ? null : row.parent_sender_name,
      bodyHtml:   row.parent_is_deleted ? null : row.parent_body_html,
      isDeleted:  Boolean(row.parent_is_deleted),
    } : null,
  };
}

// ── Conversation + message creation helpers ───────────────────────────────────

async function createConversation(client, { subject, createdBy, allowReply, groupId = null, convType = 'bcc' }) {
  const { rows } = await client.query(
    `INSERT INTO comm_conversations
       (subject, created_by, allow_reply, group_id, conv_type, last_message_at)
     VALUES ($1, $2::uuid, $3, $4, $5, NOW())
     RETURNING conversation_id, subject`,
    [subject, createdBy, allowReply, groupId, convType]
  );
  return rows[0];
}

async function addParticipants(client, conversationId, userIds, participantType = 'to') {
  // Remove duplicates from the input list
  const unique = [...new Set(userIds.map(String))];
  for (const uid of unique) {
    await client.query(
      `INSERT INTO comm_participants (conversation_id, user_id, participant_type)
       VALUES ($1, $2::uuid, $3)
       ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET
         is_deleted = FALSE,
         is_archived = FALSE,
         archived_at = CASE
           WHEN comm_participants.is_deleted THEN NULL
           ELSE comm_participants.archived_at
         END,
         left_at = NULL,
         participant_type = $3`,
      [conversationId, uid, participantType]
    );
  }
}

async function assertActiveGroupMember(groupId, userId, client = getPool()) {
  const { rows } = await client.query(
    `SELECT g.is_disabled AS "isDisabled", gm.user_id AS "memberUserId"
     FROM comm_groups g
     LEFT JOIN comm_group_members gm
       ON gm.group_id = g.group_id AND gm.user_id = $2::uuid
     WHERE g.group_id = $1
       AND g.is_active = TRUE`,
    [groupId, userId]
  );
  if (!rows[0] || !rows[0].memberUserId) {
    const e = new Error('You are no longer a member of this group');
    e.statusCode = 403;
    throw e;
  }
  if (rows[0].isDisabled) {
    const e = new Error('This group has been disabled. No new messages can be sent, but past messages remain visible.');
    e.statusCode = 403;
    throw e;
  }
}

async function insertMessage(client, conversationId, senderId, bodyHtml, parentMessageId = null) {
  const { rows } = await client.query(
    `INSERT INTO comm_messages (conversation_id, sender_id, body_html, parent_message_id)
     VALUES ($1, $2::uuid, $3, $4)
     RETURNING message_id`,
    [conversationId, senderId, bodyHtml, parentMessageId || null]
  );
  return rows[0].message_id;
}

// ── sendMessage ───────────────────────────────────────────────────────────────

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

  const pool = getPool();

  // ── CC mode ───────────────────────────────────────────────────────────────
  if (mode === 'cc') {
    // Expand all groups server-side, excluding sender from group members
    const groupMemberIds  = await getMemberUserIdsForGroups(groupIds, senderUserId);
    // Combine individual recipients + group members, exclude sender
    const allRecipients   = [...new Set([
      ...recipientIds.filter(id => String(id) !== String(senderUserId)),
      ...groupMemberIds,
    ])];

    if (!allRecipients.length) {
      const e = new Error('At least one recipient is required'); e.statusCode = 400; throw e;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const conv = await createConversation(client, {
        subject: subject.trim(), createdBy: senderUserId, allowReply, convType: 'cc',
      });
      // Sender added as 'to'; recipients added as 'cc'
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
        `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1::uuid`, [senderUserId]
      );
      return [{
        conversationId: conv.conversation_id, messageId,
        subject: conv.subject,
        senderName: displayName(senderRes.rows[0]),
        senderUserId,
        participantIds: [senderUserId, ...allRecipients],
        mode: 'cc',
      }];
    } catch (err) {
      await client.query('ROLLBACK'); throw err;
    } finally {
      client.release();
    }
  }

  // ── Group-thread mode ─────────────────────────────────────────────────────
  if (mode === 'group_thread') {
    const results = [];
    for (const groupId of groupIds) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await assertActiveGroupMember(groupId, senderUserId, client);

        // Find existing group conversation or create one
        const { rows: existing } = await client.query(
          `SELECT conversation_id FROM comm_conversations
           WHERE group_id = $1 AND is_deleted = FALSE
           ORDER BY last_message_at DESC LIMIT 1`,
          [groupId]
        );

        let conversationId, participantIds;
        const memberIds = await getMemberUserIdsForGroups([groupId]);
        const activeMembers = [...new Set([...memberIds, senderUserId].map(String))];

        if (existing[0]) {
          conversationId = existing[0].conversation_id;
          await addParticipants(client, conversationId, activeMembers, 'to');
          participantIds = activeMembers;
        } else {
          const { rows: grpInfo } = await client.query(
            `SELECT group_name FROM comm_groups WHERE group_id = $1`, [groupId]
          );
          const conv = await createConversation(client, {
            subject: subject?.trim() || grpInfo[0]?.group_name || 'Group Message',
            createdBy: senderUserId, allowReply, groupId, convType: 'group_thread',
          });
          conversationId = conv.conversation_id;
          // All group members become participants
          await addParticipants(client, conversationId, activeMembers, 'to');
          participantIds = activeMembers;
        }

        const messageId = await insertMessage(client, conversationId, senderUserId, sanitizedBody);
        await linkAttachmentsToMessage(client, messageId, attachmentIds, senderUserId);
        await client.query(
          `UPDATE comm_conversations SET last_message_at = NOW() WHERE conversation_id = $1`,
          [conversationId]
        );
        await client.query('COMMIT');

        const senderRes = await pool.query(
          `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1::uuid`, [senderUserId]
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

  // ── BCC mode (default): one private thread per recipient ──────────────────
  // Build recipient list:
  //   - individual recipientIds (excluding sender)
  //   - if frontend pre-expanded groups (expandedGroupMembers), use those IDs
  //   - otherwise expand groupIds server-side (excluding sender)
  // Final list must NOT include the sender.

  let groupDerivedIds;
  if (expandedGroupMembers.length > 0) {
    // Frontend sent explicit expanded list — honour it, still exclude sender
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

  const results = [];
  for (const recipientId of uniqueRecipients) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const conv = await createConversation(client, {
        subject: subject.trim(), createdBy: senderUserId, allowReply, convType: 'bcc',
      });
      // Both sender and recipient participate; sender = 'to', recipient = 'bcc'
      await addParticipants(client, conv.conversation_id, [senderUserId],  'to');
      await addParticipants(client, conv.conversation_id, [recipientId],    'bcc');
      const messageId = await insertMessage(client, conv.conversation_id, senderUserId, sanitizedBody);
      await linkAttachmentsToMessage(client, messageId, attachmentIds, senderUserId);
      await client.query(
        `UPDATE comm_conversations SET last_message_at = NOW() WHERE conversation_id = $1`,
        [conv.conversation_id]
      );
      await client.query('COMMIT');

      const senderRes = await pool.query(
        `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1::uuid`, [senderUserId]
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
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT created_by, conv_type FROM comm_conversations
     WHERE conversation_id = $1 AND is_deleted = FALSE`,
    [conversationId]
  );
  if (!rows[0]) {
    const e = new Error('Conversation not found'); e.statusCode = 404; throw e;
  }
  if (String(rows[0].created_by) !== String(actorUserId)) {
    const e = new Error('Only the sender can remove participants'); e.statusCode = 403; throw e;
  }
  if (rows[0].conv_type !== 'cc') {
    const e = new Error('Participants can only be removed from CC (Shared) conversations');
    e.statusCode = 400; throw e;
  }
  if (String(targetUserId) === String(actorUserId)) {
    const e = new Error('You cannot remove yourself from a conversation you created');
    e.statusCode = 400; throw e;
  }
  await pool.query(
    `UPDATE comm_participants SET is_deleted = TRUE
     WHERE conversation_id = $1 AND user_id = $2::uuid`,
    [conversationId, targetUserId]
  );
  return true;
}

// ── Reply ─────────────────────────────────────────────────────────────────────

async function replyToConversation(conversationId, senderUserId, payload) {
  const { bodyHtml, attachmentIds = [], parentMessageId = null } = payload;
  await assertConversationParticipant(conversationId, senderUserId);
  await ensureParticipantArchiveColumn();

  const pool = getPool();
  const { rows: convRows } = await pool.query(
    `SELECT allow_reply, is_deleted, conv_type, group_id
     FROM comm_conversations WHERE conversation_id = $1`,
    [conversationId]
  );
  const conv = convRows[0];
  if (!conv || conv.is_deleted) {
    const e = new Error('Conversation not found'); e.statusCode = 404; throw e;
  }
  if (!conv.allow_reply) {
    const e = new Error('Replies are not allowed'); e.statusCode = 403; throw e;
  }
  if (conv.conv_type === 'group_thread') {
    await assertActiveGroupMember(conv.group_id, senderUserId);
  }

  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const e = new Error('Message body is required'); e.statusCode = 400; throw e;
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
      `SELECT first_name, last_name, email FROM auth_users WHERE user_id = $1::uuid`, [senderUserId]
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
  await ensureParticipantArchiveColumn();
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
       c.created_by       AS "createdBy",
       (SELECT COUNT(*)::int FROM comm_participants cp
        WHERE cp.conversation_id = c.conversation_id AND cp.is_deleted = FALSE
       ) AS "participantCount",
       COALESCE(NULLIF(TRIM(CONCAT(su.first_name,' ',su.last_name)),''), su.email, 'Unknown') AS "latestSender",
       LEFT(lm.body_html, 120) AS preview,
       cg.group_name AS "groupName",
       (SELECT STRING_AGG(
           COALESCE(NULLIF(TRIM(CONCAT(u2.first_name,' ',u2.last_name)),''), u2.email),
           ', ' ORDER BY u2.first_name, u2.last_name
         )
         FROM comm_participants p2
         INNER JOIN auth_users u2 ON u2.user_id = p2.user_id
         WHERE p2.conversation_id = c.conversation_id
           AND p2.user_id <> $1::uuid AND p2.is_deleted = FALSE
       ) AS "participantNames",
       (SELECT COUNT(*)::int
        FROM comm_messages um
        WHERE um.conversation_id = c.conversation_id
          AND um.is_deleted = FALSE
          AND um.sent_at > COALESCE(p.archived_at, '-infinity'::timestamptz)
          AND um.sent_at <= COALESCE(p.left_at, 'infinity'::timestamptz)
          AND um.sender_id <> $1::uuid
          AND NOT EXISTS (
            SELECT 1 FROM comm_read_receipts rr
            WHERE rr.message_id = um.message_id AND rr.user_id = $1::uuid
          )
       ) AS "unreadCount"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE AND p.is_archived = FALSE
     LEFT JOIN LATERAL (
       SELECT body_html, sender_id FROM comm_messages
       WHERE conversation_id = c.conversation_id AND is_deleted = FALSE
         AND sent_at > COALESCE(p.archived_at, '-infinity'::timestamptz)
         AND sent_at <= COALESCE(p.left_at, 'infinity'::timestamptz)
       ORDER BY sent_at DESC LIMIT 1
     ) lm ON TRUE
     LEFT JOIN auth_users su ON su.user_id = lm.sender_id
     LEFT JOIN comm_groups cg ON cg.group_id = c.group_id
     LEFT JOIN comm_group_hidden gh
       ON gh.group_id = c.group_id AND gh.user_id = $1::uuid
     WHERE c.is_deleted = FALSE
       AND gh.user_id IS NULL
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
       c.created_by       AS "createdBy",
       (SELECT COUNT(*)::int FROM comm_participants cp
        WHERE cp.conversation_id = c.conversation_id AND cp.is_deleted = FALSE
       ) AS "participantCount",
       'You' AS "latestSender",
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
       ) AS "participantNames"
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
     LEFT JOIN comm_group_hidden gh
       ON gh.group_id = c.group_id AND gh.user_id = $1::uuid
     WHERE c.is_deleted = FALSE AND c.created_by = $1::uuid
       AND gh.user_id IS NULL
     ORDER BY c.last_message_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return { conversations: rows, page, limit };
}

// ── Unread count ──────────────────────────────────────────────────────────────

async function getUnreadCount(userId) {
  await ensureParticipantArchiveColumn();
  const { rows } = await getPool().query(
    `SELECT COUNT(DISTINCT m.conversation_id)::int AS count
     FROM comm_messages m
     INNER JOIN comm_participants p
       ON p.conversation_id = m.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE AND p.is_archived = FALSE
     INNER JOIN comm_conversations c
       ON c.conversation_id = m.conversation_id AND c.is_deleted = FALSE
     WHERE m.is_deleted = FALSE AND m.sender_id <> $1::uuid
       AND m.sent_at > COALESCE(p.archived_at, '-infinity'::timestamptz)
       AND m.sent_at <= COALESCE(p.left_at, 'infinity'::timestamptz)
       AND NOT EXISTS (
         SELECT 1 FROM comm_read_receipts rr
         WHERE rr.message_id = m.message_id AND rr.user_id = $1::uuid
       )`,
    [userId]
  );
  return rows[0]?.count ?? 0;
}

async function getUnreadConversationIds(userId) {
  await ensureParticipantArchiveColumn();
  const { rows } = await getPool().query(
    `SELECT DISTINCT m.conversation_id AS "conversationId"
     FROM comm_messages m
     INNER JOIN comm_participants p
       ON p.conversation_id = m.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE AND p.is_archived = FALSE
     INNER JOIN comm_conversations c
       ON c.conversation_id = m.conversation_id AND c.is_deleted = FALSE
     WHERE m.is_deleted = FALSE AND m.sender_id <> $1::uuid
       AND m.sent_at > COALESCE(p.archived_at, '-infinity'::timestamptz)
       AND m.sent_at <= COALESCE(p.left_at, 'infinity'::timestamptz)
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
  await ensureParticipantArchiveColumn();
  const { rows } = await getPool().query(
    `SELECT DISTINCT c.conversation_id AS "conversationId", c.subject,
            c.last_message_at AS "latestAt"
     FROM comm_conversations c
     INNER JOIN comm_participants p
       ON p.conversation_id = c.conversation_id
       AND p.user_id = $1::uuid AND p.is_deleted = FALSE AND p.is_archived = FALSE
     LEFT JOIN comm_messages m
       ON m.conversation_id = c.conversation_id AND m.is_deleted = FALSE
       AND m.sent_at > COALESCE(p.archived_at, '-infinity'::timestamptz)
       AND m.sent_at <= COALESCE(p.left_at, 'infinity'::timestamptz)
     WHERE c.is_deleted = FALSE AND (c.subject ILIKE $2 OR m.body_html ILIKE $2)
     ORDER BY c.last_message_at DESC LIMIT 50`,
    [userId, `%${query}%`]
  );
  return rows;
}

// ── Thread ────────────────────────────────────────────────────────────────────

async function getThread(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);
  await ensureParticipantArchiveColumn();
  const pool = getPool();

  const convRes = await pool.query(
    `SELECT conversation_id AS "conversationId", subject,
            allow_reply AS "allowReply", conv_type AS "convType",
            created_by AS "createdBy",
            created_at AS "createdAt", last_message_at AS "lastMessageAt"
     FROM comm_conversations WHERE conversation_id = $1 AND is_deleted = FALSE`,
    [conversationId]
  );
  if (!convRes.rows[0]) {
    const e = new Error('Conversation not found'); e.statusCode = 404; throw e;
  }

  const partRes = await pool.query(
    `SELECT p.user_id AS "userId",
            p.participant_type AS "participantType",
            u.first_name AS "firstName", u.last_name AS "lastName", u.email
     FROM comm_participants p
     LEFT JOIN auth_users u ON u.user_id = p.user_id
     WHERE p.conversation_id = $1 AND p.is_deleted = FALSE
     ORDER BY u.first_name, u.last_name`,
    [conversationId]
  );

  const currentPartRes = await pool.query(
    `SELECT archived_at AS "archivedAt", left_at AS "leftAt"
     FROM comm_participants
     WHERE conversation_id = $1 AND user_id = $2::uuid AND is_deleted = FALSE`,
    [conversationId, userId]
  );

  let userCanReply = Boolean(convRes.rows[0].allowReply);
  let isGroupDisabled = false;
  if (convRes.rows[0].convType === 'group_thread') {
    const memberRes = await pool.query(
      `SELECT g.is_disabled AS "isDisabled"
       FROM comm_group_members gm
       INNER JOIN comm_conversations c ON c.group_id = gm.group_id
       INNER JOIN comm_groups g ON g.group_id = gm.group_id
       WHERE c.conversation_id = $1 AND gm.user_id = $2::uuid`,
      [conversationId, userId]
    );
    isGroupDisabled = Boolean(memberRes.rows[0]?.isDisabled);
    userCanReply = userCanReply && Boolean(memberRes.rows[0]) && !isGroupDisabled;
  }

  const msgRes = await pool.query(
    `SELECT m.message_id, m.conversation_id, m.sender_id, m.parent_message_id,
            m.body_html, m.sent_at,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''), u.email, 'Unknown') AS sender_name,
            pm.body_html AS parent_body_html,
            pm.is_deleted AS parent_is_deleted,
            COALESCE(NULLIF(TRIM(CONCAT(pu.first_name,' ',pu.last_name)),''), pu.email) AS parent_sender_name,
            COALESCE(
              (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                'attachmentId', a.attachment_id,
                'originalName', a.original_name,
                'mimeType', a.mime_type,
                'fileSize', a.file_size
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
     WHERE m.conversation_id = $1
       AND m.is_deleted = FALSE
       AND m.sent_at > COALESCE($2::timestamptz, '-infinity'::timestamptz)
       AND m.sent_at <= COALESCE($3::timestamptz, 'infinity'::timestamptz)
     ORDER BY m.sent_at ASC`,
    [
      conversationId,
      currentPartRes.rows[0]?.archivedAt || null,
      currentPartRes.rows[0]?.leftAt || null,
    ]
  );

  return {
    conversation: {
      ...convRes.rows[0],
      participants: partRes.rows,
      userCanReply,
      isGroupDisabled,
      archivedAt: currentPartRes.rows[0]?.archivedAt || null,
      leftAt: currentPartRes.rows[0]?.leftAt || null,
    },
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
    const e = new Error('Message not found or access denied'); e.statusCode = 404; throw e;
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
  await ensureParticipantArchiveColumn();
  await getPool().query(
    `UPDATE comm_participants SET is_archived = TRUE, archived_at = NOW()
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
    const e = new Error('Message not found or cannot be deleted'); e.statusCode = 404; throw e;
  }
  return true;
}

// ── Email digest ──────────────────────────────────────────────────────────────

async function getUsersForUnreadDigest() {
  const { rows } = await getPool().query(
    `SELECT u.user_id AS "userId", u.email,
            u.first_name AS "firstName", u.last_name AS "lastName",
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