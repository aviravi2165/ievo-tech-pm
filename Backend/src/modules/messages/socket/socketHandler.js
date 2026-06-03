const { Server } = require('socket.io');
const { verifyToken } = require('../../../middleware/auth');
const messageService = require('../services/messageService');

let io = null;

/**
 * Socket payloads must never include HTML or file data (PRD).
 */
function toNewMessagePayload(payload) {
  return {
    conversationId: payload.conversationId,
    messageId: payload.messageId,
    senderName: payload.senderName,
    subject: payload.subject,
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
      if (!token) {
        return next(new Error('Authentication required'));
      }
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
      if (Number.isNaN(conversationId)) {
        return;
      }

      try {
        await messageService.assertConversationParticipant(
          conversationId,
          userId
        );
        socket.join(`conv:${conversationId}`);
      } catch {
        // Ignore unauthorized room joins
      }
    });

    socket.on('leave_conversation', (data = {}) => {
      const conversationId = parseInt(data.conversationId, 10);
      if (!Number.isNaN(conversationId)) {
        socket.leave(`conv:${conversationId}`);
      }
    });

    socket.on('MARK_READ', async (data = {}) => {
      const messageId = parseInt(data.messageId, 10);
      const conversationId = parseInt(data.conversationId, 10);
      if (Number.isNaN(messageId) || Number.isNaN(conversationId)) {
        return;
      }

      try {
        await messageService.assertConversationParticipant(
          conversationId,
          userId
        );

        const payload = {
          messageId,
          userId,
          readAt: new Date().toISOString(),
        };

        socket.to(`conv:${conversationId}`).emit('MARK_READ', payload);
      } catch {
        // Ignore invalid read broadcasts
      }
    });
  });

  return io;
}

/**
 * Broadcasts NEW_MESSAGE to conversation viewers and all participants.
 */
async function broadcastNewMessage(result) {
  if (!io || !result) {
    return;
  }

  const payload = toNewMessagePayload(result);
  const conversationId = payload.conversationId;

  io.to(`conv:${conversationId}`).emit('NEW_MESSAGE', payload);

  const participantIds = await messageService.getParticipantUserIds(
    conversationId
  );
  participantIds.forEach((participantId) => {
    io.to(`user:${participantId}`).emit('NEW_MESSAGE', payload);
  });
}

/**
 * Broadcasts MARK_READ to others viewing the conversation.
 */
function broadcastMarkRead({ conversationId, messageId, userId, readAt }) {
  if (!io) {
    return;
  }

  io.to(`conv:${conversationId}`).emit('MARK_READ', {
    messageId,
    userId,
    readAt,
  });
}

function closeSocket() {
  if (io) {
    io.close();
    io = null;
  }
}

function getIo() {
  return io;
}

module.exports = {
  initSocket,
  broadcastNewMessage,
  broadcastMarkRead,
  closeSocket,
  getIo,
};
