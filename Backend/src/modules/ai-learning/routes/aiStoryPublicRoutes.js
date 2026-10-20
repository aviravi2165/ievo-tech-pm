'use strict';

/**
 * PUBLIC routes for the "Share your AI story" form — deliberately NO
 * authenticate(): people submitting don't need a Specula account. Submissions
 * land as 'pending' and only appear after an admin approves them.
 */

const router = require('express').Router();
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/aiStoryController');
const { storyUpload } = require('../middleware/storyUpload');

// Generous on purpose: the whole office shares one public IP (see app.js), so
// a tight per-IP limit would block colleagues. This only stops floods; the
// honeypot field + admin approval handle the rest.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many stories submitted from this network in the last hour. Please try again later.' },
});

// This form is open to anyone and uses no login, cookies or tokens, so the
// app-wide CORS allow-list (which is for the logged-in app) doesn't apply:
// answer any origin. Without this, opening the form from an address that is
// not in CORS_ORIGIN (the IP, the domain, a hostname...) makes the browser
// silently discard the server's reply — the form then shows a generic
// "Could not submit" even though the story was saved.
router.use(cors({ origin: true, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], credentials: false }));

router.get('/options', ctrl.formOptions);
router.post('/', submitLimiter, storyUpload, ctrl.submit);

module.exports = router;
