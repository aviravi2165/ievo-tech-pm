import api from './axiosInstance';

// Admin-managed org-wide "team" groups (e.g. "Production Team") — distinct
// from groupApi's user-created CHAT groups. Read endpoints are open to any
// authenticated user; mutations are admin-only (enforced server-side too).
export const orgGroupApi = {
  list:         ()                              => api.get('/api/org-groups').then(r => r.data),
  getMembers:   (orgGroupId)                     => api.get(`/api/org-groups/${orgGroupId}/members`).then(r => r.data),

  create:       (name, description, memberIds)  => api.post('/api/org-groups', { name, description, memberIds }).then(r => r.data),
  update:       (orgGroupId, data)               => api.patch(`/api/org-groups/${orgGroupId}`, data).then(r => r.data),
  remove:       (orgGroupId)                     => api.delete(`/api/org-groups/${orgGroupId}`).then(r => r.data),

  addMembers:   (orgGroupId, userIds)            => api.post(`/api/org-groups/${orgGroupId}/members`, { userIds }).then(r => r.data),
  removeMember: (orgGroupId, userId)             => api.delete(`/api/org-groups/${orgGroupId}/members/${userId}`).then(r => r.data),
};
