import api from './axiosInstance';

export const groupApi = {
  list:         ()                 => api.get('/api/groups').then(r => r.data),
  create:       (groupName)        => api.post('/api/groups', { groupName }).then(r => r.data),

  // FIX: was missing — used by ComposeModal group expand and GroupManager
  getMembers:   (groupId)          => api.get(`/api/groups/${groupId}/members`).then(r => r.data),
  addMembers:   (groupId, userIds) => api.post(`/api/groups/${groupId}/members`, { userIds }).then(r => r.data),
  removeMember: (groupId, userId)  => api.delete(`/api/groups/${groupId}/members/${userId}`).then(r => r.data),
  leaveGroup:   (groupId, deleteChat = false) =>
    api.post(`/api/groups/${groupId}/leave`, { deleteChat }).then(r => r.data),
  deleteGroup:  (groupId)          => api.delete(`/api/groups/${groupId}`).then(r => r.data),

  // FIX: was missing — used by GroupManager "Open thread" button
  getGroupConversation: (groupId)  => api.get(`/api/groups/${groupId}/conversation`).then(r => r.data),
};
