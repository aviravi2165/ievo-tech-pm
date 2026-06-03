const path = require('path');
const fs = require('fs');
const fileService = require('../services/fileService');
const { uploadDir } = require('../../../middleware/upload');

function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    error: err.message,
    message: err.message,
  });
}

async function upload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const record = await fileService.createAttachment({
      uploadedByUserId: req.user.userId,
      storedFileName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
    });

    return res.status(201).json({
      attachmentId: record.attachmentId,
      originalName: record.originalName,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
    });
  } catch (err) {
    if (req.file) {
      const filePath = path.join(uploadDir, req.file.filename);
      fs.unlink(filePath, () => {});
    }
    return handleError(res, err);
  }
}

async function download(req, res) {
  try {
    const attachmentId = parseInt(req.params.attachmentId, 10);
    if (Number.isNaN(attachmentId)) {
      return res.status(400).json({ error: 'Invalid attachment id' });
    }

    const attachment = await fileService.getAttachmentForUser(
      attachmentId,
      req.user.userId
    );

    if (!attachment) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadDir, attachment.storedFileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.originalName)}"`
    );

    return res.sendFile(filePath);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  upload,
  download,
};
