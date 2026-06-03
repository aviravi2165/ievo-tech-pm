const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const { sql, getPool } = require('../../../config/db');
const { linkAttachmentsToMessage } = require('./fileService');
const { getMemberUserIdsForGroups } = require('./groupService');

const domWindow = new JSDOM('').window;
const DOMPurify = createDOMPurify(domWindow);

function sanitizeBodyHtml(bodyHtml) {
  return DOMPurify.sanitize(bodyHtml || '', {
    ALLOWED_TAGS: [
      'b', 'i', 'u', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li', 'a',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
  });
}

function displayName(row) {
  if (!row) return 'Unknown';
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return name || row.email || `User ${row.userId}`;
}

async function getUserRow(userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT userId, email, firstName, lastName
      FROM dbo.users
      WHERE userId = @userId AND isActive = 1;
    `);
  return result.recordset[0] || null;
}

async function assertConversationParticipant(conversationId, userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('conversationId', sql.Int, conversationId)
    .input('userId', sql.Int, userId)
    .query(`
      SELECT TOP 1 participantId
      FROM dbo.participants
      WHERE conversationId = @conversationId
        AND userId = @userId
        AND isActive = 1;
    `);

  if (!result.recordset[0]) {
    const err = new Error('Conversation not found or access denied');
    err.code = 'CONVERSATION_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }
}

async function getParticipantUserIds(conversationId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('conversationId', sql.Int, conversationId)
    .query(`
      SELECT userId
      FROM dbo.participants
      WHERE conversationId = @conversationId
        AND isActive = 1;
    `);

  return result.recordset.map((row) => row.userId);
}

async function resolveRecipientUserIds(recipientIds = [], groupIds = []) {
  const ids = new Set(
    recipientIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
  );

  const groupMemberIds = await getMemberUserIdsForGroups(
    groupIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
  );
  groupMemberIds.forEach((id) => ids.add(id));

  return [...ids];
}

async function insertParticipants(transaction, conversationId, userIds) {
  for (const participantUserId of userIds) {
    await new sql.Request(transaction)
      .input('conversationId', sql.Int, conversationId)
      .input('userId', sql.Int, participantUserId)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.participants
          WHERE conversationId = @conversationId AND userId = @userId
        )
        BEGIN
          INSERT INTO dbo.participants (conversationId, userId)
          VALUES (@conversationId, @userId);
        END
        ELSE
        BEGIN
          UPDATE dbo.participants
          SET isActive = 1, isArchived = 0
          WHERE conversationId = @conversationId AND userId = @userId;
        END
      `);
  }
}

