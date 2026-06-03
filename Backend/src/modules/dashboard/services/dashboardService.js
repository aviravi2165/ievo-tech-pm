/**
 * Dashboard module service — extend when ERP dashboard APIs are defined.
 */
async function getSummary(userId) {
  return {
    userId,
    openAssignments: 0,
    dueThisWeek: 0,
    activeProjects: 0,
    note: 'Connect dashboard tables and replace placeholder counts.',
  };
}

module.exports = {
  getSummary,
};
