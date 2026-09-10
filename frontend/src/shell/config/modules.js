import ProjectManagementModule from '../../modules/project-management/ProjectManagementModule';
import DashboardModule from '../../modules/dashboard/DashboardModule';
import DPRModule from '../../modules/dpr/DPRModule';

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
  {
    id: 'dpr',
    label: 'Daily Progress Report',
    shortLabel: 'DPR',
    description: 'Project report chats across projects (admins + added members)',
    status: 'active',
    path: '/dpr',
    component: DPRModule,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    shortLabel: 'Analytics',
    description: 'Cross-project analytics & insights (coming soon)',
    status: 'coming-soon',
    path: '/analytics',
    component: null, // placeholder — disabled in the drawer, shows a "Soon" badge
  },
  // Inventory (Stock), HR, and Reports were coming-soon placeholders —
  // removed from the sidebar so only Home and Projects show. Re-add their
  // entries here when those modules are actually built.
];

export const DEFAULT_MODULE_ID = 'dashboard';