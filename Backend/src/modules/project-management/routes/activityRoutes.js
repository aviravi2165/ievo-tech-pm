const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole }  = require('../middleware/projectRole');
const { checkCircular }= require('../middleware/circularDepCheck');
const { getPool }      = require('../../../config/db');
const ctrl = require('../controllers/activityController');
const taskCtrl = require('../controllers/taskController');

async function resolveActivityProject(req, res, next) {
  try {
    const { rows } = await getPool().query(
      `SELECT ph.project_id FROM pm_activities a JOIN pm_phases ph ON ph.phase_id=a.phase_id WHERE a.activity_id=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Activity not found' });
    req.pmProjectId = rows[0].project_id;
    next();
  } catch(err) { next(err); }
}

router.use(authenticate);

router.patch('/:id',        resolveActivityProject, requireRole('Manager'), ctrl.update);
router.delete('/:id',       resolveActivityProject, requireRole('Manager'), ctrl.remove);
router.patch('/:id/status', resolveActivityProject, requireRole('Manager'), ctrl.updateStatus);
router.post('/:id/dependencies',          resolveActivityProject, requireRole('Manager'), checkCircular('activity'), ctrl.addDep);
router.delete('/:id/dependencies/:depId', resolveActivityProject, requireRole('Manager'), ctrl.removeDep);

// Tasks for an activity
router.get('/:activityId/tasks',  async (req,res,next) => { try { res.json(await require('../services/taskService').getTasksForActivity(req.params.activityId)); } catch(e){next(e);} });
router.post('/:activityId/tasks', async (req,res,next) => {
  try {
    const { rows } = await getPool().query(
      `SELECT ph.project_id FROM pm_activities a JOIN pm_phases ph ON ph.phase_id=a.phase_id WHERE a.activity_id=$1`,
      [req.params.activityId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Activity not found' });
    req.pmProjectId = rows[0].project_id;
    next();
  } catch(e){next(e);}
}, requireRole('Manager'), taskCtrl.create);

module.exports = router;
