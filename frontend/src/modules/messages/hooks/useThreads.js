import { useState, useEffect, useCallback } from 'react';
import { messageApi } from '../api/messageApi';

/**
 * Super-admin-only hook for the Threads tab — mirrors useGroups.js so the
 * Threads tab can offer identical disable / enable / delete / hide controls
 * for non-group (bcc/cc) conversations that useGroups offers for groups.
 */
export function useThreads(enabled = true) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await messageApi.getAdminThreads();
      setThreads(data || []);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Creator or super admin: freeze the thread
  const disableThread = useCallback(async (conversationId) => {
    await messageApi.disableThread(conversationId);
    await fetchThreads();
  }, [fetchThreads]);

  // Creator or super admin: re-enable a disabled thread
  const enableThread = useCallback(async (conversationId) => {
    await messageApi.enableThread(conversationId);
    await fetchThreads();
  }, [fetchThreads]);

  // Creator or super admin, only once disabled: hide from their own tabs
  const deleteThread = useCallback(async (conversationId) => {
    await messageApi.deleteThread(conversationId);
    setThreads(prev => prev.filter(t => t.conversationId !== conversationId));
  }, []);

  // Any participant, only once disabled: hide from their own tabs
  const hideThread = useCallback(async (conversationId) => {
    await messageApi.hideThread(conversationId);
    setThreads(prev => prev.filter(t => t.conversationId !== conversationId));
  }, []);

  return {
    threads, loading, disableThread, enableThread, deleteThread, hideThread,
    refetch: fetchThreads,
  };
}
