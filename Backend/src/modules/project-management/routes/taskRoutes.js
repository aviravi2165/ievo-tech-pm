const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole }  = require('../middleware/projectRole');
const { checkCircular }= require('../middleware/circularDepCheck');
const { getPool }      = require('../../../config/db');
const ctrl = require('../controllers/taskController');

async function resolveTaskProject(req, res, next) {
  try {
    const { rows } = await getPool().query(
      `SELECT ph.project_id FROM pm_tasks t
       JOIN pm_activities a ON a.activity_id=t.activity_id
       JOIN pm_phases ph ON ph.phase_id=a.phase_id
       WHERE t.task_id=$1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Task not found' });
    req.pmProjectId = rows[0].project_id;
    next();
  } catch(err) { next(err); }
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
