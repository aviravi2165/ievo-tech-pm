const messageService = require('../services/messageService');
const { broadcastNewMessage } = require('../socket/socketHandler');

function handleError(res, err) {
  const status = err.statusCode || (err.code === 'ATTACHMENT_LINK_FAILED' ? 400 : 500);
  return res.status(status).json({ error: err.message, message: err.message });
}

async function getInbox(req, res) {
  try {
    const page  = parseInt(req.query.page,  10) || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    res.json(await messageService.getInbox(req.user.userId, page, limit));
  } catch (err) { handleError(res, err); }
}

async function getSent(req, res) {
  try {
    const page  = parseInt(req.query.page,  10) || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    res.json(await messageService.getSent(req.user.userId, page, limit));
  } catch (err) { handleError(res, err); }
}

async function getUnreadCount(req, res) {
  try {
    const count = await messageService.getUnreadCount(req.user.userId);
    res.json({ count });
  } catch (err) { handleError(res, err); }
}

// NEW: returns just the array of conversationIds with unread messages
// Allows useUnreadCount to build its ref without fetching the full inbox
async function getUnreadConversationIds(req, res) {
  try {
    const ids = await messageService.getUnreadConversationIds(req.user.userId);
    res.json({ ids });
  } catch (err) { handleError(res, err); }
}

async function search(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    res.json(await messageService.searchMessages(req.user.userId, q));
  } catch (err) { handleError(res, err); }
}

async function getThread(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (Number.isNaN(conversationId))
      return res.status(400).json({ error: 'Invalid conversation id' });
    res.json(await messageService.getThread(conversationId, req.user.userId));
  } catch (err) { handleError(res, err); }
}

async function send(req, res) {
  try {
    const result = await messageService.sendMessage(req.user.userId, req.body);
    await broadcastNewMessage(result);
    res.status(201).json(result);
  } catch (err) { handleError(res, err); }
}

async function reply(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (Number.isNaN(conversationId))
      return res.status(400).json({ error: 'Invalid conversation id' });
    const result = await messageService.replyToConversation(
      conversationId, req.user.userId, req.body
    );
    await broadcastNewMessage(result);
    res.status(201).json(result);
  } catch (err) { handleError(res, err); }
}

async function markRead(req, res) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    if (Number.isNaN(messageId))
      return res.status(400).json({ error: 'Invalid message id' });
    const result = await messageService.markMessageRead(messageId, req.user.userId);
    res.json(result);
  } catch (err) { handleError(res, err); }
}

async function archive(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (Number.isNaN(conversationId))
      return res.status(400).json({ error: 'Invalid conversation id' });
    await messageService.archiveConversation(conversationId, req.user.userId);
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
}

async function remove(req, res) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    if (Number.isNaN(messageId))
      return res.status(400).json({ error: 'Invalid message id' });
    await messageService.softDeleteMessage(messageId, req.user.userId);
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
}

module.exports = {
  getInbox, getSent, getUnreadCount, getUnreadConversationIds,
  search, getThread, send, reply, markRead, archive, remove,
};