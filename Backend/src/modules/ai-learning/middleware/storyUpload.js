'use strict';

/**
 * Upload handling for the PUBLIC AI story form — stricter than the shared
 * chat upload (anyone can reach it): document/spreadsheet/image types only,
 * 20 MB per file, at most 3 "before" + 3 "after" files.
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
const MAX_PER_KIND = 3;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const now = new Date();
    const dir = path.join(STORAGE_ROOT, 'attachments', 'ai-stories', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_PER_KIND * 2, fields: 30, fieldSize: 64 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      const e = new Error(`"${file.originalname}" is not allowed. Upload Excel, PDF, Word, PowerPoint, CSV, text or image files.`);
      e.statusCode = 400;
      return cb(e);
    }
    cb(null, true);
  },
}).fields([{ name: 'beforeFiles', maxCount: MAX_PER_KIND }, { name: 'afterFiles', maxCount: MAX_PER_KIND }]);

// Wraps multer so its errors come back as clean 400/413 JSON. multer itself
// removes any file it already wrote when the request fails.
function storyUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Each file must be ${MAX_FILE_MB} MB or smaller.` });
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: `Attach at most ${MAX_PER_KIND} "before" and ${MAX_PER_KIND} "after" files.` });
      return res.status(400).json({ error: err.message });
    }
    return res.status(err.statusCode || 400).json({ error: err.message });
  });
}

module.exports = { storyUpload, MAX_FILE_MB, MAX_PER_KIND };
