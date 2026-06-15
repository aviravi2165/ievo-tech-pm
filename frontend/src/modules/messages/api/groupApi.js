import api from './axiosInstance';

export const groupApi = {
  list:         ()               => api.get('/api/groups').then(r => r.data),
  create:       (groupName)      => api.post('/api/groups', { groupName }).then(r => r.data),
  getMembers:   (groupId)        => api.get(`/api/groups/${groupId}/members`).then(r => r.data),
  addMembers:   (groupId, userIds) => api.post(`/api/groups/${groupId}/members`, { userIds }).then(r => r.data),
  removeMember: (groupId, userId)  => api.delete(`/api/groups/${groupId}/members/${userId}`).then(r => r.data),
  deleteGroup:  (groupId)        => api.delete(`/api/groups/${groupId}`).then(r => r.data),
};