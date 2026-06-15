import api from './axiosInstance';

export const messageApi = {
  getInbox: (page = 1, limit = 30) =>
    api.get('/api/messages/inbox', { params: { page, limit } }).then(r => r.data),

  getSent: (page = 1, limit = 30) =>
    api.get('/api/messages/sent', { params: { page, limit } }).then(r => r.data),

  getUnreadCount: () =>
    api.get('/api/messages/unread-count').then(r => r.data.count),

  getUnreadConversationIds: () =>
    api.get('/api/messages/unread-conversation-ids').then(r => r.data.ids),

  search: (q) =>
    api.get('/api/messages/search', { params: { q } }).then(r => r.data),

  getThread: (conversationId) =>
    api.get(`/api/messages/${conversationId}/thread`).then(r => r.data),

  // Returns { results: [...] } — array of conversations created
  send: (payload) =>
    api.post('/api/messages/send', payload).then(r => r.data),

  reply: (conversationId, payload) =>
    api.post(`/api/messages/${conversationId}/reply`, payload).then(r => r.data),

  markRead: (messageId) =>
    api.patch(`/api/messages/${messageId}/read`).then(r => r.data),

  archive: (conversationId) =>
    api.patch(`/api/messages/${conversationId}/archive`).then(r => r.data),

  // Remove a participant from a CC thread (sender only)
  removeParticipant: (conversationId, userId) =>
    api.delete(`/api/messages/${conversationId}/participants/${userId}`).then(r => r.data),

  deleteMessage: (messageId) =>
    api.delete(`/api/messages/${messageId}`).then(r => r.data),
};