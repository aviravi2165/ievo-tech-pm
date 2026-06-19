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
    await fetchGroups();
    return group;
  }, [fetchGroups]);

  // Admin (creator) or super admin: freeze the group chat
  const disableGroup = useCallback(async (groupId) => {
    await groupApi.disableGroup(groupId);
    await fetchGroups();
  }, [fetchGroups]);

  // Admin (creator) or super admin: re-enable a disabled group
  const enableGroup = useCallback(async (groupId) => {
    await groupApi.enableGroup(groupId);
    await fetchGroups();
  }, [fetchGroups]);

  // Admin (creator) or super admin, only once disabled: hide from their own tabs
  const deleteGroup = useCallback(async (groupId) => {
    await groupApi.deleteGroup(groupId);
    setGroups(prev => prev.filter(g => g.groupId !== groupId));
  }, []);

  // Any participant, only once disabled: hide from their own tabs
  const hideGroup = useCallback(async (groupId) => {
    await groupApi.hideGroup(groupId);
    setGroups(prev => prev.filter(g => g.groupId !== groupId));
  }, []);

  return {
    groups, loading, createGroup,
    disableGroup, enableGroup, deleteGroup, hideGroup,
    refetch: fetchGroups,
  };
}