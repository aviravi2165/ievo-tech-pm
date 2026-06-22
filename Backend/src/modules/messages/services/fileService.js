'use strict';

const { getPool, sql } = require('../../../config/db');

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
}) {
  const pool = await getPool();

  const { recordset } = await pool.request()
    .input('uploadedBy',   sql.UniqueIdentifier, uploadedByUserId)
    .input('storedName',   sql.VarChar,          storedFileName)
    .input('originalName', sql.VarChar,          originalName)
    .input('mimeType',     sql.VarChar,          mimeType)
    .input('fileSize',     sql.BigInt,           fileSize)
    .input('storagePath',  sql.VarChar,          storagePath || storedFileName)
    .query(`
      INSERT INTO comm_attachments
        (uploaded_by, stored_name, original_name, mime_type, file_size, storage_path)
      OUTPUT
        INSERTED.attachment_id AS attachmentId,
        INSERTED.original_name AS originalName,
        INSERTED.mime_type     AS mimeType,
        INSERTED.file_size     AS fileSize
      VALUES
        (@uploadedBy, @storedName, @originalName, @mimeType, @fileSize, @storagePath)
    `);

  return recordset[0];
}

/**
 * Links uploaded attachments to a message.
 *
 * `reqFn` is the request-factory passed down from `withTransaction()` in
 * db.js (see messageService.js for the calling convention) — call it once
 * per query to get a fresh `sql.Request` bound to the active transaction.
 */
async function linkAttachmentsToMessage(reqFn, messageId, attachmentIds, userId) {
  if (!attachmentIds || attachmentIds.length === 0) {
    return { linkedCount: 0 };
  }

  let linkedCount = 0;

  for (const attachmentId of attachmentIds) {
    const result = await reqFn()
      .input('messageId',    sql.Int,              messageId)
      .input('attachmentId', sql.Int,              attachmentId)
      .input('userId',       sql.UniqueIdentifier,  userId)
      .query(`
        UPDATE comm_attachments
        SET message_id = @messageId
        WHERE attachment_id = @attachmentId
          AND uploaded_by = @userId
          AND message_id IS NULL
          AND is_deleted = 0
      `);

    linkedCount += result.rowsAffected.reduce((a, b) => a + b, 0);
  }

  if (linkedCount !== attachmentIds.length) {
    const err = new Error('One or more attachments could not be linked');
    err.code = 'ATTACHMENT_LINK_FAILED';
    throw err;
  }

  return { linkedCount };
}

/**
 * Checks whether a user has access to an attachment.
 */
async function getAttachmentForUser(attachmentId, userId) {
  const pool = await getPool();

  const { recordset } = await pool.request()
    .input('attachmentId', sql.Int,              attachmentId)
    .input('userId',       sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        a.attachment_id AS attachmentId,
        a.message_id    AS messageId,
        a.stored_name    AS storedFileName,
        a.storage_path   AS storagePath,
        a.original_name  AS originalName,
        a.mime_type      AS mimeType,
        a.file_size      AS fileSize
      FROM comm_attachments a
      WHERE a.attachment_id = @attachmentId
        AND a.is_deleted = 0
        AND (
          a.uploaded_by = @userId
          OR EXISTS (
            SELECT 1
            FROM comm_messages m
            INNER JOIN comm_participants p
              ON p.conversation_id = m.conversation_id
             AND p.user_id = @userId
             AND p.is_deleted = 0
            WHERE m.message_id = a.message_id
              AND m.is_deleted = 0
          )
        )
    `);

  return recordset[0] || null;
}

/**
 * Marks an unattached uploaded file as deleted.
 */
async function softDeleteStagedAttachment(attachmentId, userId) {
  const pool = await getPool();

  const result = await pool.request()
    .input('attachmentId', sql.Int,              attachmentId)
    .input('userId',       sql.UniqueIdentifier, userId)
    .query(`
      UPDATE comm_attachments
      SET is_deleted = 1
      WHERE attachment_id = @attachmentId
        AND uploaded_by = @userId
        AND message_id IS NULL
        AND is_deleted = 0
    `);

  return result.rowsAffected.reduce((a, b) => a + b, 0) > 0;
}

module.exports = {
  createAttachment,
  linkAttachmentsToMessage,
  getAttachmentForUser,
  softDeleteStagedAttachment,
};