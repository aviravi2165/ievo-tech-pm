/**
 * PM Socket Handler
 *
 * Uses the EXISTING Socket.io server instance created by the messages module.
 * Opens a separate /pm namespace on it — no new Server, no port conflict.
 *
 * Rooms:  project:{projectId}  — members join when they open a project page
 * Events: TASK_STATUS_CHANGED, ENTITY_UNBLOCKED
 */
const { verifyToken } = require('../../../middleware/auth');

let pmNamespace = null;

/**
 * Called from the PM module index after the messages socket is already initialised.
 * Receives the shared io instance via getIo() from the messages module.
 */
function initPmSocket() {
  // Lazy-require to avoid circular dependency at module load time
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

function closePmSocket() {
  pmNamespace = null;
}

module.exports = { initPmSocket, closePmSocket, broadcastStatusChanged, broadcastUnblocked };