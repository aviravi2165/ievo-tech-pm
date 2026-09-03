/**
 * Project Management Module
 *
 * Routes: /api/projects/* /api/phases/* /api/activities/* /api/tasks/* /api/templates/*
 *
 * Socket: reuses the existing Socket.io server from the messages module
 * via getIo() — no second Server instance created.
 */
const projectRoutes  = require('./routes/projectRoutes');
const projectGroupRoutes = require('./routes/projectGroupRoutes');
const phaseRoutes    = require('./routes/phaseRoutes');
const activityRoutes = require('./routes/activityRoutes');
const taskRoutes     = require('./routes/taskRoutes');
const templateRoutes = require('./routes/templateRoutes');
const { initPmSocket, closePmSocket } = require('./socket/socketHandler');
const { startActivityInsightsCron } = require('./cron/activityInsightsCron');

function register(app) {
  app.use('/api/projects',   projectRoutes);
  app.use('/api/project-groups', projectGroupRoutes);
  app.use('/api/phases',     phaseRoutes);
  app.use('/api/activities', activityRoutes);
  app.use('/api/tasks',      taskRoutes);
  app.use('/api/templates',  templateRoutes);
}

/**
 * Called after ALL modules are registered and the messages socket is live.
 * Does not need httpServer — piggybacks on the shared io instance.
 */
function initRealtime() {
  initPmSocket();
}

/**
 * Called once after the server is listening. Posts periodic task-insight
 * summaries into each PM Activity's group chat — see
 * services/activityInsightsService.js. No-ops (logs and returns) if
 * ACTIVITY_INSIGHTS_CRON_SCHEDULE isn't configured.
 */
function initCron() {
  startActivityInsightsCron();
}

module.exports = { register, initRealtime, initCron };