import axiosInstance from '../../messages/api/axiosInstance';

const BASE = '/api/projects';

export const projectApi = {
  // No args → full unbounded array (unchanged, used by Dashboard/AdminDashboard
  // for aggregate stats across ALL of a user's projects). Passing
  // {page, pageSize, search} opts into paginated mode instead, returning
  // {items, total, page, pageSize} — see projectService.listProjects.
  list:              (params)        => axiosInstance.get(BASE, { params }).then(r => r.data),
  get:               (id)            => axiosInstance.get(`${BASE}/${id}`).then(r => r.data),
  create:            (body)          => axiosInstance.post(BASE, body).then(r => r.data),
  update:            (id, body)      => axiosInstance.patch(`${BASE}/${id}`, body).then(r => r.data),
  delete:            (id)            => axiosInstance.delete(`${BASE}/${id}`).then(r => r.data),
  reactivate:        (id)            => axiosInstance.post(`${BASE}/${id}/reactivate`).then(r => r.data),
  getAudit:          (id)            => axiosInstance.get(`${BASE}/${id}/audit`).then(r => r.data),
  getPhases:         (id)            => axiosInstance.get(`${BASE}/${id}/phases`).then(r => r.data),
  createPhase:       (id, body)      => axiosInstance.post(`${BASE}/${id}/phases`, body).then(r => r.data),
  // Flat member list (used internally by ProjectDetailPage header/sidebar)
  getMembers:        (id)            => axiosInstance.get(`${BASE}/${id}/members`).then(r => r.data),
  // Hierarchical member list (Members tab — project → phase → activity, deduplicated,
  // now includes each member's actual phaseRole / activityRole, not just names)
  getMembersHierarchy: (id)          => axiosInstance.get(`${BASE}/${id}/members/hierarchy`).then(r => r.data),
  addMember:         (id, body)      => axiosInstance.post(`${BASE}/${id}/members`, body).then(r => r.data),
  updateMember:      (id, uid, body) => axiosInstance.patch(`${BASE}/${id}/members/${uid}`, body).then(r => r.data),
  removeMember:      (id, uid)       => axiosInstance.delete(`${BASE}/${id}/members/${uid}`).then(r => r.data),
};

export const phaseApi = {
  getActivities:  (phaseId)         => axiosInstance.get(`/api/phases/${phaseId}/activities`).then(r => r.data),
  createActivity: (phaseId, body)   => axiosInstance.post(`/api/phases/${phaseId}/activities`, body).then(r => r.data),
  update:         (id, body)        => axiosInstance.patch(`/api/phases/${id}`, body).then(r => r.data),
  delete:         (id)              => axiosInstance.delete(`/api/phases/${id}`).then(r => r.data),
  reactivate:     (id)              => axiosInstance.patch(`/api/phases/${id}/reactivate`).then(r => r.data),
  addDep:         (id, dependsOnId) => axiosInstance.post(`/api/phases/${id}/dependencies`, { dependsOnId }).then(r => r.data),
  removeDep:      (id, depId)       => axiosInstance.delete(`/api/phases/${id}/dependencies/${depId}`).then(r => r.data),
  reorder:        (id, direction)   => axiosInstance.patch(`/api/phases/${id}/reorder`, { direction }).then(r => r.data),
  // Phase members — role: 'Manager' | 'Employee' | 'Viewer'
  getMembers:     (id)              => axiosInstance.get(`/api/phases/${id}/members`).then(r => r.data),
  addMember:      (id, userId, role = 'Employee') => axiosInstance.post(`/api/phases/${id}/members`, { userId, role }).then(r => r.data),
  updateMemberRole: (id, uid, role) => axiosInstance.patch(`/api/phases/${id}/members/${uid}`, { role }).then(r => r.data),
  removeMember:   (id, uid)         => axiosInstance.delete(`/api/phases/${id}/members/${uid}`).then(r => r.data),
  // Real status-over-time — Timeline segmented bars
  getStatusHistory: (id)            => axiosInstance.get(`/api/phases/${id}/status-history`).then(r => r.data),
};

