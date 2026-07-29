import { useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import ProjectListPage   from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TemplatesPage     from './pages/TemplatesPage';
import ToastHost from './components/ToastHost';

function ProjectListRoute({ currentUser }) {
  const navigate = useNavigate();
  return (
    <ProjectListPage
      onSelectProject={(id) => navigate(`/projects/${id}`)}
      onOpenTemplates={() => navigate('/projects/templates')}
    />
  );
}

function TemplatesRoute({ currentUser }) {
  const navigate = useNavigate();
  return (
    <TemplatesPage
      onBack={() => navigate('/projects')}
      onProjectCreated={(id) => navigate(`/projects/${id}`)}
      isAdmin={currentUser?.userType === 'admin'}
    />
  );
}

function ProjectDetailRoute({ currentUser }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  return (
    <ProjectDetailPage
      projectId={projectId}
      onBack={() => navigate('/projects')}
      currentUser={currentUser}
    />
  );
}

/**
 * ProjectManagementModule
 * Pass currentUser down so TaskItem/MemberManager know who the logged-in user is.
 *
 * Used to track "which project is open" in local useState, so the URL
 * never changed and a hard refresh always dropped you back on the project
 * list (or further out, the dashboard) — nothing about which project/page
 * you were looking at was ever recorded anywhere the browser could restore
 * from. Now routed for real: /projects (list), /projects/templates,
 * /projects/:projectId (detail) — refreshing on any of them re-mounts this
 * component fresh, reads projectId back out of the URL via useParams, and
 * lands exactly where it was.
 *
 * Still listens for 'open-project' (dispatched by DashboardModule/
 * AdminDashboard after 'navigate-to-module' switches the shell here) —
 * that mechanism is unchanged, it just navigates to a real URL now instead
 * of setting local state.
 */
export default function ProjectManagementModule({ currentUser }) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      const id = e.detail?.projectId;
      if (id != null) navigate(`/projects/${id}`);
    };
    window.addEventListener('open-project', handler);
    return () => window.removeEventListener('open-project', handler);
  }, [navigate]);

  return (
    <>
      <Routes>
        <Route index element={<ProjectListRoute currentUser={currentUser} />} />
        <Route path="templates" element={<TemplatesRoute currentUser={currentUser} />} />
        <Route path=":projectId" element={<ProjectDetailRoute currentUser={currentUser} />} />
      </Routes>
      <ToastHost />
    </>
  );
}
