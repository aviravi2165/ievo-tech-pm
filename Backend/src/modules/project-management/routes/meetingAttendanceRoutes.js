'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole } = require('../middleware/projectRole');
const ctrl = require('../controllers/meetingAttendanceController');

const setProjectId = (req, _, next) => { req.pmProjectId = req.params.id; next(); };

router.use(authenticate);

// ── Meetings ─────────────────────────────────────────────────────────────
// Read — Viewer and above (Viewer = the spec's read-only "Project
// Owner/Leadership" tier; the old Attendance tab required Member+, this one
// deliberately opens read access to Viewer too).
router.get('/projects/:id/meetings',                    setProjectId, requireRole('Viewer'),  ctrl.listMeetings);
router.get('/projects/:id/meetings/:meetingId',          setProjectId, requireRole('Viewer'),  ctrl.getMeeting);
// Write — Manager (or admin) only.
router.post('/projects/:id/meetings',                    setProjectId, requireRole('Manager'), ctrl.createMeeting);
router.patch('/projects/:id/meetings/:meetingId',        setProjectId, requireRole('Manager'), ctrl.updateMeeting);
router.put('/projects/:id/meetings/:meetingId/members',  setProjectId, requireRole('Manager'), ctrl.updateMembers);
router.post('/projects/:id/meetings/:meetingId/cancel',  setProjectId, requireRole('Manager'), ctrl.cancelMeeting);

// ── Official attendance — Manager/admin only ────────────────────────────────
router.put('/projects/:id/meetings/:meetingId/attendance/:uid', setProjectId, requireRole('Manager'), ctrl.markAttendance);

// ── Self attendance change requests ─────────────────────────────────────────
// Submit — Member and above (excludes Viewer; a Manager could technically
// call this too, though they'd just mark directly instead).
router.post('/projects/:id/meetings/:meetingId/requests',                setProjectId, requireRole('Member'),  ctrl.createChangeRequest);
router.post('/projects/:id/meetings/requests/:requestId/cancel',         setProjectId, requireRole('Member'),  ctrl.cancelChangeRequest);
// Decide — Manager/admin only (service also blocks deciding your own request).
router.post('/projects/:id/meetings/requests/:requestId/approve',        setProjectId, requireRole('Manager'), ctrl.approveChangeRequest);
router.post('/projects/:id/meetings/requests/:requestId/reject',         setProjectId, requireRole('Manager'), ctrl.rejectChangeRequest);

module.exports = router;
