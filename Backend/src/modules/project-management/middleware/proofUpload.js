'use strict';

/**
 * Upload handling for task proof files: documents, spreadsheets and images,
 * up to MAX_FILES per upload and MAX_FILE_MB per file. Files land under
 * attachments/task-proofs/YYYY/MM inside the shared storage root.
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { STORAGE_ROOT } = require('../../../middleware/upload');

const ALLOWED_EXT = new Set([
  '.xlsx', '.xls', '.xlsm', '.csv', '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);
const MAX_FILE_MB = 20;
const MAX_FILES = 5;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const now = new Date();
    const dir = path.join(STORAGE_ROOT, 'attachments', 'task-proofs', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) { cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`); },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILES, fields: 10, fieldSize: 8 * 1024 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())) {
      const e = new Error(`"${file.originalname}" is not allowed. Attach Excel, PDF, Word, PowerPoint, CSV, text or image files.`);
      e.statusCode = 400;
      return cb(e);
    }
    cb(null, true);
  },
}).array('files', MAX_FILES);

// Wraps multer so its errors come back as clean 400/413 JSON.
function proofUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Each file must be ${MAX_FILE_MB} MB or smaller.` });
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: `Attach at most ${MAX_FILES} files at a time.` });
      return res.status(400).json({ error: err.message });
    }
    return res.status(err.statusCode || 400).json({ error: err.message });
  });
}

module.exports = { proofUpload, MAX_FILES, MAX_FILE_MB };
