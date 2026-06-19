const express = require('express');
const { authenticate } = require('../../../middleware/auth');
const groupController = require('../controllers/groupController');

const router = express.Router();

router.use(authenticate);

router.get('/',    groupController.list);
router.post('/',   groupController.create);

router.get('/:groupId/members',         groupController.getMembers);
router.post('/:groupId/members',        groupController.addMembers);
router.delete('/:groupId/members/:userId', groupController.removeMember);

// Admin (creator) or super admin only — freeze / unfreeze the chat
router.patch('/:groupId/disable',       groupController.disable);
router.patch('/:groupId/enable',        groupController.enable);

// Any participant — only once the group is disabled; hides from their own tabs
router.post('/:groupId/hide',           groupController.hide);

// returns latest conversation for a group (for "open thread" feature)
router.get('/:groupId/conversation',    groupController.getGroupConversation);

// Admin (creator) or super admin only — only once disabled (own-tabs hide)
router.delete('/:groupId',              groupController.remove);

module.exports = router;
