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
    // A task assignment request was Accepted/Declined by its target user —
    // same "just refetch" treatment as TASK_STATUS_CHANGED. Previously the
    // backend emitted nothing here at all, so a Manager with an Activity
    // expanded (and its Assign popup showing pending requests) only saw the
    // response after their own next manual action triggered a refetch.
    socket.on('ASSIGNMENT_RESPONDED', () => fetchProject());

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

// PAGE_SIZE=25 — see projectService.listProjects' PERF comment: every
// returned row runs its own concurrent progress/status computation, so
// bounding how many rows a single request returns is what actually caps
// the work done per fetch, not just the row count on screen.
const PAGE_SIZE = 25;

// Paginated, with a server-side `search` term (not a client-side filter
// over an already-fetched array) — a client-side filter would only ever
// search whatever page happened to be loaded already, silently missing
// matches on projects further down the list. `search` changing resets back
// to page 1, same as any search-within-a-paginated-list UX.
export function useProjectList() {
  const [projects, setProjects] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [search,   setSearchState] = useState('');
  const [loading,  setLoading]  = useState(true);   // first page of a given search
  const [loadingMore, setLoadingMore] = useState(false); // subsequent pages
  const [error,    setError]    = useState(null);

  const fetchPage = useCallback(async (pageNum, searchTerm, append) => {
    (append ? setLoadingMore : setLoading)(true);
    try {
      const { items, total: t } = await projectApi.list({ page: pageNum, pageSize: PAGE_SIZE, search: searchTerm });
      setProjects(prev => (append ? [...prev, ...items] : items));
      setTotal(t);
      setPage(pageNum);
      setError(null);
    } catch (err) { setError(err.message); }
    finally { (append ? setLoadingMore : setLoading)(false); }
  }, []);

  useEffect(() => { fetchPage(1, search, false); }, [search, fetchPage]);

  const setSearch = useCallback((term) => setSearchState(term), []);
  const loadMore = useCallback(() => {
    if (loadingMore || projects.length >= total) return;
    fetchPage(page + 1, search, true);
  }, [fetchPage, loadingMore, page, projects.length, total, search]);
  const refetch = useCallback(() => fetchPage(1, search, false), [fetchPage, search]);

  return {
    projects, total, search, setSearch,
    hasMore: projects.length < total,
    loading, loadingMore, error,
    loadMore, refetch,
  };
}