const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
]);

const STORAGE_ROOT =
  process.env.FILE_STORAGE_ROOT || './storage';

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

const maxSizeBytes =
  parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10) * 1024 * 1024;

const storage = multer.diskStorage({
 destination(_req, _file, cb) {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, '0');

  const targetDir = path.join(
    STORAGE_ROOT,
    'attachments',
    'comm',
    String(year),
    month
  );

  fs.mkdirSync(targetDir, {
    recursive: true,
  });

  cb(null, targetDir);
},
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error(`File type not allowed: ${file.mimetype}`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxSizeBytes,
    files: 10,
  },
});

/**
 * Maps Multer / upload errors to HTTP-friendly responses.
 */
function handleUploadError(err, req, res, next) {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File exceeds maximum size of ${process.env.MAX_FILE_SIZE_MB || 25}MB`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files uploaded' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err.message && err.message.startsWith('File type not allowed')) {
    return res.status(415).json({ error: err.message });
  }

  return next(err);
}

module.exports = {
  STORAGE_ROOT,
  uploadSingle: upload.single('file'),
  uploadMultiple: upload.array('files', 10),
  handleUploadError,
};