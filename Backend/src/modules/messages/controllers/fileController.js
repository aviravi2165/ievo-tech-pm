/**
 * fileController.js
 *
 * FIXES:
 *  1. upload()   — passes full absolute storagePath to createAttachment.
 *                  When FILE_STORAGE=postgres, reads the file Multer wrote,
 *                  stores it as a BYTEA blob in Postgres, then deletes the
 *                  temp file from disk so no disk accumulation occurs.
 *  2. download() — uses Number() instead of parseInt() for attachmentId.
 *                  Uses res.download() (authenticated stream) instead of the
 *                  old _blank anchor-click trick that could not attach a
 *                  Bearer token.
 *                  When FILE_STORAGE=postgres, streams the BYTEA blob from DB.
 */

const path = require('path');
const fs   = require('fs');
const fileService = require('../services/fileService');
const { uploadDir } = require('../../../middleware/upload');

function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({ error: err.message, message: err.message });
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function upload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const diskPath = path.join(uploadDir, req.file.filename);

    if (fileService.STORAGE_MODE === 'postgres') {
      // Read the temp file Multer wrote, push bytes to Postgres, then clean up
      let buffer;
      try {
        buffer = fs.readFileSync(diskPath);
      } catch {
        return res.status(500).json({ error: 'Failed to read uploaded file' });
      }

      const record = await fileService.createAttachment({
        uploadedByUserId: req.user.userId,
        storedFileName:   req.file.filename,
        originalName:     req.file.originalname,
        mimeType:         req.file.mimetype,
        fileSize:         req.file.size,
        storagePath:      '', // not used for postgres mode
        storageMode:      'postgres',
      });

      await fileService.storeBlob(record.attachmentId, buffer);

      // Remove temp file — data now lives in Postgres
      fs.unlink(diskPath, () => {});

      return res.status(201).json({
        attachmentId: record.attachmentId,
        originalName: record.originalName,
        mimeType:     record.mimeType,
        fileSize:     record.fileSize,
      });
    }

    // ── Disk mode (default) ────────────────────────────────────────────────
    const record = await fileService.createAttachment({
      uploadedByUserId: req.user.userId,
      storedFileName:   req.file.filename,
      originalName:     req.file.originalname,
      mimeType:         req.file.mimetype,
      fileSize:         req.file.size,
      storagePath:      diskPath,  // FIX: full absolute path
      storageMode:      'disk',
    });

    return res.status(201).json({
      attachmentId: record.attachmentId,
      originalName: record.originalName,
      mimeType:     record.mimeType,
      fileSize:     record.fileSize,
    });
  } catch (err) {
    if (req.file) {
      fs.unlink(path.join(uploadDir, req.file.filename), () => {});
    }
    return handleError(res, err);
  }
}

// ── Download ──────────────────────────────────────────────────────────────────

async function download(req, res) {
  try {
    // FIX: Number() handles the SERIAL int correctly; reject non-integers
    const attachmentId = Number(req.params.attachmentId);
    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return res.status(400).json({ error: 'Invalid attachment id' });
    }

    const attachment = await fileService.getAttachmentForUser(
      attachmentId,
      req.user.userId
    );

    if (!attachment) {
      return res.status(404).json({ error: 'File not found' });
    }

    const safeName = attachment.originalName || 'download';

    // ── Postgres blob mode ─────────────────────────────────────────────────
    if (attachment.storageMode === 'postgres') {
      const result = await fileService.getAttachmentBlob(attachmentId, req.user.userId);
      if (!result) {
        return res.status(404).json({ error: 'File data not found in database' });
      }

      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
      res.setHeader('Content-Length', result.buffer.length);
      return res.end(result.buffer);
    }

    // ── Disk mode ──────────────────────────────────────────────────────────
    // FIX: prefer stored absolute storagePath; fall back to uploadDir join
    const filePath =
      attachment.storagePath && path.isAbsolute(attachment.storagePath)
        ? attachment.storagePath
        : path.join(uploadDir, attachment.storedFileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // FIX: res.download() is a proper authenticated stream — no _blank tab tricks
    return res.download(filePath, safeName, (err) => {
      if (err && !res.headersSent) handleError(res, err);
    });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = { upload, download };