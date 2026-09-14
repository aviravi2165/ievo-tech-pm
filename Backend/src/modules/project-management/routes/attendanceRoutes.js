'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole } = require('../middleware/projectRole');
const ctrl = require('../controllers/attendanceController');

const setProjectId = (req, _, next) => { req.pmProjectId = req.params.id; next(); };

router.use(authenticate);

// Read — any project member (attendanceService doesn't gate this further;
// requireRole('Member') below is the actual project-membership check).
router.get('/projects/:id/attendance',         setProjectId, requireRole('Member'), ctrl.getForDate);
router.get('/projects/:id/attendance/summary', setProjectId, requireRole('Member'), ctrl.getMonthSummary);
// Self check-in — any member, always today's date (enforced server-side).
router.post('/projects/:id/attendance/checkin', setProjectId, requireRole('Member'), ctrl.checkIn);
// Manager/admin override — any member, any date.
router.put('/projects/:id/attendance/:uid', setProjectId, requireRole('Manager'), ctrl.setStatus);

module.exports = router;
