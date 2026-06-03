const express = require('express');
const { authenticate } = require('../../../middleware/auth');
const {
  uploadSingle,
  handleUploadError,
} = require('../../../middleware/upload');
const fileController = require('../controllers/fileController');

const router = express.Router();

router.use(authenticate);

router.post(
  '/upload',
  uploadSingle,
  handleUploadError,
  fileController.upload
);

router.get('/:attachmentId/download', fileController.download);

module.exports = router;
