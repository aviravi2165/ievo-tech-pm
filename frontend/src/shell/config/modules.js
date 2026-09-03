import ProjectManagementModule from '../../modules/project-management/ProjectManagementModule';
import DashboardModule from '../../modules/dashboard/DashboardModule';

/**
 * ERP module registry. Add new modules here when integrating.
 * @typedef {'active' | 'coming-soon'} ModuleStatus
 */

// `path` is this module's real URL base — it's what makes a hard refresh
// (or a shared link) land back on the right module instead of always
// bouncing to Home. Project Management is the only one with sub-routes of
// its own (see ProjectManagementModule.js's nested <Routes>), so AppShell
// mounts it at `${path}/*`; everything else is a single flat page at `path`.
export const ERP_MODULES = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    description: 'Task requests, overview & recent activity',
    status: 'active',
    path: '/',
    component: DashboardModule,
  },
  {
    id: 'project-management',
    label: 'Project Management',
    shortLabel: 'Projects',
    description: 'Projects, phases, activities & tasks',
    status: 'active',
    path: '/projects',
    component: ProjectManagementModule,
  },
  // Inventory (Stock), HR, and Reports were coming-soon placeholders —
  // removed from the sidebar so only Home and Projects show. Re-add their
  // entries here when those modules are actually built.
];

export const DEFAULT_MODULE_ID = 'dashboard';