'use strict';

const router  = require('express').Router();
const { authenticate, requireAdmin }  = require('../../../middleware/auth');
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

// Actual per-task completion timestamps (from the status-change audit
// trail) — feeds the Analytics tab's "Completions" chart, which used to
// bucket by dueDate as a proxy since no real timestamp was available.
// Read-only, same access as /audit's underlying data, no role gate needed.
router.get('/:id/task-completions', ctrl.getTaskCompletions);

// Manually runs the Activity Insights sweep immediately, for testing the
// cron job's output without waiting for ACTIVITY_INSIGHTS_CRON_SCHEDULE to
// fire — posts the exact same messages the scheduled run would. Admin only.
router.post('/activity-insights/run-now', requireAdmin, ctrl.runActivityInsightsNow);

// Members — flat list and hierarchical breakdown (for Members tab)
router.get('/:id/members',            ctrl.getMembers);
router.get('/:id/members/hierarchy',  ctrl.getMembersHierarchy);   // ← NEW: phase→activity tree
router.post('/:id/members',           setProjectId, requireRole('Manager'), ctrl.addMember);
router.patch('/:id/members/:uid',     setProjectId, requireRole('Manager'), ctrl.updateMember);
router.delete('/:id/members/:uid',    setProjectId, requireRole('Manager'), ctrl.removeMember);

// Analytics "+ Add Insight" catalog — read (catalog + which are added +
// their computed data) is open to any project member; adding/removing is
// Manager-gated, same as everything else that changes what a project looks
// like for everyone viewing it.
const insightsCtrl = require('../controllers/insightsController');
router.get('/insights/catalog',   insightsCtrl.getCatalog);
router.get('/:id/insights',       insightsCtrl.getAdded);
router.get('/:id/insights/data',  insightsCtrl.getData);
router.post('/:id/insights',      setProjectId, requireRole('Manager'), insightsCtrl.add);
router.delete('/:id/insights/:type', setProjectId, requireRole('Manager'), insightsCtrl.remove);

// Phases list for a project
const phaseCtrl = require('../controllers/phaseController');
router.get('/:projectId/phases',  phaseCtrl.list);
router.post('/:projectId/phases', (req,_,next) => { req.pmProjectId = req.params.projectId; next(); }, requireRole('Manager'), phaseCtrl.create);

module.exports = router;