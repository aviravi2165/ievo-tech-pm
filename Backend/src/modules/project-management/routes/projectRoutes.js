const router  = require('express').Router();
const { authenticate }  = require('../../../middleware/auth');
const { requireRole }   = require('../middleware/projectRole');
const ctrl = require('../controllers/projectController');

router.use(authenticate);

// Projects
router.get('/',    ctrl.list);
router.post('/',   ctrl.create);
router.get('/:id', ctrl.get);
router.patch('/:id', (req,_,next) => { req.pmProjectId = req.params.id; next(); }, requireRole('Manager'), ctrl.update);
router.delete('/:id', (req,_,next) => { req.pmProjectId = req.params.id; next(); }, requireRole('Manager'), ctrl.remove);
router.get('/:id/audit', (req,_,next) => { req.pmProjectId = req.params.id; next(); }, requireRole('Manager'), ctrl.getAudit);

// Members
router.get('/:id/members',       ctrl.getMembers);
router.post('/:id/members',      (req,_,next) => { req.pmProjectId = req.params.id; next(); }, requireRole('Manager'), ctrl.addMember);
router.patch('/:id/members/:uid',(req,_,next) => { req.pmProjectId = req.params.id; next(); }, requireRole('Manager'), ctrl.updateMember);
router.delete('/:id/members/:uid',(req,_,next) => { req.pmProjectId = req.params.id; next(); }, requireRole('Manager'), ctrl.removeMember);

// Phases list for a project
const phaseCtrl = require('../controllers/phaseController');
router.get('/:projectId/phases',  phaseCtrl.list);
router.post('/:projectId/phases', (req,_,next) => { req.pmProjectId = req.params.projectId; next(); }, requireRole('Manager'), phaseCtrl.create);

module.exports = router;
