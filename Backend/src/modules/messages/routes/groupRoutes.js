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
router.post('/:groupId/leave',          groupController.leave);

// NEW: returns latest conversation for a group (for "open thread" feature)
router.get('/:groupId/conversation',    groupController.getGroupConversation);

router.delete('/:groupId',              groupController.remove);

module.exports = router;
