const projectRoutes = require('./routes/projectRoutes');

/**
 * Project management module — stub for future scale-out.
 */
function registerProjectManagementModule(app) {
  app.use('/api/projects', projectRoutes);
  return { name: 'project-management' };
}

module.exports = {
  registerProjectManagementModule,
};
