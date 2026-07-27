/**
 * PM Socket Handler
 *
 * Uses the EXISTING Socket.io server instance created by the messages module.
 * Opens a separate /pm namespace on it — no new Server, no port conflict.
 *
 * Rooms:
 *   project:{projectId}  — members join when they open a project page
 *   user:{userId}        — each user's personal room for assignment requests
 *
 * Events emitted:
 *   TASK_STATUS_CHANGED    — task/entity status update (all in room)
 *   ENTITY_UNBLOCKED       — dependency resolved (all in room)
 *   ASSIGNMENT_REQUEST     — task assignment request (user personal room)
 *   ASSIGNMENT_RESPONDED   — request Accepted/Declined (project room)
 *   PROGRESS_UPDATED       — progress % changed (all in room)
 */
const { verifyToken } = require('../../../middleware/auth');

let pmNamespace = null;

function initPmSocket() {
  const { getIo } = require('../../messages/socket/socketHandler');
  const io = getIo();

  if (!io) {
    console.warn('[pm:socket] Messages socket not yet initialised — PM realtime disabled');
    return;
  }

  pmNamespace = io.of('/pm');

  pmNamespace.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      socket.data.user = verifyToken(token);
      return next();
    } catch { return next(new Error('Invalid token')); }
  });

  pmNamespace.on('connection', (socket) => {
    const userId = socket.data.user?.userId;

    // Personal room — receives assignment requests
    if (userId) socket.join(`user:${userId}`);

    socket.on('join_project', (data = {}) => {
      const projectId = parseInt(data.projectId, 10);
      if (!isNaN(projectId)) socket.join(`project:${projectId}`);
    });
    socket.on('leave_project', (data = {}) => {
      const projectId = parseInt(data.projectId, 10);
      if (!isNaN(projectId)) socket.leave(`project:${projectId}`);
    });
  });

  console.log('[pm:socket] /pm namespace ready');
}

function broadcastStatusChanged(projectId, payload) {
  if (!pmNamespace) return;
  pmNamespace.to(`project:${projectId}`).emit('TASK_STATUS_CHANGED', { projectId, ...payload });
}

function broadcastUnblocked(projectId, payload) {
  if (!pmNamespace) return;
  pmNamespace.to(`project:${projectId}`).emit('ENTITY_UNBLOCKED', { projectId, ...payload });
}

/**
 * Sends an ASSIGNMENT_REQUEST event to a specific user's personal room.
 * The Dashboard module (connected later) listens for this to update its badge
 * and requests list without polling.
 *
 * @param {string} targetUserId  — the user being assigned
 * @param {object} payload       — { taskId, taskName, projectId, ... }
 */
function broadcastAssignmentRequest(targetUserId, payload) {
  if (!pmNamespace) return;
  pmNamespace.to(`user:${targetUserId}`).emit('ASSIGNMENT_REQUEST', payload);
}

/**
 * Sent to the whole project room when an assignee Accepts/Declines a
 * request — without this, a Manager viewing a task's assignee list (e.g.
 * TaskItem.js's "assign" popup) only ever saw the response after their own
 * next manual refetch, not live, since accept/decline previously emitted
 * nothing at all (only the initial request and status/progress changes did).
 *
 * @param {number} projectId
 * @param {object} payload — { taskId, assigneeId, status: 'Accepted'|'Declined' }
 */
function broadcastAssignmentResponded(projectId, payload) {
  if (!pmNamespace) return;
  pmNamespace.to(`project:${projectId}`).emit('ASSIGNMENT_RESPONDED', { projectId, ...payload });
}

function broadcastProgressUpdated(projectId, payload) {
  if (!pmNamespace) return;
  pmNamespace.to(`project:${projectId}`).emit('PROGRESS_UPDATED', { projectId, ...payload });
}

function closePmSocket() {
  pmNamespace = null;
}

module.exports = { initPmSocket, closePmSocket, broadcastStatusChanged, broadcastUnblocked, broadcastAssignmentRequest, broadcastAssignmentResponded, broadcastProgressUpdated };