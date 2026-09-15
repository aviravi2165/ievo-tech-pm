'use strict';

const router = require('express').Router();
const { authenticate, requireAdmin } = require('../../../middleware/auth');
const ctrl = require('../controllers/dateChangeRequestController');

router.use(authenticate);

// Submit a request to change a locked date (project/phase/activity/task).
router.post('/date-requests', ctrl.create);
// Requests awaiting the caller's approval (optionally ?projectId=; omitted
// for a designated approver's global "awaiting you" view).
router.get('/date-requests/pending', ctrl.listPending);
// Requests the caller has raised, any status (optionally ?projectId=).
router.get('/date-requests/mine', ctrl.listMine);
// Every request ever addressed to the caller as approver, any status — the
// "who requested this and why" log.
router.get('/date-requests/history', ctrl.listHistory);
// Decide (approver or admin only — enforced in the service).
router.post('/date-requests/:id/approve', ctrl.approve);
router.post('/date-requests/:id/reject', ctrl.reject);
// Requester withdraws their own still-pending request.
router.post('/date-requests/:id/cancel', ctrl.cancel);

// The fixed list a requester picks an approver from (admins ∪ designated
// approvers) — any authenticated user can read this.
router.get('/date-approvers/eligible', ctrl.listEligibleApprovers);

// ── Approver management — admin only ────────────────────────────────────────
router.get('/date-approvers',             requireAdmin, ctrl.listApprovers);
router.post('/date-approvers',            requireAdmin, ctrl.addApprover);
router.delete('/date-approvers/:userId',  requireAdmin, ctrl.removeApprover);

module.exports = router;
