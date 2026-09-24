'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const ctrl = require('../controllers/aiLearningController');

router.use(authenticate);

// Which view to render (single chat vs manager list) + the caller's own thread.
router.get('/context', ctrl.getContext);
// Manager/admin employee list (search via ?search=), sorted by latest activity.
router.get('/employees', ctrl.listEmployees);
// A specific employee's thread — access-gated in the service (self, their
// manager, or admin). Actual messages come from the existing generic
// /api/messages/:conversationId/thread + /reply endpoints once you have this id.
router.get('/employees/:employeeId/thread', ctrl.getEmployeeThread);

module.exports = router;