function parseJsonColumn(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapThreadMessage(row) {
  return {
    messageId: row.messageId,
    conversationId: row.conversationId,
    senderId: row.senderUserId,
    senderName: row.senderName,
    bodyHtml: row.bodyHtml,
    sentAt: row.sentAt,
    parentMessageId: row.parentMessageId,
    attachments: parseJsonColumn(row.attachmentsJson),
    readReceipts: parseJsonColumn(row.readReceiptsJson),
    parentMessage: row.parentMessageId
      ? {
          messageId: row.parentMessageId,
          senderName: row.parentSenderName,
          bodyHtml: row.parentBodyHtml,
        }
      : null,
  };
}

/**
 * Sends a new conversation (transactional).
 */
async function sendMessage(senderUserId, payload) {
  const {
    recipientIds = [],
    groupIds = [],
    subject,
    bodyHtml,
    allowReply = true,
    attachmentIds = [],
  } = payload;

  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const err = new Error('Message body is required');
    err.statusCode = 400;
    throw err;
  }

  const recipientUserIds = await resolveRecipientUserIds(recipientIds, groupIds);
  recipientUserIds.push(senderUserId);
  const uniqueParticipants = [...new Set(recipientUserIds)];

  if (uniqueParticipants.length < 2) {
    const err = new Error('At least one recipient is required');
    err.statusCode = 400;
    throw err;
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const convResult = await new sql.Request(transaction)
      .input('subject', sql.NVarChar(500), subject)
      .input('createdByUserId', sql.Int, senderUserId)
      .input('allowReply', sql.Bit, allowReply ? 1 : 0)
      .query(`
        INSERT INTO dbo.conversations (subject, createdByUserId, allowReply, lastMessageAt)
        OUTPUT INSERTED.conversationId, INSERTED.subject
        VALUES (@subject, @createdByUserId, @allowReply, SYSUTCDATETIME());
      `);

    const conversation = convResult.recordset[0];

    await insertParticipants(transaction, conversation.conversationId, uniqueParticipants);

    const msgResult = await new sql.Request(transaction)
      .input('conversationId', sql.Int, conversation.conversationId)
      .input('senderUserId', sql.Int, senderUserId)
      .input('bodyHtml', sql.NVarChar(sql.MAX), sanitizedBody)
      .query(`
        INSERT INTO dbo.messages (conversationId, senderUserId, bodyHtml)
        OUTPUT INSERTED.messageId
        VALUES (@conversationId, @senderUserId, @bodyHtml);
      `);

    const messageId = msgResult.recordset[0].messageId;

    await linkAttachmentsToMessage(
      transaction,
      messageId,
      attachmentIds,
      senderUserId
    );

    await new sql.Request(transaction)
      .input('conversationId', sql.Int, conversation.conversationId)
      .query(`
        UPDATE dbo.conversations
        SET lastMessageAt = SYSUTCDATETIME()
        WHERE conversationId = @conversationId;
      `);

    await transaction.commit();

    const sender = await getUserRow(senderUserId);
    return {
      conversationId: conversation.conversationId,
      messageId,
      subject: conversation.subject,
      senderName: displayName(sender),
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Replies within an existing conversation (transactional).
 */
async function replyToConversation(conversationId, senderUserId, payload) {
  const { bodyHtml, attachmentIds = [], parentMessageId = null } = payload;

  await assertConversationParticipant(conversationId, senderUserId);

  const pool = await getPool();
  const convCheck = await pool
    .request()
    .input('conversationId', sql.Int, conversationId)
    .query(`
      SELECT allowReply, isDeleted
      FROM dbo.conversations
      WHERE conversationId = @conversationId;
    `);

  const conversation = convCheck.recordset[0];
  if (!conversation || conversation.isDeleted) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }
  if (!conversation.allowReply) {
    const err = new Error('Replies are not allowed on this conversation');
    err.statusCode = 403;
    throw err;
  }

  const sanitizedBody = sanitizeBodyHtml(bodyHtml);
  if (!sanitizedBody.trim()) {
    const err = new Error('Message body is required');
    err.statusCode = 400;
    throw err;
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const msgResult = await new sql.Request(transaction)
      .input('conversationId', sql.Int, conversationId)
      .input('senderUserId', sql.Int, senderUserId)
      .input('bodyHtml', sql.NVarChar(sql.MAX), sanitizedBody)
      .input('parentMessageId', sql.Int, parentMessageId)
      .query(`
        INSERT INTO dbo.messages (conversationId, senderUserId, bodyHtml, parentMessageId)
        OUTPUT INSERTED.messageId
        VALUES (@conversationId, @senderUserId, @bodyHtml, @parentMessageId);
      `);

    const messageId = msgResult.recordset[0].messageId;

    await linkAttachmentsToMessage(
      transaction,
      messageId,
      attachmentIds,
      senderUserId
    );

    await new sql.Request(transaction)
      .input('conversationId', sql.Int, conversationId)
      .query(`
        UPDATE dbo.conversations
        SET lastMessageAt = SYSUTCDATETIME()
        WHERE conversationId = @conversationId;
      `);

    await transaction.commit();

    const meta = await pool
      .request()
      .input('conversationId', sql.Int, conversationId)
      .query(`
        SELECT subject FROM dbo.conversations WHERE conversationId = @conversationId;
      `);

    const sender = await getUserRow(senderUserId);
    return {
      conversationId,
      messageId,
      subject: meta.recordset[0]?.subject,
      senderName: displayName(sender),
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getInbox(userId, page = 1, limit = 30) {
  const pool = await getPool();
  const offset = (Math.max(page, 1) - 1) * limit;

  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT
        c.conversationId,
        c.subject,
        c.lastMessageAt AS latestAt,
        c.createdAt,
        COALESCE(sender.firstName + ' ' + sender.lastName, sender.email, 'Unknown') AS latestSender,
        LEFT(lm.bodyHtml, 120) AS preview,
        (
          SELECT COUNT(*)
          FROM dbo.messages um
          WHERE um.conversationId = c.conversationId
            AND um.isDeleted = 0
            AND um.senderUserId <> @userId
            AND NOT EXISTS (
              SELECT 1 FROM dbo.read_receipts rr
              WHERE rr.messageId = um.messageId AND rr.userId = @userId
            )
        ) AS unreadCount
      FROM dbo.conversations c
      INNER JOIN dbo.participants p
        ON p.conversationId = c.conversationId
        AND p.userId = @userId
        AND p.isActive = 1
        AND p.isArchived = 0
      OUTER APPLY (
        SELECT TOP 1 m.bodyHtml, m.senderUserId
        FROM dbo.messages m
        WHERE m.conversationId = c.conversationId AND m.isDeleted = 0
        ORDER BY m.sentAt DESC
      ) lm
      LEFT JOIN dbo.users sender ON sender.userId = lm.senderUserId
      WHERE c.isDeleted = 0
      ORDER BY c.lastMessageAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `);

  return { conversations: result.recordset, page, limit };
}

async function getSent(userId, page = 1, limit = 30) {
  const pool = await getPool();
  const offset = (Math.max(page, 1) - 1) * limit;

  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT
        c.conversationId,
        c.subject,
        c.lastMessageAt AS latestAt,
        c.createdAt,
        COALESCE(sender.firstName + ' ' + sender.lastName, sender.email, 'You') AS latestSender,
        LEFT(lm.bodyHtml, 120) AS preview,
        0 AS unreadCount
      FROM dbo.conversations c
      INNER JOIN dbo.participants p
        ON p.conversationId = c.conversationId
        AND p.userId = @userId
        AND p.isActive = 1
      OUTER APPLY (
        SELECT TOP 1 m.bodyHtml, m.senderUserId
        FROM dbo.messages m
        WHERE m.conversationId = c.conversationId AND m.isDeleted = 0
        ORDER BY m.sentAt DESC
      ) lm
      LEFT JOIN dbo.users sender ON sender.userId = lm.senderUserId
      WHERE c.isDeleted = 0
        AND c.createdByUserId = @userId
      ORDER BY c.lastMessageAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `);

  return { conversations: result.recordset, page, limit };
}

async function getUnreadCount(userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(`
      SELECT COUNT(*) AS count
      FROM dbo.messages m
      INNER JOIN dbo.participants p
        ON p.conversationId = m.conversationId
        AND p.userId = @userId
        AND p.isActive = 1
        AND p.isArchived = 0
      INNER JOIN dbo.conversations c
        ON c.conversationId = m.conversationId
        AND c.isDeleted = 0
      WHERE m.isDeleted = 0
        AND m.senderUserId <> @userId
        AND NOT EXISTS (
          SELECT 1 FROM dbo.read_receipts rr
          WHERE rr.messageId = m.messageId AND rr.userId = @userId
        );
    `);

  return result.recordset[0]?.count ?? 0;
}

async function searchMessages(userId, query) {
  const pool = await getPool();
  const pattern = `%${query}%`;

  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('pattern', sql.NVarChar(500), pattern)
    .query(`
      SELECT DISTINCT TOP 50
        c.conversationId,
        c.subject,
        c.lastMessageAt AS latestAt
      FROM dbo.conversations c
      INNER JOIN dbo.participants p
        ON p.conversationId = c.conversationId
        AND p.userId = @userId
        AND p.isActive = 1
      LEFT JOIN dbo.messages m
        ON m.conversationId = c.conversationId
        AND m.isDeleted = 0
      WHERE c.isDeleted = 0
        AND p.isArchived = 0
        AND (
          c.subject LIKE @pattern
          OR m.bodyHtml LIKE @pattern
        )
      ORDER BY c.lastMessageAt DESC;
    `);

  return result.recordset;
}

async function getThread(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);

  const pool = await getPool();

  const convResult = await pool
    .request()
    .input('conversationId', sql.Int, conversationId)
    .input('userId', sql.Int, userId)
    .query(`
      SELECT
        c.conversationId,
        c.subject,
        c.allowReply,
        c.createdAt,
        c.lastMessageAt
      FROM dbo.conversations c
      WHERE c.conversationId = @conversationId
        AND c.isDeleted = 0;

      SELECT
        p.userId,
        u.firstName,
        u.lastName,
        u.email
      FROM dbo.participants p
      LEFT JOIN dbo.users u ON u.userId = p.userId
      WHERE p.conversationId = @conversationId
        AND p.isActive = 1;
    `);

  const messagesResult = await pool
    .request()
    .input('conversationId', sql.Int, conversationId)
    .query(`
      SELECT
        m.messageId,
        m.conversationId,
        m.senderUserId,
        m.parentMessageId,
        m.bodyHtml,
        m.sentAt,
        COALESCE(u.firstName + ' ' + u.lastName, u.email, CAST(m.senderUserId AS NVARCHAR(20))) AS senderName,
        pm.bodyHtml AS parentBodyHtml,
        COALESCE(pu.firstName + ' ' + pu.lastName, pu.email) AS parentSenderName,
        (
          SELECT
            a.attachmentId,
            a.originalName,
            a.mimeType,
            a.fileSize
          FROM dbo.attachments a
          WHERE a.messageId = m.messageId AND a.isDeleted = 0
          FOR JSON PATH
        ) AS attachmentsJson,
        (
          SELECT rr.userId, rr.readAt
          FROM dbo.read_receipts rr
          WHERE rr.messageId = m.messageId
          FOR JSON PATH
        ) AS readReceiptsJson
      FROM dbo.messages m
      LEFT JOIN dbo.users u ON u.userId = m.senderUserId
      LEFT JOIN dbo.messages pm ON pm.messageId = m.parentMessageId
      LEFT JOIN dbo.users pu ON pu.userId = pm.senderUserId
      WHERE m.conversationId = @conversationId
        AND m.isDeleted = 0
      ORDER BY m.sentAt ASC;
    `);

  const conversation = convResult.recordsets[0][0];
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }

  return {
    conversation: {
      ...conversation,
      participants: convResult.recordsets[1],
    },
    messages: messagesResult.recordset.map(mapThreadMessage),
  };
}

async function markMessageRead(messageId, userId) {
  const pool = await getPool();

  const access = await pool
    .request()
    .input('messageId', sql.Int, messageId)
    .input('userId', sql.Int, userId)
    .query(`
      SELECT m.messageId, m.conversationId
      FROM dbo.messages m
      INNER JOIN dbo.participants p
        ON p.conversationId = m.conversationId
        AND p.userId = @userId
        AND p.isActive = 1
      WHERE m.messageId = @messageId
        AND m.isDeleted = 0;
    `);

  const message = access.recordset[0];
  if (!message) {
    const err = new Error('Message not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  await pool
    .request()
    .input('messageId', sql.Int, messageId)
    .input('userId', sql.Int, userId)
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.read_receipts
        WHERE messageId = @messageId AND userId = @userId
      )
      BEGIN
        INSERT INTO dbo.read_receipts (messageId, userId)
        VALUES (@messageId, @userId);
      END
    `);

  const readAt = new Date().toISOString();
  return {
    messageId,
    userId,
    conversationId: message.conversationId,
    readAt,
  };
}

async function archiveConversation(conversationId, userId) {
  await assertConversationParticipant(conversationId, userId);

  const pool = await getPool();
  const result = await pool
    .request()
    .input('conversationId', sql.Int, conversationId)
    .input('userId', sql.Int, userId)
    .query(`
      UPDATE dbo.participants
      SET isArchived = 1
      WHERE conversationId = @conversationId
        AND userId = @userId
        AND isActive = 1;

      SELECT @@ROWCOUNT AS affected;
    `);

  return (result.recordset[0]?.affected ?? 0) > 0;
}

async function softDeleteMessage(messageId, userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('messageId', sql.Int, messageId)
    .input('userId', sql.Int, userId)
    .query(`
      UPDATE dbo.messages
      SET isDeleted = 1
      WHERE messageId = @messageId
        AND senderUserId = @userId
        AND isDeleted = 0;

      SELECT @@ROWCOUNT AS affected;
    `);

  if (!(result.recordset[0]?.affected ?? 0)) {
    const err = new Error('Message not found or cannot be deleted');
    err.statusCode = 404;
    throw err;
  }

  return true;
}

/**
 * Used by email cron (Step 6): users with unread mail and notification flag.
 */
async function getUsersForUnreadDigest() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      u.userId,
      u.email,
      u.firstName,
      u.lastName,
      COUNT(m.messageId) AS unreadCount
    FROM dbo.users u
    INNER JOIN dbo.participants p
      ON p.userId = u.userId
      AND p.isActive = 1
      AND p.isArchived = 0
    INNER JOIN dbo.messages m
      ON m.conversationId = p.conversationId
      AND m.isDeleted = 0
      AND m.senderUserId <> u.userId
    INNER JOIN dbo.conversations c
      ON c.conversationId = m.conversationId
      AND c.isDeleted = 0
    WHERE u.isActive = 1
      AND u.requiredEmailNotification = 1
      AND u.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM dbo.read_receipts rr
        WHERE rr.messageId = m.messageId AND rr.userId = u.userId
      )
    GROUP BY u.userId, u.email, u.firstName, u.lastName
    HAVING COUNT(m.messageId) > 0;
  `);

  return result.recordset;
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
