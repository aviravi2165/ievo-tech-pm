const express = require('express');
const { authenticate } = require('../../../middleware/auth');
const messageController = require('../controllers/messageController');

const router = express.Router();

router.use(authenticate);

router.get('/inbox', messageController.getInbox);
router.get('/sent', messageController.getSent);
router.get('/unread-count', messageController.getUnreadCount);
router.get('/search', messageController.search);
router.post('/send', messageController.send);

router.get('/:conversationId/thread', messageController.getThread);
router.post('/:conversationId/reply', messageController.reply);
router.patch('/:conversationId/archive', messageController.archive);

router.patch('/:messageId/read', messageController.markRead);
router.delete('/:messageId', messageController.remove);

module.exports = router;
