import axiosInstance from '../../messages/api/axiosInstance';

const BASE = '/api/projects';

export const projectApi = {
  list:         ()              => axiosInstance.get(BASE).then(r => r.data),
  get:          (id)            => axiosInstance.get(`${BASE}/${id}`).then(r => r.data),
  create:       (body)          => axiosInstance.post(BASE, body).then(r => r.data),
  update:       (id, body)      => axiosInstance.patch(`${BASE}/${id}`, body).then(r => r.data),
  delete:       (id)            => axiosInstance.delete(`${BASE}/${id}`).then(r => r.data),
  getAudit:     (id)            => axiosInstance.get(`${BASE}/${id}/audit`).then(r => r.data),
  getPhases:    (id)            => axiosInstance.get(`${BASE}/${id}/phases`).then(r => r.data),
  createPhase:  (id, body)      => axiosInstance.post(`${BASE}/${id}/phases`, body).then(r => r.data),
  getMembers:   (id)            => axiosInstance.get(`${BASE}/${id}/members`).then(r => r.data),
  addMember:    (id, body)      => axiosInstance.post(`${BASE}/${id}/members`, body).then(r => r.data),
  updateMember: (id, uid, body) => axiosInstance.patch(`${BASE}/${id}/members/${uid}`, body).then(r => r.data),
  removeMember: (id, uid)       => axiosInstance.delete(`${BASE}/${id}/members/${uid}`).then(r => r.data),
};

export const phaseApi = {
  getActivities:  (phaseId)        => axiosInstance.get(`/api/phases/${phaseId}/activities`).then(r => r.data),
  createActivity: (phaseId, body)  => axiosInstance.post(`/api/phases/${phaseId}/activities`, body).then(r => r.data),
  update:         (id, body)       => axiosInstance.patch(`/api/phases/${id}`, body).then(r => r.data),
  updateStatus:   (id, status)     => axiosInstance.patch(`/api/phases/${id}/status`, { status }).then(r => r.data),
  delete:         (id)             => axiosInstance.delete(`/api/phases/${id}`).then(r => r.data),
  addDep:         (id, dependsOnId)=> axiosInstance.post(`/api/phases/${id}/dependencies`, { dependsOnId }).then(r => r.data),
  removeDep:      (id, depId)      => axiosInstance.delete(`/api/phases/${id}/dependencies/${depId}`).then(r => r.data),
};

export const activityApi = {
  getTasks:       (actId)          => axiosInstance.get(`/api/activities/${actId}/tasks`).then(r => r.data),
  createTask:     (actId, body)    => axiosInstance.post(`/api/activities/${actId}/tasks`, body).then(r => r.data),
  update:         (id, body)       => axiosInstance.patch(`/api/activities/${id}`, body).then(r => r.data),
  updateStatus:   (id, status)     => axiosInstance.patch(`/api/activities/${id}/status`, { status }).then(r => r.data),
  delete:         (id)             => axiosInstance.delete(`/api/activities/${id}`).then(r => r.data),
  addDep:         (id, dependsOnId)=> axiosInstance.post(`/api/activities/${id}/dependencies`, { dependsOnId }).then(r => r.data),
  removeDep:      (id, depId)      => axiosInstance.delete(`/api/activities/${id}/dependencies/${depId}`).then(r => r.data),
};

export const taskApi = {
  update:         (id, body)       => axiosInstance.patch(`/api/tasks/${id}`, body).then(r => r.data),
  updateStatus:   (id, status)     => axiosInstance.patch(`/api/tasks/${id}/status`, { status }).then(r => r.data),
  delete:         (id)             => axiosInstance.delete(`/api/tasks/${id}`).then(r => r.data),
  addAssignee:    (id, userId)     => axiosInstance.post(`/api/tasks/${id}/assignees`, { userId }).then(r => r.data),
  removeAssignee: (id, uid)        => axiosInstance.delete(`/api/tasks/${id}/assignees/${uid}`).then(r => r.data),
  addDep:         (id, dependsOnId)=> axiosInstance.post(`/api/tasks/${id}/dependencies`, { dependsOnId }).then(r => r.data),
  removeDep:      (id, depId)      => axiosInstance.delete(`/api/tasks/${id}/dependencies/${depId}`).then(r => r.data),
};
