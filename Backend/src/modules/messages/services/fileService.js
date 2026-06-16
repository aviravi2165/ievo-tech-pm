const { getPool } = require('../../../config/db');

/**
 * Inserts attachment metadata.
 */
async function createAttachment({
  uploadedByUserId,
  storedFileName,
  originalName,
  mimeType,
  fileSize,
  storagePath,
  storageMode = 'disk',
}) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    INSERT INTO comm_attachments
    (
      uploaded_by,
      stored_name,
      original_name,
      mime_type,
      file_size,
      storage_path,
      storage_mode
    )
    VALUES
    (
      $1::uuid,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7
    )
    RETURNING
      attachment_id AS "attachmentId",
      original_name AS "originalName",
      mime_type     AS "mimeType",
      file_size     AS "fileSize",
      storage_mode  AS "storageMode"
    `,
    [
      uploadedByUserId,
      storedFileName,
      originalName,
      mimeType,
      fileSize,
      storagePath || storedFileName,
      storageMode,
    ]
  );

  return rows[0];
}

/**
 * Links uploaded attachments to a message.
 */
async function linkAttachmentsToMessage(
  client,
  messageId,
  attachmentIds,
  userId
) {
  if (!attachmentIds || attachmentIds.length === 0) {
    return { linkedCount: 0 };
  }

  let linkedCount = 0;

  for (const attachmentId of attachmentIds) {
    const { rowCount } = await client.query(
      `
      UPDATE comm_attachments
      SET message_id = $1
      WHERE attachment_id = $2
        AND uploaded_by = $3::uuid
        AND message_id IS NULL
        AND is_deleted = FALSE
      `,
      [messageId, attachmentId, userId]
    );

    linkedCount += rowCount;
  }

  if (linkedCount !== attachmentIds.length) {
    const err = new Error(
      'One or more attachments could not be linked'
    );

    err.code = 'ATTACHMENT_LINK_FAILED';
    throw err;
  }

  return { linkedCount };
}

/**
 * Checks whether a user has access to an attachment.
 */
async function getAttachmentForUser(
  attachmentId,
  userId
) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    SELECT
      a.attachment_id AS "attachmentId",
      a.message_id AS "messageId",
      a.stored_name AS "storedFileName",
      a.storage_path AS "storagePath",
      a.original_name AS "originalName",
      a.mime_type AS "mimeType",
      a.file_size AS "fileSize",
      a.storage_mode AS "storageMode"
    FROM comm_attachments a
    WHERE a.attachment_id = $1
      AND a.is_deleted = FALSE
      AND (
        a.uploaded_by = $2::uuid
        OR EXISTS (
          SELECT 1
          FROM comm_messages m
          INNER JOIN comm_participants p
            ON p.conversation_id = m.conversation_id
           AND p.user_id = $2::uuid
           AND p.is_deleted = FALSE
          WHERE m.message_id = a.message_id
            AND m.is_deleted = FALSE
        )
      )
    `,
    [attachmentId, userId]
  );

  return rows[0] || null;
}

/**
 * Marks an unattached uploaded file as deleted.
 */
async function softDeleteStagedAttachment(
  attachmentId,
  userId
) {
  const pool = getPool();

  const { rowCount } = await pool.query(
    `
    UPDATE comm_attachments
    SET is_deleted = TRUE
    WHERE attachment_id = $1
      AND uploaded_by = $2::uuid
      AND message_id IS NULL
      AND is_deleted = FALSE
    `,
    [attachmentId, userId]
  );

  return rowCount > 0;
}

module.exports = {
  createAttachment,
  linkAttachmentsToMessage,
  getAttachmentForUser,
  softDeleteStagedAttachment,
};