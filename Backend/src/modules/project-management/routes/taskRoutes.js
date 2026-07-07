'use strict';

const router = require('express').Router();
const { authenticate }  = require('../../../middleware/auth');
const { requireRole }   = require('../middleware/projectRole');
const { requireEntityRole } = require('../middleware/entityRole');
const { checkCircular } = require('../middleware/circularDepCheck');
const { getPool, sql }  = require('../../../config/db');
const ctrl = require('../controllers/taskController');

async function resolveTaskProject(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('taskId', sql.Int, req.params.id)
      .query(`
        SELECT ph.project_id, a.activity_id AS activityId FROM pm_tasks t
        INNER JOIN pm_activities a  ON a.activity_id = t.activity_id
        INNER JOIN pm_phases     ph ON ph.phase_id   = a.phase_id
        WHERE t.task_id = @taskId
      `);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Task not found' });
    req.pmProjectId = result.recordset[0].project_id;
    // Lets requireEntityRole('activity', ...) resolve the parent activity —
    // it reads req.params.id || req.params.activityId, and :id here is the
    // task's own id, not the activity's.
    req.params.activityId = result.recordset[0].activityId;
    next();
  } catch (err) { next(err); }
}

router.use(authenticate);

// ── My assignment requests (for Dashboard, no project context needed) ────────
router.get('/my-requests',     ctrl.getMyRequests);
// ── My active tasks (accepted, non-complete) across all projects ─────────────
router.get('/my-active-tasks', ctrl.getMyActiveTasks);
// ── My recent project audit feed ─────────────────────────────────────────────
router.get('/my-recent-audit', ctrl.getMyRecentAudit);

// ── Per-request respond endpoints (assignee only, no projectRole check) ───────
// The assignee may not be a pm_member yet (they become one on accept)
router.post('/requests/:requestId/accept',  ctrl.acceptRequest);
router.post('/requests/:requestId/decline', ctrl.declineRequest);

// ── Task CRUD ─────────────────────────────────────────────────────────────────
// Delete/reactivate rights come from being the Activity Manager of the
// task's parent activity ("the one who assigned it") — only Activity/project
// Managers can assign tasks in the first place, so this is that same tier,
// not a separate per-task-creator permission.
router.patch('/:id',        resolveTaskProject, requireRole('Member'),  ctrl.update);
router.delete('/:id',       resolveTaskProject, requireEntityRole('activity', 'Manager'), ctrl.remove);
router.patch('/:id/reactivate', resolveTaskProject, requireEntityRole('activity', 'Manager'), ctrl.reactivate);
router.patch('/:id/status', resolveTaskProject, requireRole('Member'),  ctrl.updateStatus);

// ── Task chat ────────────────────────────────────────────────────────────────
// Returns { conversationId } for the task's auto-managed Shared/CC thread.
router.get('/:id/chat', resolveTaskProject, requireRole('Member'), ctrl.getChat);

// Assignment requests (manager sends, assignee responds above)
router.post('/:id/requests',         resolveTaskProject, requireRole('Manager'), ctrl.sendRequest);
router.delete('/:id/requests/:uid',  resolveTaskProject, requireRole('Manager'), ctrl.removeRequest);

// Dependencies
router.post('/:id/dependencies',          resolveTaskProject, requireRole('Manager'), checkCircular('task'), ctrl.addDep);
router.delete('/:id/dependencies/:depId', resolveTaskProject, requireRole('Manager'), ctrl.removeDep);

module.exports = router;