'use strict';

const router  = require('express').Router();
const { authenticate }  = require('../../../middleware/auth');
const { requireRole }   = require('../middleware/projectRole');
const ctrl = require('../controllers/projectController');

const setProjectId = (req, _, next) => { req.pmProjectId = req.params.id; next(); };

router.use(authenticate);

// Projects
router.get('/',      ctrl.list);
router.post('/',     ctrl.create);
router.get('/:id',   ctrl.get);
router.patch('/:id',  setProjectId, requireRole('Manager'), ctrl.update);
router.delete('/:id', setProjectId, requireRole('Manager'), ctrl.remove);
router.post('/:id/reactivate', setProjectId, requireRole('Manager'), ctrl.reactivate);
router.get('/:id/audit', setProjectId, requireRole('Manager'), ctrl.getAudit);

// Members — flat list and hierarchical breakdown (for Members tab)
router.get('/:id/members',            ctrl.getMembers);
router.get('/:id/members/hierarchy',  ctrl.getMembersHierarchy);   // ← NEW: phase→activity tree
router.post('/:id/members',           setProjectId, requireRole('Manager'), ctrl.addMember);
router.patch('/:id/members/:uid',     setProjectId, requireRole('Manager'), ctrl.updateMember);
router.delete('/:id/members/:uid',    setProjectId, requireRole('Manager'), ctrl.removeMember);

// Phases list for a project
const phaseCtrl = require('../controllers/phaseController');
router.get('/:projectId/phases',  phaseCtrl.list);
router.post('/:projectId/phases', (req,_,next) => { req.pmProjectId = req.params.projectId; next(); }, requireRole('Manager'), phaseCtrl.create);

module.exports = router;