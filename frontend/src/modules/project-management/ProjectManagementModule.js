import { useState, useEffect } from 'react';
import ProjectListPage   from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ToastHost from './components/ToastHost';

/**
 * ProjectManagementModule
 * Pass currentUser down so TaskItem/MemberManager know who the logged-in user is.
 * Listens for 'open-project' window event (dispatched by DashboardModule after
 * 'navigate-to-module' switches the shell to this module).
 */
export default function ProjectManagementModule({ currentUser }) {
  const [activeProjectId, setActiveProjectId] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      const id = e.detail?.projectId;
      if (id != null) setActiveProjectId(id);
    };
    window.addEventListener('open-project', handler);
    return () => window.removeEventListener('open-project', handler);
  }, []);

  if (activeProjectId) {
    return (
      <>
        <ProjectDetailPage
          projectId={activeProjectId}
          onBack={() => setActiveProjectId(null)}
          currentUser={currentUser}
        />
        <ToastHost />
      </>
    );
  }

  return (
    <>
      <ProjectListPage
        onSelectProject={(id) => setActiveProjectId(id)}
      />
      <ToastHost />
    </>
  );
}