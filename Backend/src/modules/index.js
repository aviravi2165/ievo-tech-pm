const {
  registerMessagesRoutes,
  initMessagesRealtime,
} = require('./messages');
const { registerDashboardModule } = require('./dashboard');
const { registerProjectManagementModule } = require('./project-management');
const { registerSchedulingModule } = require('./scheduling');

/** ERP modules with HTTP routes (add new modules here) */
const MODULE_REGISTRARS = [
  registerDashboardModule,
  registerProjectManagementModule,
  registerSchedulingModule,
];

/**
 * Mount all module HTTP routes on the Express app.
 */
function registerAllModules(app) {
  const modules = [];

  MODULE_REGISTRARS.forEach((register) => {
    modules.push(register(app));
  });

  registerMessagesRoutes(app);
  modules.push({ name: 'messages' });

  return { modules };
}

/**
 * Initialize realtime features (Socket.io) after http.createServer(app).
 */
function initAllRealtime(httpServer) {
  return initMessagesRealtime(httpServer);
}

module.exports = {
  registerAllModules,
  initAllRealtime,
  registerMessagesRoutes,
  initMessagesRealtime,
  registerDashboardModule,
  registerProjectManagementModule,
  registerSchedulingModule,
};
