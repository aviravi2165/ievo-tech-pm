'use strict';

const router = require('express').Router();
const { authenticate, requireAdmin } = require('../../../middleware/auth');
const ctrl = require('../controllers/reportController');

router.use(authenticate);

// ── Project report (chat) ──────────────────────────────────────────────────
// Read is gated INSIDE the controller (admin OR an explicit report member).
router.get('/projects/:id/report',         ctrl.getReport);
router.get('/projects/:id/report/members',  ctrl.listMembers);
// Curating who's in a report is admin-only.
router.post('/projects/:id/report/members',            requireAdmin, ctrl.addMember);
router.delete('/projects/:id/report/members/:uid',     requireAdmin, ctrl.removeMember);

// ── DPR (Daily Progress Report) ─────────────────────────────────────────────
// Every project report the caller may see — admin gets all, others get only
// the projects they've been added to. Filtered by project on the client.
router.get('/dpr/projects', ctrl.listDpr);

module.exports = router;
