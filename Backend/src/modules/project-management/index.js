/**
 * Project Management Module
 *
 * Routes: /api/projects/* /api/phases/* /api/activities/* /api/tasks/*
 *
 * Socket: reuses the existing Socket.io server from the messages module
 * via getIo() — no second Server instance created.
 */
const projectRoutes  = require('./routes/projectRoutes');
const phaseRoutes    = require('./routes/phaseRoutes');
const activityRoutes = require('./routes/activityRoutes');
const taskRoutes     = require('./routes/taskRoutes');
const { initPmSocket, closePmSocket } = require('./socket/socketHandler');

function register(app) {
  app.use('/api/projects',   projectRoutes);
  app.use('/api/phases',     phaseRoutes);
  app.use('/api/activities', activityRoutes);
  app.use('/api/tasks',      taskRoutes);
}

/**
 * Called after ALL modules are registered and the messages socket is live.
 * Does not need httpServer — piggybacks on the shared io instance.
 */
function initRealtime() {
  initPmSocket();
}

module.exports = { register, initRealtime };