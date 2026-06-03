import DashboardModule from '../../modules/dashboard/DashboardModule';
import ProjectManagementModule from '../../modules/project-management/ProjectManagementModule';
import SchedulingModule from '../../modules/scheduling/SchedulingModule';

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
    status: 'active',
    component: DashboardModule,
  },
  {
    id: 'project-management',
    label: 'Project Management',
    shortLabel: 'Projects',
    description: 'Projects, tasks & milestones',
    status: 'coming-soon',
    component: ProjectManagementModule,
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    shortLabel: 'Schedule',
    description: 'Production & delivery schedules',
    status: 'coming-soon',
    component: SchedulingModule,
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
