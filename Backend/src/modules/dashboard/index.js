const dashboardRoutes = require('./routes/dashboardRoutes');

/**
 * Dashboard / home module — activities, assignments overview.
 */
function registerDashboardModule(app) {
  app.use('/api/dashboard', dashboardRoutes);
  return { name: 'dashboard' };
}

module.exports = {
  registerDashboardModule,
};
