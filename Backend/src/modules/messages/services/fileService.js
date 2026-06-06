/**
 * fileService.js — PostgreSQL version
 *
 * CHANGES:
 *  1. createAttachment() — storagePath is now required/used properly.
 *
 *  2. NEW: PostgreSQL BYTEA storage strategy (opt-in via env).
 *     Set FILE_STORAGE=postgres in your .env to store file bytes in the DB
 *     instead of on disk.  This is useful for containerised deployments
 *     where a writable volume is not available, or when you want all data
 *     in one place for backups/replication.
 *
 *     When FILE_STORAGE=postgres:
 *       - uploadFileToPostgres(buffer, metadata) stores binary data in the
 *         comm_attachment_blobs table (see migration below).
 *       - getAttachmentBlob(attachmentId, userId) returns the raw buffer.
 *       - The multer disk-storage middleware still runs (Multer must write
 *         somewhere before we can read the buffer), but after the upload
 *         controller reads the file we can immediately delete it from disk.
 *
 *     When FILE_STORAGE=disk (default):
 *       - Behaviour is identical to the original; files stay in uploadDir.
 *
 *  SQL MIGRATION (run once if you switch to postgres storage):
 *  ────────────────────────────────────────────────────────────
 *    ALTER TABLE comm_attachments
 *      ADD COLUMN IF NOT EXISTS storage_mode VARCHAR(10) NOT NULL DEFAULT 'disk';
 *
 *    CREATE TABLE IF NOT EXISTS comm_attachment_blobs (
 *      attachment_id INT PRIMARY KEY REFERENCES comm_attachments(attachment_id) ON DELETE CASCADE,
 *      blob          BYTEA NOT NULL
 *    );
 *  ────────────────────────────────────────────────────────────
 *
 *  NOTE: BYTEA is fine for files up to ~1 GB in Postgres.  For very large files
 *  (>50 MB at scale) consider pg Large Objects or S3-compatible object storage.
 */

const fs   = require('fs');
const path = require('path');
const { getPool } = require('../../../config/db');

const STORAGE_MODE = (process.env.FILE_STORAGE || 'disk').toLowerCase();

// ── Metadata ──────────────────────────────────────────────────────────────────

/**
 * Inserts attachment metadata for a file saved by Multer (disk or postgres).
 */
async function createAttachment({
  uploadedByUserId,
  storedFileName,
  originalName,
  mimeType,
  fileSize,
  storagePath,
  storageMode = STORAGE_MODE,
}) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO comm_attachments
       (uploaded_by, stored_name, original_name, mime_type, file_size, storage_path, storage_mode)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
     RETURNING
       attachment_id AS "attachmentId",
       original_name AS "originalName",
       mime_type     AS "mimeType",
       file_size     AS "fileSize",
       storage_mode  AS "storageMode"`,
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

// ── PostgreSQL BYTEA storage ──────────────────────────────────────────────────

/**
 * Stores the file bytes in comm_attachment_blobs (postgres storage mode).
 * Call this AFTER createAttachment() so the attachmentId exists.
 *
 * @param {number} attachmentId — from createAttachment()
 * @param {Buffer} buffer       — raw file bytes
 */
async function storeBlob(attachmentId, buffer) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO comm_attachment_blobs (attachment_id, blob)
     VALUES ($1, $2)
     ON CONFLICT (attachment_id) DO UPDATE SET blob = EXCLUDED.blob`,
    [attachmentId, buffer]
  );
}

/**
 * Retrieves the binary blob for an attachment after verifying access.
 *
 * @returns {{ buffer: Buffer, attachment: object } | null}
 */
async function getAttachmentBlob(attachmentId, userId) {
  const pool = getPool();

  // Reuse the same access-control logic as the disk path
  const attachment = await getAttachmentForUser(attachmentId, userId);
  if (!attachment) return null;

  const { rows } = await pool.query(
    `SELECT blob FROM comm_attachment_blobs WHERE attachment_id = $1`,
    [attachmentId]
  );
  if (!rows[0]) return null;

  return { buffer: rows[0].blob, attachment };
}

// ── Linking ───────────────────────────────────────────────────────────────────

async function linkAttachmentsToMessage(client, messageId, attachmentIds, userId) {
  if (!attachmentIds || attachmentIds.length === 0) return { linkedCount: 0 };

  let linkedCount = 0;
  for (const attachmentId of attachmentIds) {
    const { rowCount } = await client.query(
      `UPDATE comm_attachments
       SET message_id = $1
       WHERE attachment_id = $2
         AND uploaded_by  = $3::uuid
         AND message_id IS NULL
         AND is_deleted = FALSE`,
      [messageId, attachmentId, userId]
    );
    linkedCount += rowCount;
  }

  if (linkedCount !== attachmentIds.length) {
    const err = new Error('One or more attachments could not be linked');
    err.code = 'ATTACHMENT_LINK_FAILED';
    throw err;
  }

  return { linkedCount };
}

// ── Access-controlled fetch ───────────────────────────────────────────────────

async function getAttachmentForUser(attachmentId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       a.attachment_id  AS "attachmentId",
       a.message_id     AS "messageId",
       a.stored_name    AS "storedFileName",
       a.storage_path   AS "storagePath",
       a.original_name  AS "originalName",
       a.mime_type      AS "mimeType",
       a.file_size      AS "fileSize",
       a.storage_mode   AS "storageMode"
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
       )`,
    [attachmentId, userId]
  );
  return rows[0] || null;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function softDeleteStagedAttachment(attachmentId, userId) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE comm_attachments
     SET is_deleted = TRUE
     WHERE attachment_id = $1
       AND uploaded_by   = $2::uuid
       AND message_id IS NULL
       AND is_deleted = FALSE`,
    [attachmentId, userId]
  );
  return rowCount > 0;
}

module.exports = {
  STORAGE_MODE,
  createAttachment,
  storeBlob,
  getAttachmentBlob,
  linkAttachmentsToMessage,
  getAttachmentForUser,
  softDeleteStagedAttachment,
};