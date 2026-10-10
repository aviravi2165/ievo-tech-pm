'use strict';

const router = require('express').Router();
const { authenticate, requireAdmin } = require('../../../middleware/auth');
const ctrl = require('../controllers/aiLearningController');
const stories = require('../controllers/aiStoryController');

router.use(authenticate);

// Which view to render (single chat vs manager list) + the caller's own thread.
router.get('/context', ctrl.getContext);
// Manager/admin employee list (search via ?search=), sorted by latest activity.
router.get('/employees', ctrl.listEmployees);
// A specific employee's thread — access-gated in the service (self, their
// manager, or admin). Actual messages come from the existing generic
// /api/messages/:conversationId/thread + /reply endpoints once you have this id.
router.get('/employees/:employeeId/thread', ctrl.getEmployeeThread);

// ── AI Stories (submitted through the public form) ──
// Everyone logged in sees approved stories; admins see every status and review.
router.get('/stories',                                stories.list);
router.get('/stories/:storyId/files/:fileId',         stories.download);
router.get('/stories/:storyId/pdf',                   stories.pdf);
router.post('/stories/:storyId/review', requireAdmin, stories.review);
router.delete('/stories/:storyId',      requireAdmin, stories.remove);

module.exports = router;
