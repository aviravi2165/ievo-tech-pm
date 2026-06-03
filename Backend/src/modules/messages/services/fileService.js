const { sql, getPool } = require('../../../config/db');

/**
 * Inserts attachment metadata for a file already saved by Multer.
 */
async function createAttachment({
  uploadedByUserId,
  storedFileName,
  originalName,
  mimeType,
  fileSize,
}) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('uploadedByUserId', sql.Int, uploadedByUserId)
    .input('storedFileName', sql.NVarChar(260), storedFileName)
    .input('originalName', sql.NVarChar(500), originalName)
    .input('mimeType', sql.NVarChar(127), mimeType)
    .input('fileSize', sql.BigInt, fileSize)
    .query(`
      INSERT INTO dbo.attachments (
        uploadedByUserId, storedFileName, originalName, mimeType, fileSize
      )
      OUTPUT
        INSERTED.attachmentId,
        INSERTED.originalName,
        INSERTED.mimeType,
        INSERTED.fileSize
      VALUES (
        @uploadedByUserId, @storedFileName, @originalName, @mimeType, @fileSize
      );
    `);

  return result.recordset[0];
}

/**
 * Links staged attachments to a message inside an open transaction.
 * Only attachments uploaded by the sender and not yet linked are updated.
 */
async function linkAttachmentsToMessage(transaction, messageId, attachmentIds, userId) {
  if (!attachmentIds || attachmentIds.length === 0) {
    return { linkedCount: 0 };
  }

  let linkedCount = 0;

  for (const attachmentId of attachmentIds) {
    const result = await new sql.Request(transaction)
      .input('messageId', sql.Int, messageId)
      .input('userId', sql.Int, userId)
      .input('attachmentId', sql.Int, attachmentId)
      .query(`
        UPDATE dbo.attachments
        SET messageId = @messageId
        WHERE attachmentId = @attachmentId
          AND uploadedByUserId = @userId
          AND messageId IS NULL
          AND isDeleted = 0;
      `);

    linkedCount += result.rowsAffected[0] ?? 0;
  }

  if (linkedCount !== attachmentIds.length) {
    const err = new Error('One or more attachments could not be linked');
    err.code = 'ATTACHMENT_LINK_FAILED';
    throw err;
  }

  return { linkedCount };
}

/**
 * Returns attachment row if the user may access it (uploader or conversation participant).
 */
async function getAttachmentForUser(attachmentId, userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('attachmentId', sql.Int, attachmentId)
    .input('userId', sql.Int, userId)
    .query(`
      SELECT
        a.attachmentId,
        a.messageId,
        a.storedFileName,
        a.originalName,
        a.mimeType,
        a.fileSize
      FROM dbo.attachments a
      WHERE a.attachmentId = @attachmentId
        AND a.isDeleted = 0
        AND (
          a.uploadedByUserId = @userId
          OR EXISTS (
            SELECT 1
            FROM dbo.messages m
            INNER JOIN dbo.participants p
              ON p.conversationId = m.conversationId
              AND p.userId = @userId
              AND p.isActive = 1
            WHERE m.messageId = a.messageId
              AND m.isDeleted = 0
          )
        );
    `);

  return result.recordset[0] || null;
}

/**
 * Soft-deletes an unlinked attachment owned by the user (failed send cleanup).
 */
async function softDeleteStagedAttachment(attachmentId, userId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('attachmentId', sql.Int, attachmentId)
    .input('userId', sql.Int, userId)
    .query(`
      UPDATE dbo.attachments
      SET isDeleted = 1
      WHERE attachmentId = @attachmentId
        AND uploadedByUserId = @userId
        AND messageId IS NULL
        AND isDeleted = 0;

      SELECT @@ROWCOUNT AS affected;
    `);

  return (result.recordset[0]?.affected ?? 0) > 0;
}

module.exports = {
  createAttachment,
  linkAttachmentsToMessage,
  getAttachmentForUser,
  softDeleteStagedAttachment,
};
