import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { projectApi, phaseApi, activityApi, taskApi } from '../api/projectApi';

/**
 * useProject — loads full project detail and subscribes to live updates.
 * Joins the /pm namespace room project:{id} for TASK_STATUS_CHANGED and ENTITY_UNBLOCKED events.
 */
export function useProject(projectId) {
  const [project,  setProject]  = useState(null);
  const [phases,   setPhases]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const socketRef = useRef(null);
  // Every create/save/delete anywhere in the Phase/Activity/Task tree calls
  // this same refetch to pick up server-computed fields (progress, etc.).
  // setLoading(true) on EVERY one of those calls made ProjectDetailPage's
  // `if (loading) return <Loading…>` unmount the whole Phases tree on every
  // single save, wiping which phases/activities were expanded and which
  // edit panel was open. Only the true first load should show that
  // full-page loading state; later refetches update data in place.
  const hasLoadedRef = useRef(false);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const [proj, phs] = await Promise.all([
        projectApi.get(projectId),
        projectApi.getPhases(projectId),
      ]);
      setProject(proj);
      setPhases(phs);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [projectId]);

  // Reset the "have we loaded" flag when projectId itself changes (e.g. the
  // global 'open-project' event can swap projects without unmounting this
  // hook) so switching to a different project still shows the full-page
  // loading state instead of silently reusing the previous project's data.
  useEffect(() => { hasLoadedRef.current = false; }, [projectId]);
  useEffect(() => { fetchProject(); }, [fetchProject]);

  // Socket.io /pm namespace
  useEffect(() => {
    if (!projectId) return;
    const token = localStorage.getItem('erp_token');
    if (!token) return;

    // Namespace '/pm' must be appended to the URL — it is NOT a socket.io-client option
    const baseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
    const socket = io(`${baseUrl}/pm`, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => socket.emit('join_project', { projectId }));

    // Live status change — re-fetch whole project to recompute progress
    socket.on('TASK_STATUS_CHANGED', () => fetchProject());
    socket.on('ENTITY_UNBLOCKED',    () => fetchProject());

    // Granular progress broadcast — update in-place without full refetch
    socket.on('PROGRESS_UPDATED', (data) => {
      if (data.projectProgress != null) {
        setProject(p => p ? { ...p, progress: data.projectProgress } : p);
      }
      if (data.phaseId != null && data.phaseProgress != null) {
        setPhases(ps => ps.map(ph =>
          ph.phaseId === data.phaseId ? { ...ph, progress: data.phaseProgress } : ph
        ));
      }
    });

    socketRef.current = socket;
    return () => { socket.emit('leave_project', { projectId }); socket.disconnect(); socketRef.current = null; };
  }, [projectId, fetchProject]);

  return { project, phases, loading, error, refetch: fetchProject };
}

export function useProjectList() {
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setProjects(await projectApi.list());
      setError(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { projects, loading, error, refetch: fetch };
}