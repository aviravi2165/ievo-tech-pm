'use strict';

const router = require('express').Router();
const { authenticate, requireAdmin } = require('../../../middleware/auth');
const ctrl = require('../controllers/orgGroupController');

router.use(authenticate);

// Read access — everyone, so the New Message composer can list/expand teams
// for any user, not just admins.
router.get('/',            ctrl.list);
router.get('/:id/members', ctrl.getMembers);

// Mutations — admin only, per "created by admins only" requirement.
router.post('/',                       requireAdmin, ctrl.create);
router.patch('/:id',                   requireAdmin, ctrl.update);
router.delete('/:id',                  requireAdmin, ctrl.remove);
router.post('/:id/members',            requireAdmin, ctrl.addMembers);
router.delete('/:id/members/:userId',  requireAdmin, ctrl.removeMember);

module.exports = router;
