'use strict';
const messageService = require('../services/messageService');

function handleError(res, err) {
  console.error('[messageController]', err.message);
  return res.status(err.statusCode || 500).json({
    error:   err.message,
    message: err.message,
  });
}

async function getInbox(req, res) {
  try {
    const { page = 1, limit = 30 } = req.query;
    const data = await messageService.getInbox(req.user.userId, Number(page), Number(limit));
    return res.json(data);
  } catch (err) { return handleError(res, err); }
}

async function getSent(req, res) {
  try {
    const { page = 1, limit = 30 } = req.query;
    const data = await messageService.getSent(req.user.userId, Number(page), Number(limit));
    return res.json(data);
  } catch (err) { return handleError(res, err); }
}

async function getUnreadCount(req, res) {
  try {
    const count = await messageService.getUnreadCount(req.user.userId);
    return res.json({ count });
  } catch (err) { return handleError(res, err); }
}

async function getUnreadConversationIds(req, res) {
  try {
    const ids = await messageService.getUnreadConversationIds(req.user.userId);
    return res.json({ ids });
  } catch (err) { return handleError(res, err); }
}

async function search(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const results = await messageService.searchMessages(req.user.userId, q);
    return res.json(results);
  } catch (err) { return handleError(res, err); }
}

async function send(req, res) {
  try {
    const results = await messageService.sendMessage(req.user.userId, req.body);
    return res.status(201).json(results);
  } catch (err) { return handleError(res, err); }
}

async function getThread(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    const data = await messageService.getThread(conversationId, req.user.userId);
    return res.json(data);
  } catch (err) { return handleError(res, err); }
}

async function reply(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    const result = await messageService.replyToConversation(conversationId, req.user.userId, req.body);
    return res.status(201).json(result);
  } catch (err) { return handleError(res, err); }
}

async function archive(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    await messageService.archiveConversation(conversationId, req.user.userId);
    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}

// FIX: added — was missing entirely
async function removeParticipant(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    const targetUserId = req.params.userId;
    if (!targetUserId || typeof targetUserId !== 'string') {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    await messageService.removeParticipant(conversationId, targetUserId, req.user.userId);
    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}

// Add participants to a CC conversation (creator or super-admin only)
async function addParticipant(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }
    await messageService.addParticipant(conversationId, userIds, req.user.userId, req.user.userType);
    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}

async function markRead(req, res) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    if (isNaN(messageId)) return res.status(400).json({ error: 'Invalid message id' });
    const result = await messageService.markMessageRead(messageId, req.user.userId);
    return res.json(result);
  } catch (err) { return handleError(res, err); }
}

async function remove(req, res) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    if (isNaN(messageId)) return res.status(400).json({ error: 'Invalid message id' });
    await messageService.softDeleteMessage(messageId, req.user.userId);
    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}

// ── Admin thread management (Threads tab, mirrors groupController) ───────────

async function listThreadsForAdmin(req, res) {
  try {
    const threads = await messageService.listAllThreadsForAdmin(req.user.userId);
    return res.json(threads);
  } catch (err) { return handleError(res, err); }
}

async function disableThread(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    await messageService.disableThread(conversationId, req.user.userId);
    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}

async function enableThread(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    await messageService.enableThread(conversationId, req.user.userId);
    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}

async function deleteThread(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    await messageService.deleteThreadForActor(conversationId, req.user.userId);
    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}

async function hideThread(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation id' });
    await messageService.hideDisabledThreadForUser(conversationId, req.user.userId);
    return res.json({ success: true });
  } catch (err) { return handleError(res, err); }
}

module.exports = {
  getInbox, getSent, getUnreadCount, getUnreadConversationIds,
  search, send, getThread, reply, archive,
  removeParticipant,  // FIX: exported
  addParticipant,
  markRead, remove,
  listThreadsForAdmin, disableThread, enableThread, deleteThread, hideThread,
};