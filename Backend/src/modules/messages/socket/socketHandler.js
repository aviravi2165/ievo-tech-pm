const { Server }     = require('socket.io');
const { verifyToken } = require('../../../middleware/auth');
const messageService  = require('../services/messageService');

let io = null;

function toNewMessagePayload(payload) {
  return {
    conversationId: payload.conversationId,
    messageId:      payload.messageId,
    senderName:     payload.senderName,
    senderUserId:   payload.senderUserId,
    subject:        payload.subject,
  };
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || true, credentials: true },
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
      } catch { /* ignore */ }
    });

    socket.on('leave_conversation', (data = {}) => {
      const conversationId = parseInt(data.conversationId, 10);
      if (!Number.isNaN(conversationId)) socket.leave(`conv:${conversationId}`);
    });

    /**
     * MARK_READ flow:
     * 1. Client REST-PATCHes /api/messages/:id/read (writes to DB, returns userName)
     * 2. Client emits MARK_READ socket event with { messageId, conversationId, userName }
     * 3. We validate participant then broadcast to conv: room so OTHER viewers update live
     *
     * We no longer write to DB here — that's already done by the REST call.
     * We just relay the event so the tick updates for co-viewers without a full refetch.
     */
    socket.on('MARK_READ', async (data = {}) => {
      const messageId      = parseInt(data.messageId,      10);
      const conversationId = parseInt(data.conversationId, 10);
      if (Number.isNaN(messageId) || Number.isNaN(conversationId)) return;

      try {
        await messageService.assertConversationParticipant(conversationId, userId);

        // userName should be sent by the client from the REST response,
        // but if missing we look it up as a fallback
        let userName = data.userName;
        if (!userName) {
          const { getPool, sql } = require('../../../config/db');
          const pool = await getPool();
          const { recordset } = await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .query(`
              SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name,' ',last_name)),''), email) AS name
              FROM auth_users WHERE user_id = @userId
            `);
          userName = recordset[0]?.name || 'Someone';
        }

        // Broadcast to others in the conversation room (not back to sender)
        socket.to(`conv:${conversationId}`).emit('MARK_READ', {
          messageId,
          conversationId,
          userId,
          userName,
          readAt: data.readAt || new Date().toISOString(),
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

  io.to(`conv:${conversationId}`).emit('NEW_MESSAGE', payload);

  const participantIds = result.participantIds
    || await messageService.getParticipantUserIds(conversationId);

  participantIds.forEach(pid => {
    io.to(`user:${pid}`).emit('NEW_MESSAGE', payload);
  });
}

function broadcastMarkRead({ conversationId, messageId, userId, readAt, userName }) {
  if (!io) return;
  io.to(`conv:${conversationId}`).emit('MARK_READ', {
    messageId, conversationId, userId, readAt, userName,
  });
}

function closeSocket(callback) {
  if (io) {
    // io.close() also closes the underlying httpServer it was attached to
    // (it owns it, since we passed the raw http.Server into `new Server(...)`
    // in initSocket). Callers should NOT also call server.close() separately
    // afterward — that was causing a hung shutdown (see server.js).
    io.close(callback);
    io = null;
  } else if (callback) {
    callback();
  }
}

function getIo() { return io; }

module.exports = { initSocket, broadcastNewMessage, broadcastMarkRead, closeSocket, getIo };