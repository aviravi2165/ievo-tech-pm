'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole }  = require('../middleware/projectRole');
const { checkCircular }= require('../middleware/circularDepCheck');
const { getPool, sql } = require('../../../config/db');
const ctrl = require('../controllers/taskController');

async function resolveTaskProject(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('taskId', sql.Int, req.params.id)
      .query(`
        SELECT ph.project_id FROM pm_tasks t
        INNER JOIN pm_activities a ON a.activity_id=t.activity_id
        INNER JOIN pm_phases ph ON ph.phase_id=a.phase_id
        WHERE t.task_id=@taskId
      `);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Task not found' });
    req.pmProjectId = result.recordset[0].project_id;
    next();
  } catch (err) { next(err); }
}

router.use(authenticate);

router.patch('/:id',        resolveTaskProject, requireRole('Member'), ctrl.update);
router.delete('/:id',       resolveTaskProject, requireRole('Manager'), ctrl.remove);
router.patch('/:id/status', resolveTaskProject, requireRole('Member'), ctrl.updateStatus);
router.post('/:id/assignees',         resolveTaskProject, requireRole('Manager'), ctrl.addAssignee);
router.delete('/:id/assignees/:uid',  resolveTaskProject, requireRole('Manager'), ctrl.removeAssignee);
router.post('/:id/dependencies',          resolveTaskProject, requireRole('Manager'), checkCircular('task'), ctrl.addDep);
router.delete('/:id/dependencies/:depId', resolveTaskProject, requireRole('Manager'), ctrl.removeDep);

module.exports = router;
