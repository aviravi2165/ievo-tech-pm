import { useState, useEffect, useCallback } from 'react';
import { orgGroupApi } from '../api/orgGroupApi';

export function useOrgGroups() {
  const [orgGroups, setOrgGroups] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const fetchOrgGroups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await orgGroupApi.list();
      setOrgGroups(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrgGroups(); }, [fetchOrgGroups]);

  const createOrgGroup = useCallback(async (name, description, memberIds) => {
    await orgGroupApi.create(name, description, memberIds);
    await fetchOrgGroups();
  }, [fetchOrgGroups]);

  const updateOrgGroup = useCallback(async (orgGroupId, data) => {
    await orgGroupApi.update(orgGroupId, data);
    await fetchOrgGroups();
  }, [fetchOrgGroups]);

  const deleteOrgGroup = useCallback(async (orgGroupId) => {
    await orgGroupApi.remove(orgGroupId);
    setOrgGroups(prev => prev.filter(g => g.orgGroupId !== orgGroupId));
  }, []);

  const addMembers = useCallback(async (orgGroupId, userIds) => {
    await orgGroupApi.addMembers(orgGroupId, userIds);
    await fetchOrgGroups();
  }, [fetchOrgGroups]);

  const removeMember = useCallback(async (orgGroupId, userId) => {
    await orgGroupApi.removeMember(orgGroupId, userId);
    await fetchOrgGroups();
  }, [fetchOrgGroups]);

  return {
    orgGroups, loading,
    createOrgGroup, updateOrgGroup, deleteOrgGroup, addMembers, removeMember,
    refetch: fetchOrgGroups,
  };
}
