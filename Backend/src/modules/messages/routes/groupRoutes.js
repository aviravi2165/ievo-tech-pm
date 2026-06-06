/**
 * groupRoutes.js
 *
 * CHANGE: Added GET /:groupId/conversation route that returns the most-recent
 * existing conversation thread for a group.  The Groups panel uses this to
 * open the thread directly in Inbox when the user clicks a group card.
 */

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

// NEW: returns latest conversation for a group (for "open thread" feature)
router.get('/:groupId/conversation',    groupController.getGroupConversation);

router.delete('/:groupId',              groupController.remove);

module.exports = router;