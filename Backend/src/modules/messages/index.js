const messageRoutes = require('./routes/messageRoutes');
const fileRoutes = require('./routes/fileRoutes');
const groupRoutes = require('./routes/groupRoutes');
const {
  initSocket,
  closeSocket,
  broadcastNewMessage,
  broadcastMarkRead,
  getIo,
} = require('./socket/socketHandler');

/**
 * Communication module — messages, files, groups, Socket.io.
 * Schema: backend/sql/schema.sql
 */
function registerMessagesRoutes(app) {
  app.use('/api/messages', messageRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/groups', groupRoutes);
}

function initMessagesRealtime(httpServer) {
  initSocket(httpServer);
  return { name: 'messages', closeSocket };
}

/** @deprecated Use registerMessagesRoutes + initMessagesRealtime */
function registerMessagesModule(app, httpServer) {
  registerMessagesRoutes(app);
  if (httpServer) {
    return initMessagesRealtime(httpServer);
  }
  return { name: 'messages' };
}

module.exports = {
  registerMessagesModule,
  registerMessagesRoutes,
  initMessagesRealtime,
  closeSocket,
  broadcastNewMessage,
  broadcastMarkRead,
  getIo,
};
