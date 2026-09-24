import axiosInstance from '../../messages/api/axiosInstance';

// AI Learning — one continuous journal thread per employee. Thread lookup
// only; actual messages go through the existing generic messageApi
// (see ../../messages/api/messageApi.js) once you have a conversationId.
export const aiLearningApi = {
  // { isManagerOrAdmin, myThread: { conversationId } | null }
  getContext:  ()               => axiosInstance.get('/api/ai-learning/context').then(r => r.data),
  // Manager/admin employee list, sorted by latest activity.
  listEmployees: (search)       => axiosInstance.get('/api/ai-learning/employees', { params: { search } }).then(r => r.data),
  // { conversationId } | { conversationId: null } if that employee hasn't posted yet.
  getEmployeeThread: (employeeId) => axiosInstance.get(`/api/ai-learning/employees/${employeeId}/thread`).then(r => r.data),
};