export const activityApi = {
  // Task CRUD nested under activity
  getTasks:       (actId)           => axiosInstance.get(`/api/activities/${actId}/tasks`).then(r => r.data),
  createTask:     (actId, body)     => axiosInstance.post(`/api/activities/${actId}/tasks`, body).then(r => r.data),
  // Activity CRUD
  update:         (id, body)        => axiosInstance.patch(`/api/activities/${id}`, body).then(r => r.data),
  delete:         (id)              => axiosInstance.delete(`/api/activities/${id}`).then(r => r.data),
  reactivate:     (id)              => axiosInstance.patch(`/api/activities/${id}/reactivate`).then(r => r.data),
  addDep:         (id, dependsOnId) => axiosInstance.post(`/api/activities/${id}/dependencies`, { dependsOnId }).then(r => r.data),
  removeDep:      (id, depId)       => axiosInstance.delete(`/api/activities/${id}/dependencies/${depId}`).then(r => r.data),
  // Activity members — role: 'Manager' | 'Employee' | 'Viewer'
  getMembers:     (id)              => axiosInstance.get(`/api/activities/${id}/members`).then(r => r.data),
  addMember:      (id, userId, role = 'Employee') => axiosInstance.post(`/api/activities/${id}/members`, { userId, role }).then(r => r.data),
  updateMemberRole: (id, uid, role) => axiosInstance.patch(`/api/activities/${id}/members/${uid}`, { role }).then(r => r.data),
  removeMember:   (id, uid)         => axiosInstance.delete(`/api/activities/${id}/members/${uid}`).then(r => r.data),
  // Activity group chat — returns { conversationId }, auto-creating the thread if needed
  getChat:        (id)              => axiosInstance.get(`/api/activities/${id}/chat`).then(r => r.data),
  // Real status-over-time — Timeline segmented bars
  getStatusHistory: (id)            => axiosInstance.get(`/api/activities/${id}/status-history`).then(r => r.data),
};

export const taskApi = {
  update:       (id, body)      => axiosInstance.patch(`/api/tasks/${id}`, body).then(r => r.data),
  updateStatus: (id, status)    => axiosInstance.patch(`/api/tasks/${id}/status`, { status }).then(r => r.data),
  delete:       (id)            => axiosInstance.delete(`/api/tasks/${id}`).then(r => r.data),
  reactivate:   (id)            => axiosInstance.patch(`/api/tasks/${id}/reactivate`).then(r => r.data),
  addDep:       (id, dependsOnId) => axiosInstance.post(`/api/tasks/${id}/dependencies`, { dependsOnId }).then(r => r.data),
  removeDep:    (id, depId)     => axiosInstance.delete(`/api/tasks/${id}/dependencies/${depId}`).then(r => r.data),
  // Assignment requests (replaces old direct addAssignee)
  sendRequest:   (id, userId)   => axiosInstance.post(`/api/tasks/${id}/requests`, { userId }).then(r => r.data),
  removeRequest: (id, uid)      => axiosInstance.delete(`/api/tasks/${id}/requests/${uid}`).then(r => r.data),
  // Task Shared/CC chat — returns { conversationId }, auto-creating the thread if needed
  getChat:       (id)           => axiosInstance.get(`/api/tasks/${id}/chat`).then(r => r.data),
  // Real status-over-time — Timeline segmented bars
  getStatusHistory: (id)        => axiosInstance.get(`/api/tasks/${id}/status-history`).then(r => r.data),
  // Dashboard data — no project context needed
  getMyActiveTasks: ()          => axiosInstance.get('/api/tasks/my-active-tasks').then(r => r.data),
  getMyRecentAudit: ()          => axiosInstance.get('/api/tasks/my-recent-audit').then(r => r.data),
  // Admin dashboard — org-wide, not scoped to any project (admin-only, 403 otherwise)
  getAdminRecentAudit:    ()    => axiosInstance.get('/api/tasks/admin-recent-audit').then(r => r.data),
  getAdminOverdueBlocked: ()    => axiosInstance.get('/api/tasks/admin-overdue-blocked').then(r => r.data),
  // Member dashboard — overdue/blocked tasks across every project I'm in (not just tasks assigned to me)
  getMyProjectsOverdueBlocked: () => axiosInstance.get('/api/tasks/my-projects-overdue-blocked').then(r => r.data),
};

// Assignment request management — called from the current user's perspective
// (will be consumed by the Dashboard module when it is connected)
export const requestApi = {
  // Get all pending/responded requests for the current user
  getMyRequests:   ()            => axiosInstance.get('/api/tasks/my-requests').then(r => r.data),
  // Respond to a specific request
  accept:          (requestId)   => axiosInstance.post(`/api/tasks/requests/${requestId}/accept`).then(r => r.data),
  decline:         (requestId)   => axiosInstance.post(`/api/tasks/requests/${requestId}/decline`).then(r => r.data),
};

// User search — used by MemberManager and assignee picker
export const userApi = {
  search: (q, limit = 10) =>
    axiosInstance.get(`/api/users/search?q=${encodeURIComponent(q)}&limit=${limit}`).then(r => r.data),
};