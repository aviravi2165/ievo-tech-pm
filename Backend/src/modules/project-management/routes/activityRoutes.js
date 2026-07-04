'use strict';

const router = require('express').Router();
const { authenticate }     = require('../../../middleware/auth');
const { requireRole }      = require('../middleware/projectRole');
const { requireEntityRole }= require('../middleware/entityRole');
const { checkCircular }    = require('../middleware/circularDepCheck');
const { getPool, sql }     = require('../../../config/db');
const ctrl   = require('../controllers/activityController');
const taskCtrl = require('../controllers/taskController');
const taskSvc  = require('../services/taskService');

async function resolveActivityProject(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('activityId', sql.Int, req.params.id || req.params.activityId)
      .query(`
        SELECT ph.project_id FROM pm_activities a
        INNER JOIN pm_phases ph ON ph.phase_id = a.phase_id
        WHERE a.activity_id = @activityId
      `);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Activity not found' });
    req.pmProjectId = result.recordset[0].project_id;
    next();
  } catch (err) { next(err); }
}

router.use(authenticate);

// ── Activity CRUD ─────────────────────────────────────────────────────────────
router.patch('/:id',        resolveActivityProject, requireRole('Member'),  ctrl.update);
router.delete('/:id',       resolveActivityProject, requireRole('Manager'), ctrl.remove);

// ── Activity members ──────────────────────────────────────────────────────────
// Read: anyone with at least Viewer-level effective access to the activity.
// Write: the Activity's own Manager(s), OR a project-level Manager (see
// entityRole.js — project Managers can always administer beneath their project).
router.get('/:id/members',            resolveActivityProject, requireEntityRole('activity', 'Viewer'),  ctrl.listMembers);
router.post('/:id/members',           resolveActivityProject, requireEntityRole('activity', 'Manager'), ctrl.addMember);
router.patch('/:id/members/:uid',     resolveActivityProject, requireEntityRole('activity', 'Manager'), ctrl.updateMemberRole);
router.delete('/:id/members/:uid',    resolveActivityProject, requireEntityRole('activity', 'Manager'), ctrl.removeMember);

// ── Activity chat ────────────────────────────────────────────────────────────
// Returns { conversationId } for the auto-managed group thread — the frontend
// opens this conversationId in the Messages rail. Anyone with activity access
// can open it (they're either already a participant, or about to become one).
router.get('/:id/chat', resolveActivityProject, requireEntityRole('activity', 'Viewer'), ctrl.getChat);

// ── Activity dependencies ─────────────────────────────────────────────────────
router.post('/:id/dependencies',          resolveActivityProject, requireRole('Manager'), checkCircular('activity'), ctrl.addDep);
router.delete('/:id/dependencies/:depId', resolveActivityProject, requireRole('Manager'), ctrl.removeDep);

// ── Tasks nested under activity ───────────────────────────────────────────────
// GET  /api/pm/activities/:activityId/tasks  — list tasks
// POST /api/pm/activities/:activityId/tasks  — create task + send requests
router.get('/:activityId/tasks', resolveActivityProject, requireEntityRole('activity', 'Viewer'),
  async (req, res, next) => {
    try { res.json(await taskSvc.getTasksForActivity(req.params.activityId)); } catch(e){next(e);}
  }
);
router.post('/:activityId/tasks', resolveActivityProject, requireEntityRole('activity', 'Manager'),
  async (req, res, next) => {
    try { res.status(201).json(await taskSvc.createTask(req.params.activityId, req.pmProjectId, req.user.userId, req.body)); } catch(e){next(e);}
  }
);

module.exports = router;