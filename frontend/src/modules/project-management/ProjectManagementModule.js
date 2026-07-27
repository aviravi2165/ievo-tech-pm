import { useState, useEffect } from 'react';
import ProjectListPage   from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TemplatesPage     from './pages/TemplatesPage';
import ToastHost from './components/ToastHost';

/**
 * ProjectManagementModule
 * Pass currentUser down so TaskItem/MemberManager know who the logged-in user is.
 * Listens for 'open-project' window event (dispatched by DashboardModule after
 * 'navigate-to-module' switches the shell to this module).
 */
export default function ProjectManagementModule({ currentUser }) {
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      const id = e.detail?.projectId;
      if (id != null) { setActiveProjectId(id); setShowTemplates(false); }
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

  if (showTemplates) {
    return (
      <>
        <TemplatesPage
          onBack={() => setShowTemplates(false)}
          onProjectCreated={(id) => { setShowTemplates(false); setActiveProjectId(id); }}
          isAdmin={currentUser?.userType === 'admin'}
        />
        <ToastHost />
      </>
    );
  }

  return (
    <>
      <ProjectListPage
        onSelectProject={(id) => setActiveProjectId(id)}
        onOpenTemplates={() => setShowTemplates(true)}
      />
      <ToastHost />
    </>
  );
}