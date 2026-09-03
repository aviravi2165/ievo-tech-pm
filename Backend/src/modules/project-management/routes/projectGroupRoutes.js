'use strict';

const router = require('express').Router();
const { authenticate } = require('../../../middleware/auth');
const ctrl = require('../controllers/projectGroupController');

router.use(authenticate);

// Shared, org-wide project groups (folder-style). Per-action permission
// checks (Manager-on-project for assignment, creator-or-admin for
// rename/delete) live in projectGroupService.
router.get('/',        ctrl.list);
router.post('/',       ctrl.create);
router.patch('/:id',   ctrl.rename);
router.delete('/:id',  ctrl.remove);

// Move a single project into a group (body.groupId) or out of it (null).
router.patch('/project/:projectId', ctrl.setProjectGroup);

module.exports = router;
