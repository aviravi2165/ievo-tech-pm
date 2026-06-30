import { useState } from 'react';
import '../project-management/assets/pm.css';
import ProjectListPage   from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';

/**
 * ProjectManagementModule
 * Pass currentUser down so TaskItem/MemberManager know who the logged-in user is.
 */
export default function ProjectManagementModule({ currentUser }) {
  const [activeProjectId, setActiveProjectId] = useState(null);

  if (activeProjectId) {
    return (
      <ProjectDetailPage
        projectId={activeProjectId}
        onBack={() => setActiveProjectId(null)}
        currentUser={currentUser}
      />
    );
  }

  return (
    <ProjectListPage
      onSelectProject={(id) => setActiveProjectId(id)}
    />
  );
}
