'use strict';

/**
 * PUBLIC routes for the "Share a tech" form — no authenticate(). Posts land as
 * 'pending' and only appear in the AI Feed after an admin approves them.
 * Same reasoning as aiStoryPublicRoutes for the CORS and rate-limit settings.
 */

const router = require('express').Router();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/aiTechController');
const { techUpload } = require('../middleware/techUpload');

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many posts submitted from this network in the last hour. Please try again later.' },
});

router.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], credentials: false }));

router.get('/options', ctrl.formOptions);
router.post('/', submitLimiter, techUpload, ctrl.submit);
// Attachments of approved posts (shown in the feed).
router.get('/:postId/files/:fileId', ctrl.publicDownload);

module.exports = router;
