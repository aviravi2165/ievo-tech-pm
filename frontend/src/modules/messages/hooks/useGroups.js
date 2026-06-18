import { useState, useEffect, useCallback } from 'react';
import { groupApi } from '../api/groupApi';

export function useGroups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await groupApi.list();
      setGroups(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const createGroup = useCallback(async (name) => {
    const group = await groupApi.create(name);
    setGroups(prev => [group, ...prev]);
    return group;
  }, []);

  const deleteGroup = useCallback(async (groupId) => {
    await groupApi.deleteGroup(groupId);
    setGroups(prev => prev.filter(g => g.groupId !== groupId));
  }, []);

  const leaveGroup = useCallback(async (groupId, deleteChat = false) => {
    await groupApi.leaveGroup(groupId, deleteChat);
    await fetchGroups();
  }, [fetchGroups]);

  return { groups, loading, createGroup, deleteGroup, leaveGroup, refetch: fetchGroups };
}
