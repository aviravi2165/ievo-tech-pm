import api from '../messages/api/axiosInstance';

export const userApi = {
  /** List all departments (for dept dropdown). Admin only. */
  getDepartments: () =>
    api.get('/api/users/departments').then(r => r.data),

  /** List users with optional search + pagination. Admin only. */
  getUsers: (params = {}) =>
    api.get('/api/users/list', { params }).then(r => r.data),

  /** Register a new user. Admin only. */
  register: (data) =>
    api.post('/api/users/register', data).then(r => r.data),

  /** Partial update of a user. Admin only. */
  update: (userId, data) =>
    api.patch(`/api/users/${userId}`, data).then(r => r.data),

  /** Search users by name/email (existing endpoint, used for manager picker). */
  search: (q, limit = 12) =>
    api.get('/api/users/search', { params: { q, limit } }).then(r => r.data.users || r.data),
};