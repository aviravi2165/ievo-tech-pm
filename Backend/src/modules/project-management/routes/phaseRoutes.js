'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const { requireEntityRole } = require('../middleware/entityRole');
const { checkCircular }= require('../middleware/circularDepCheck');
const { getPool, sql } = require('../../../config/db');
const ctrl = require('../controllers/phaseController');
const actCtrl = require('../controllers/activityController');

// Resolve projectId from phaseId for sub-routes
async function resolvePhaseProject(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('phaseId', sql.Int, req.params.id || req.params.phaseId)
      .query(`SELECT project_id FROM pm_phases WHERE phase_id=@phaseId`);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Phase not found' });
    req.pmProjectId = result.recordset[0].project_id;
    next();
  } catch (err) { next(err); }
}

router.use(authenticate);

// Phase-level Managers (pm_phase_members role=Manager) can manage their own
// Phase — requireEntityRole also grants this to project-level Managers via
// its built-in bypass, so this widens (not narrows) who can act here.
router.patch('/:id',        resolvePhaseProject, requireEntityRole('phase', 'Manager'), ctrl.update);
router.delete('/:id',       resolvePhaseProject, requireEntityRole('phase', 'Manager'), ctrl.remove);
router.patch('/:id/reactivate', resolvePhaseProject, requireEntityRole('phase', 'Manager'), ctrl.reactivate);
router.patch('/:id/reorder', resolvePhaseProject, requireEntityRole('phase', 'Manager'), ctrl.reorder);
router.post('/:id/dependencies',              resolvePhaseProject, requireEntityRole('phase', 'Manager'), checkCircular('phase'), ctrl.addDep);
router.delete('/:id/dependencies/:depId',     resolvePhaseProject, requireEntityRole('phase', 'Manager'), ctrl.removeDep);

// ── Phase members ──────────────────────────────────────────────────────────────
// Read: anyone with at least Viewer-level effective access to the phase.
// Write: the Phase's own Manager(s), OR a project-level Manager.
router.get('/:id/members',         resolvePhaseProject, requireEntityRole('phase', 'Viewer'),  ctrl.listMembers);
router.post('/:id/members',        resolvePhaseProject, requireEntityRole('phase', 'Manager'), ctrl.addMember);
router.patch('/:id/members/:uid',  resolvePhaseProject, requireEntityRole('phase', 'Manager'), ctrl.updateMemberRole);
router.delete('/:id/members/:uid', resolvePhaseProject, requireEntityRole('phase', 'Manager'), ctrl.removeMember);

// Activities for a phase — previously had NO auth/membership check at all.
router.get('/:phaseId/activities', resolvePhaseProject, requireEntityRole('phase', 'Viewer'),
  async (req, res, next) => { try { res.json(await require('../services/activityService').getActivitiesForPhase(req.params.phaseId)); } catch (e) { next(e); } });
// Phase Managers can create Activities in their own phase, matching Activity
// Managers already being able to create Tasks in their own activity.
router.post('/:phaseId/activities', resolvePhaseProject, requireEntityRole('phase', 'Manager'), actCtrl.create);

module.exports = router;