'use strict';

const router = require('express').Router();
const { authenticate, requireAdmin } = require('../../../middleware/auth');
const ctrl = require('../controllers/templateController');

router.use(authenticate);

// Read — any logged-in user browses templates.
router.get('/',    ctrl.list);
router.get('/:id', ctrl.get);

// Create a project from a template — any user (same as creating a blank
// project); the caller becomes the new project's Manager.
router.post('/:id/instantiate', ctrl.instantiate);

// Write (template curation) — admin only.
router.post('/',    requireAdmin, ctrl.create);
router.patch('/:id', requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.remove);

router.post('/:id/phases',              requireAdmin, ctrl.addPhase);
router.patch('/phases/:phaseId',        requireAdmin, ctrl.updatePhase);
router.delete('/phases/:phaseId',       requireAdmin, ctrl.removePhase);

router.post('/phases/:phaseId/activities',   requireAdmin, ctrl.addActivity);
router.patch('/activities/:activityId',      requireAdmin, ctrl.updateActivity);
router.delete('/activities/:activityId',     requireAdmin, ctrl.removeActivity);

router.post('/activities/:activityId/tasks', requireAdmin, ctrl.addTask);
router.patch('/tasks/:taskId',               requireAdmin, ctrl.updateTask);
router.delete('/tasks/:taskId',              requireAdmin, ctrl.removeTask);

module.exports = router;
