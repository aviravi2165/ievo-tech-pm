import api from './axiosInstance';

export const groupApi = {
  /** GET /api/groups */
  list: () => api.get('/api/groups').then(r => r.data),

  /** POST /api/groups — body: { groupName } */
  create: (groupName) =>
    api.post('/api/groups', { groupName }).then(r => r.data),

  /** GET /api/groups/:id/members */
  getMembers: (groupId) =>
    api.get(`/api/groups/${groupId}/members`).then(r => r.data),

  /** POST /api/groups/:id/members — body: { userIds: [] } */
  addMembers: (groupId, userIds) =>
    api.post(`/api/groups/${groupId}/members`, { userIds }).then(r => r.data),

  /** DELETE /api/groups/:id/members/:uid */
  removeMember: (groupId, userId) =>
    api.delete(`/api/groups/${groupId}/members/${userId}`).then(r => r.data),

  /** Soft-delete a group — DELETE /api/groups/:id */
  deleteGroup: (groupId) =>
    api.delete(`/api/groups/${groupId}`).then(r => r.data),
};