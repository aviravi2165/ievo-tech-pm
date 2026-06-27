import api from './axiosInstance';

export const groupApi = {
  list:         ()                          => api.get('/api/groups').then(r => r.data),
  create:       (groupName, description)    => api.post('/api/groups', { groupName, description }).then(r => r.data),

  getMembers:   (groupId)                   => api.get(`/api/groups/${groupId}/members`).then(r => r.data),
  addMembers:   (groupId, userIds)          => api.post(`/api/groups/${groupId}/members`, { userIds }).then(r => r.data),
  removeMember: (groupId, userId)           => api.delete(`/api/groups/${groupId}/members/${userId}`).then(r => r.data),

  // Promote/demote a participant to co-admin — creator or super admin only
  setMemberAdmin: (groupId, userId, makeAdmin) =>
    api.patch(`/api/groups/${groupId}/members/${userId}/admin`, { makeAdmin }).then(r => r.data),

  disableGroup: (groupId)                   => api.patch(`/api/groups/${groupId}/disable`).then(r => r.data),
  enableGroup:  (groupId)                   => api.patch(`/api/groups/${groupId}/enable`).then(r => r.data),

  // Admin/super admin only, only once disabled — hides from their own tabs
  deleteGroup:  (groupId)                   => api.delete(`/api/groups/${groupId}`).then(r => r.data),

  // Any participant, only once the group is disabled — hides from their own tabs
  hideGroup:    (groupId)                   => api.post(`/api/groups/${groupId}/hide`).then(r => r.data),

  getGroupConversation: (groupId)           => api.get(`/api/groups/${groupId}/conversation`).then(r => r.data),

  // Create a group conversation (used when no conversation exists yet)
  createGroupConversation: (groupId)        => api.post(`/api/groups/${groupId}/conversation`).then(r => r.data),
};