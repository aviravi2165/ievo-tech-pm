const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const STORAGE_ROOT =
  process.env.FILE_STORAGE_ROOT;

if (!STORAGE_ROOT) {
  throw new Error(
    'FILE_STORAGE_ROOT environment variable is required'
  );
}

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, {
    recursive: true,
  });
}

const maxSizeBytes =
  parseInt(
    process.env.MAX_FILE_SIZE_MB || '100',
    10
  ) * 1024 * 1024;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const now = new Date();

    const year = String(
      now.getFullYear()
    );

    const month = String(
      now.getMonth() + 1
    ).padStart(2, '0');

    const uploadPath = path.join(
      STORAGE_ROOT,
      'attachments',
      'comm',
      year,
      month
    );

    fs.mkdirSync(uploadPath, {
      recursive: true,
    });

    cb(null, uploadPath);
  },

  filename(_req, file, cb) {
    const ext = path
      .extname(file.originalname)
      .toLowerCase();

    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: maxSizeBytes,
    files: 10,
  },
});

function handleUploadError(
  err,
  req,
  res,
  next
) {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File exceeds maximum size of ${
          process.env.MAX_FILE_SIZE_MB || '100' 
        }MB`,
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files uploaded',
      });
    }

    return res.status(400).json({
      error: err.message,
    });
  }

  return next(err);
}

module.exports = {
  STORAGE_ROOT,
  uploadSingle: upload.single('file'),
  uploadMultiple: upload.array('files', 10),
  handleUploadError,
};