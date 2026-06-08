import { useState } from 'react';
import '../project-management/assets/pm.css';
import ProjectListPage   from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';

/**
 * ProjectManagementModule
 *
 * Self-contained entry point — rendered by AppShell when the
 * "Project Management" module is selected in the drawer.
 *
 * Internal routing is handled with a simple stack: null = list, id = detail.
 * No router dependency — keeps the module portable.
 */
export default function ProjectManagementModule() {
  const [activeProjectId, setActiveProjectId] = useState(null);

  if (activeProjectId) {
    return (
      <ProjectDetailPage
        projectId={activeProjectId}
        onBack={() => setActiveProjectId(null)}
      />
    );
  }

  return (
    <ProjectListPage
      onSelectProject={(id) => setActiveProjectId(id)}
    />
  );
}
