'use strict';

/**
 * Upload handling for the "Import from Excel" file: one .xlsx, kept in memory (it is read once and
 * thrown away), at most MAX_MB megabytes.
 */

const path = require('path');
const multer = require('multer');

const MAX_MB = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1, fields: 5 },
  fileFilter(_req, file, cb) {
    if (path.extname(file.originalname).toLowerCase() !== '.xlsx') {
      const e = new Error('Please upload an Excel file in .xlsx format (use the downloaded format).');
      e.statusCode = 400;
      return cb(e);
    }
    cb(null, true);
  },
}).single('file');

// Wraps multer so its errors come back as clean 400/413 JSON.
function importUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) {
      if (!req.file) return res.status(400).json({ error: 'Choose an Excel (.xlsx) file to import.' });
      return next();
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `The file must be ${MAX_MB} MB or smaller.` });
      return res.status(400).json({ error: err.message });
    }
    return res.status(err.statusCode || 400).json({ error: err.message });
  });
}

module.exports = { importUpload, MAX_MB };
