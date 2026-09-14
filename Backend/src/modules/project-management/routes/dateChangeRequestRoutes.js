'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const ctrl = require('../controllers/dateChangeRequestController');

router.use(authenticate);

// Submit a request to change a locked date (project/phase/activity/task).
router.post('/date-requests', ctrl.create);
// Requests awaiting the caller's approval (optionally ?projectId=).
router.get('/date-requests/pending', ctrl.listPending);
// Requests the caller has raised, any status (optionally ?projectId=).
router.get('/date-requests/mine', ctrl.listMine);
// Decide (approver or admin only — enforced in the service).
router.post('/date-requests/:id/approve', ctrl.approve);
router.post('/date-requests/:id/reject', ctrl.reject);
// Requester withdraws their own still-pending request.
router.post('/date-requests/:id/cancel', ctrl.cancel);

module.exports = router;
