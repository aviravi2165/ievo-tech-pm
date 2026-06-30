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
router.post('/:conversationId/participants',                 messageController.addParticipant);
router.patch('/:conversationId/archive',                    messageController.archive);

// FIX: Remove participant from CC thread (sender only)
router.delete('/:conversationId/participants/:userId',       messageController.removeParticipant);

// ── Admin thread management (Threads tab — super admin governance, ────────
// mirrors /api/groups). Must come before the generic /:messageId routes
// below, and uses a distinct '/threads' prefix so it never collides with
// the numeric-id routes for conversations or messages.
router.get('/threads',                                       messageController.listThreadsForAdmin);
router.patch('/threads/:conversationId/disable',              messageController.disableThread);
router.patch('/threads/:conversationId/enable',                messageController.enableThread);
router.post('/threads/:conversationId/hide',                   messageController.hideThread);
router.delete('/threads/:conversationId',                      messageController.deleteThread);

// Note: messageId routes must come AFTER named /:conversationId routes to avoid conflicts
router.patch('/:messageId/edit',                            messageController.editMessage);
router.patch('/:messageId/read',                            messageController.markRead);
router.delete('/:messageId',                                messageController.remove);

module.exports = router;