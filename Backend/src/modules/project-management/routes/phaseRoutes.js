'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireRole }  = require('../middleware/projectRole');
const { checkCircular }= require('../middleware/circularDepCheck');
const { getPool, sql } = require('../../../config/db');
const ctrl = require('../controllers/phaseController');
const actCtrl = require('../controllers/activityController');

// Resolve projectId from phaseId for sub-routes
async function resolvePhaseProject(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('phaseId', sql.Int, req.params.id)
      .query(`SELECT project_id FROM pm_phases WHERE phase_id=@phaseId`);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Phase not found' });
    req.pmProjectId = result.recordset[0].project_id;
    next();
  } catch (err) { next(err); }
}

router.use(authenticate);

router.patch('/:id',        resolvePhaseProject, requireRole('Manager'), ctrl.update);
router.delete('/:id',       resolvePhaseProject, requireRole('Manager'), ctrl.remove);
router.patch('/:id/status',  resolvePhaseProject, requireRole('Manager'), ctrl.updateStatus);
router.patch('/:id/reorder', resolvePhaseProject, requireRole('Manager'), ctrl.reorder);
router.post('/:id/dependencies',              resolvePhaseProject, requireRole('Manager'), checkCircular('phase'), ctrl.addDep);
router.delete('/:id/dependencies/:depId',     resolvePhaseProject, requireRole('Manager'), ctrl.removeDep);

// Activities for a phase
router.get('/:phaseId/activities',  async (req, res, next) => { try { res.json(await require('../services/activityService').getActivitiesForPhase(req.params.phaseId)); } catch (e) { next(e); } });
router.post('/:phaseId/activities', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('phaseId', sql.Int, req.params.phaseId)
      .query(`SELECT project_id FROM pm_phases WHERE phase_id=@phaseId`);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Phase not found' });
    req.pmProjectId = result.recordset[0].project_id;
    next();
  } catch (e) { next(e); }
}, requireRole('Manager'), actCtrl.create);

module.exports = router;
