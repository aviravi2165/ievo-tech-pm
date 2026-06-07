const { Server } = require('socket.io');
const { verifyToken } = require('../../../middleware/auth');
const messageService = require('../services/messageService');

let io = null;

/**
 * BUG FIX: Added senderUserId to payload so frontend can detect own messages
 * and NOT increment the unread badge or unread count on sent messages.
 */
function toNewMessagePayload(payload) {
  return {
    conversationId: payload.conversationId,
    messageId:      payload.messageId,
    senderName:     payload.senderName,
    senderUserId:   payload.senderUserId,   // ← FIXED: was missing
    subject:        payload.subject,
  };
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      socket.data.user = verifyToken(token);
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data.user;
    socket.join(`user:${userId}`);

    socket.on('join_conversation', async (data = {}) => {
      const conversationId = parseInt(data.conversationId, 10);
      if (Number.isNaN(conversationId)) return;
      try {
        await messageService.assertConversationParticipant(conversationId, userId);
        socket.join(`conv:${conversationId}`);
      } catch { /* ignore unauthorized */ }
    });

    socket.on('leave_conversation', (data = {}) => {
      const conversationId = parseInt(data.conversationId, 10);
      if (!Number.isNaN(conversationId)) socket.leave(`conv:${conversationId}`);
    });

    socket.on('MARK_READ', async (data = {}) => {
      const messageId      = parseInt(data.messageId, 10);
      const conversationId = parseInt(data.conversationId, 10);
      if (Number.isNaN(messageId) || Number.isNaN(conversationId)) return;
      try {
        await messageService.assertConversationParticipant(conversationId, userId);
        // Fetch userName so the "Seen by" label renders without a DB round-trip on the client
        const pool = require('../../../config/db').getPool();
        const { rows } = await pool.query(
          `SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''), email) AS name
           FROM auth_users WHERE user_id = $1`, [userId]
        );
        const userName = rows[0]?.name || 'Someone';
        socket.to(`conv:${conversationId}`).emit('MARK_READ', {
          messageId,
          userId,
          readAt: new Date().toISOString(),
          userName,
        });
      } catch { /* ignore */ }
    });
  });

  return io;
}

async function broadcastNewMessage(result) {
  if (!io || !result) return;

  const payload        = toNewMessagePayload(result);
  const conversationId = payload.conversationId;

  // Broadcast to anyone currently viewing this conversation thread
  io.to(`conv:${conversationId}`).emit('NEW_MESSAGE', payload);

  // Broadcast to every participant's personal inbox room
  const participantIds = await messageService.getParticipantUserIds(conversationId);
  participantIds.forEach((participantId) => {
    io.to(`user:${participantId}`).emit('NEW_MESSAGE', payload);
  });
}

function broadcastMarkRead({ conversationId, messageId, userId, readAt }) {
  if (!io) return;
  io.to(`conv:${conversationId}`).emit('MARK_READ', { messageId, userId, readAt });
}

function closeSocket() {
  if (io) { io.close(); io = null; }
}

function getIo() { return io; }

module.exports = { initSocket, broadcastNewMessage, broadcastMarkRead, closeSocket, getIo };