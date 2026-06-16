'use strict';
const express = require('express');
const { authenticate } = require('../../../middleware/auth');
const messageController = require('../controllers/messageController');

const router = express.Router();
router.use(authenticate);

router.get('/inbox',                                        messageController.getInbox);
router.get('/sent',                                         messageController.getSent);
router.get('/unread-count',                                 messageController.getUnreadCount);
router.get('/unread-conversation-ids',                      messageController.getUnreadConversationIds);
router.get('/search',                                       messageController.search);

// Send — handles bcc / cc / group_thread via body.mode
router.post('/send',                                        messageController.send);

router.get('/:conversationId/thread',                       messageController.getThread);
router.post('/:conversationId/reply',                       messageController.reply);
router.patch('/:conversationId/archive',                    messageController.archive);

// FIX: Remove participant from CC thread (sender only)
router.delete('/:conversationId/participants/:userId',       messageController.removeParticipant);

// Note: messageId routes must come AFTER named /:conversationId routes to avoid conflicts
router.patch('/:messageId/read',                            messageController.markRead);
router.delete('/:messageId',                                messageController.remove);

module.exports = router;