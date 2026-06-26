'use strict';

const { Server }              = require('socket.io');
const { verifyToken }         = require('../../../middleware/auth');
const { isUserActive }        = require('../../auth/services/authService');
const messageService          = require('../services/messageService');
// FIX Bug 6: moved require to top-level instead of inside the MARK_READ
// event handler where it ran on every event (needless cache lookups on
// the hot path).
const { getPool, sql }        = require('../../../config/db');

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

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const user = verifyToken(token);
      // FIX: same gap as the HTTP authenticate middleware — a valid JWT
      // alone doesn't mean the account is still active right now. Without
      // this, a deactivated user could still open brand-new socket
      // connections (e.g. on every page refresh) using their old token
      // until it naturally expires.
      if (!(await isUserActive(user.userId))) {
        return next(new Error('Account has been deactivated'));
      }
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, userType } = socket.data.user;
    socket.join(`user:${userId}`);

    socket.on('join_conversation', async (data = {}) => {
      const conversationId = parseInt(data.conversationId, 10);
      if (Number.isNaN(conversationId)) return;
      try {
        // FIX Bug 2: super admins must NOT join individual conversation rooms.
        // assertConversationParticipant unconditionally passes for user_type='admin',
        // which would let the super admin join every conv:N room and receive
        // MARK_READ / NEW_MESSAGE events for private BCC threads between other
        // users — a WebSocket-level privacy leak even though the REST thread
        // endpoint is also guarded. Super admins have a governance view (all
        // groups/threads list) but must not receive live message events for
        // conversations they aren't actual participants of.
        if (userType === 'admin') return;

        await messageService.assertConversationParticipant(conversationId, userId);
        socket.join(`conv:${conversationId}`);
      } catch { /* ignore — participant check failed, don't join */ }
    });

    socket.on('leave_conversation', (data = {}) => {
      const conversationId = parseInt(data.conversationId, 10);
      if (!Number.isNaN(conversationId)) socket.leave(`conv:${conversationId}`);
    });

    /**
     * MARK_READ relay — client emits after its REST PATCH /read call succeeds.
     * Server validates participant then re-emits to other viewers in the room
     * so their tick marks update without a full thread refetch.
     * Note: messageController also calls broadcastMarkRead() server-side
     * after the DB write, so this acts as a belt-and-suspenders relay for
     * any client that still emits it explicitly.
     */
    socket.on('MARK_READ', async (data = {}) => {
      const messageId      = parseInt(data.messageId,      10);
      const conversationId = parseInt(data.conversationId, 10);
      if (Number.isNaN(messageId) || Number.isNaN(conversationId)) return;

      // Super admins cannot relay MARK_READ for conversations they don't
      // genuinely participate in (see Bug 2 fix above).
      if (userType === 'admin') return;

      try {
        await messageService.assertConversationParticipant(conversationId, userId);

        let userName = data.userName;
        if (!userName) {
          // FIX Bug 6: getPool/sql are now top-level imports, not re-required here.
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

/**
 * FIX Bug 1: broadcastNewMessage previously emitted NEW_MESSAGE to BOTH
 * the conv:N room AND every user:N room for every participant. Any
 * participant who had joined the conv: room (i.e. had the conversation
 * open) received the event twice — once per room — causing useInbox's
 * handler to increment unreadCount by 2 and potentially trigger duplicate
 * fetchInbox calls.
 *
 * Fix: emit to conv:N (for open-thread live updates) SEPARATELY from
 * user:N (for inbox sidebar updates). Participants in the conv: room
 * must NOT also receive the user: emission. We achieve this by emitting
 * to user:N with the `except` socket-filter: skip any socket already in
 * the conv:N room, since those connections already got the event.
 *
 * Implementation: socket.io's `io.to('roomA').except('roomB')` API
 * (available since socket.io v4.0) emits only to sockets in roomA that
 * are NOT also in roomB.
 */
async function broadcastNewMessage(result) {
  if (!io || !result) return;

  const payload        = toNewMessagePayload(result);
  const conversationId = payload.conversationId;
  const convRoom       = `conv:${conversationId}`;

  // 1. Emit to sockets currently viewing this conversation (the thread pane).
  io.to(convRoom).emit('NEW_MESSAGE', payload);

  // 2. Emit to each participant's personal user: room, but ONLY if their
  //    socket is NOT already in the conv: room (i.e. they have the thread
  //    open). Those sockets already got the event in step 1.
  const participantIds = result.participantIds
    || await messageService.getParticipantUserIds(conversationId);

  participantIds.forEach(pid => {
    io.to(`user:${pid}`).except(convRoom).emit('NEW_MESSAGE', payload);
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
    io.close(callback);
    io = null;
  } else if (callback) {
    callback();
  }
}

function getIo() { return io; }

/**
 * Immediately disconnects a user's live socket connection(s) — for when an
 * admin deactivates an account mid-session. Without this, io.use() only
 * guards NEW handshakes; someone already connected before being deactivated
 * would keep their existing socket (and the real-time features it powers)
 * working indefinitely, until they happen to reconnect on their own.
 */
function forceDisconnectUser(userId) {
  if (!io) return;
  io.in(`user:${userId}`).disconnectSockets(true);
}

module.exports = {
  initSocket, broadcastNewMessage, broadcastMarkRead, closeSocket, getIo,
  forceDisconnectUser,
};