const messageService = require('../services/messageService');
const { broadcastNewMessage } = require('../socket/socketHandler');

function handleError(res, err) {
  const status = err.statusCode || (err.code === 'ATTACHMENT_LINK_FAILED' ? 400 : 500);
  return res.status(status).json({
    error: err.message,
    message: err.message,
  });
}

async function getInbox(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    const data = await messageService.getInbox(req.user.userId, page, limit);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getSent(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    const data = await messageService.getSent(req.user.userId, page, limit);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getUnreadCount(req, res) {
  try {
    const count = await messageService.getUnreadCount(req.user.userId);
    return res.json({ count });
  } catch (err) {
    return handleError(res, err);
  }
}

async function search(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json([]);
    }
    const results = await messageService.searchMessages(req.user.userId, q);
    return res.json(results);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getThread(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (Number.isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }
    const data = await messageService.getThread(conversationId, req.user.userId);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function send(req, res) {
  try {
    const result = await messageService.sendMessage(req.user.userId, req.body);
    await broadcastNewMessage(result);
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function reply(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (Number.isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }
    const result = await messageService.replyToConversation(
      conversationId,
      req.user.userId,
      req.body
    );
    await broadcastNewMessage(result);
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function markRead(req, res) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    if (Number.isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message id' });
    }
    const result = await messageService.markMessageRead(messageId, req.user.userId);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function archive(req, res) {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    if (Number.isNaN(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }
    await messageService.archiveConversation(conversationId, req.user.userId);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function remove(req, res) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    if (Number.isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message id' });
    }
    await messageService.softDeleteMessage(messageId, req.user.userId);
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  getInbox,
  getSent,
  getUnreadCount,
  search,
  getThread,
  send,
  reply,
  markRead,
  archive,
  remove,
};
