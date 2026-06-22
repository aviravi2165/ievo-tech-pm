
/**
 * ERP module registry. Add new modules here when integrating.
 * @typedef {'active' | 'coming-soon'} ModuleStatus
 */

export const ERP_MODULES = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    description: 'Overview, recent activity & assignments',
    status: 'coming-soon',
    component: null,
  },
  {
    id: 'project-management',
    label: 'Project Management',
    shortLabel: 'Projects',
    description: 'Projects, tasks & milestones',
    status: 'coming-soon',
    component: null,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    shortLabel: 'Stock',
    description: 'Materials & warehouse',
    status: 'coming-soon',
    component: null,
  },
  {
    id: 'hr',
    label: 'HR & Workforce',
    shortLabel: 'HR',
    description: 'Team & attendance',
    status: 'coming-soon',
    component: null,
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    shortLabel: 'Reports',
    description: 'Insights & exports',
    status: 'coming-soon',
    component: null,
  },
];

export const DEFAULT_MODULE_ID = 'dashboard';
