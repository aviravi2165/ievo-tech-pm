'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole } = require('../middleware/projectRole');
const ctrl = require('../controllers/meetingAttendanceController');
const minutes = require('../controllers/meetingMinutesController');
const { uploadMultiple, handleUploadError } = require('../../../middleware/upload');

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

// ── Meeting-only participants (Project Participant or Guest) — Manager only.
// Neither path ever touches pm_members (project membership) or any other
// meeting. ──
router.post('/projects/:id/meetings/:meetingId/participants',      setProjectId, requireRole('Manager'), ctrl.addParticipant);
router.delete('/projects/:id/meetings/:meetingId/participants/:uid', setProjectId, requireRole('Manager'), ctrl.removeParticipant);

// ── Official attendance — Manager/admin only ────────────────────────────────
router.put('/projects/:id/meetings/:meetingId/attendance/:uid',    setProjectId, requireRole('Manager'), ctrl.markAttendance);
router.delete('/projects/:id/meetings/:meetingId/attendance/:uid', setProjectId, requireRole('Manager'), ctrl.clearAttendance);
// Bulk "Mark all Present" + Undo (POST, so no clash with the :uid routes above).
router.post('/projects/:id/meetings/:meetingId/attendance/bulk-present',      setProjectId, requireRole('Manager'), ctrl.markAllPresent);
router.post('/projects/:id/meetings/:meetingId/attendance/bulk-present/undo', setProjectId, requireRole('Manager'), ctrl.undoMarkAllPresent);

// ── Self attendance change requests ─────────────────────────────────────────
// Submit — Member and above (excludes Viewer; a Manager could technically
// call this too, though they'd just mark directly instead).
router.post('/projects/:id/meetings/:meetingId/requests',                setProjectId, requireRole('Member'),  ctrl.createChangeRequest);
router.post('/projects/:id/meetings/requests/:requestId/cancel',         setProjectId, requireRole('Member'),  ctrl.cancelChangeRequest);
// Decide — Manager/admin only (service also blocks deciding your own request).
router.post('/projects/:id/meetings/requests/:requestId/approve',        setProjectId, requireRole('Manager'), ctrl.approveChangeRequest);
router.post('/projects/:id/meetings/requests/:requestId/reject',         setProjectId, requireRole('Manager'), ctrl.rejectChangeRequest);

// ── Minutes of Meeting ──────────────────────────────────────────────────────
// Viewer floor here; the service narrows writing (and emailing) to the
// meeting's creator, edit to the entry's author, delete to author or Manager.
router.get('/projects/:id/meetings/:meetingId/minutes',                      setProjectId, requireRole('Viewer'), minutes.listMinutes);
router.post('/projects/:id/meetings/:meetingId/minutes',                     setProjectId, requireRole('Viewer'), uploadMultiple, handleUploadError, minutes.addMinute);
router.patch('/projects/:id/meetings/:meetingId/minutes/:minuteId',          setProjectId, requireRole('Viewer'), minutes.updateMinute);
router.delete('/projects/:id/meetings/:meetingId/minutes/:minuteId',         setProjectId, requireRole('Viewer'), minutes.deleteMinute);
router.get('/projects/:id/meetings/:meetingId/minutes/files/:fileId/download', setProjectId, requireRole('Viewer'), minutes.downloadFile);
// Meeting creator only (service-checked) — email the minutes to every participant.
router.post('/projects/:id/meetings/:meetingId/minutes/email',              setProjectId, requireRole('Viewer'), minutes.emailMinutes);

module.exports = router;
