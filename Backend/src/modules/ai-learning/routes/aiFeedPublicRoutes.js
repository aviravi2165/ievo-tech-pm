'use strict';

/**
 * PUBLIC routes for the AI Feed — reading, liking and commenting need no login.
 * A visitor is only the name + email they type (an honour system), so writes are
 * rate-limited and the comment box has a honeypot; admins can delete any comment.
 */

const router = require('express').Router();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/aiFeedController');

// The whole office shares one public IP, so these are floods-only limits.
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many likes / comments from this network in the last hour. Please try again later.' },
});

router.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], credentials: false }));

router.get('/options', ctrl.options);
router.get('/', ctrl.list);
router.get('/:type/:id/comments', ctrl.comments);
router.post('/:type/:id/comments', writeLimiter, ctrl.addComment);
router.post('/:type/:id/like', writeLimiter, ctrl.like);

module.exports = router;
