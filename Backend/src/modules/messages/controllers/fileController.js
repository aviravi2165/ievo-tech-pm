const path = require('path');
const fs = require('fs');
const fileService = require('../services/fileService');
const { STORAGE_ROOT } = require('../../../middleware/upload');

function handleError(res, err) {
  const status = err.statusCode || 500;

  return res.status(status).json({
    error: err.message,
    message: err.message,
  });
}

// ─────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────

async function upload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
      });
    }

    const relativePath = path.relative(
      STORAGE_ROOT,
      req.file.path
    );

    const record = await fileService.createAttachment({
      uploadedByUserId: req.user.userId,
      storedFileName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      storagePath: relativePath,
      storageMode: 'disk',
    });

    return res.status(201).json({
      attachmentId: record.attachmentId,
      originalName: record.originalName,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
    });
  } catch (err) {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    return handleError(res, err);
  }
}

// ─────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────

async function download(req, res) {
  try {
    const attachmentId = Number(req.params.attachmentId);

    if (!Number.isInteger(attachmentId) || attachmentId < 1) {
      return res.status(400).json({
        error: 'Invalid attachment id',
      });
    }

    const attachment = await fileService.getAttachmentForUser(
      attachmentId,
      req.user.userId
    );

    if (!attachment) {
      return res.status(404).json({
        error: 'File not found',
      });
    }

    const filePath = path.join(
      STORAGE_ROOT,
      attachment.storagePath
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found on disk',
      });
    }

    const safeName =
      attachment.originalName || 'download';

    return res.download(
      filePath,
      safeName,
      (err) => {
        if (err && !res.headersSent) {
          handleError(res, err);
        }
      }
    );
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  upload,
  download,
};