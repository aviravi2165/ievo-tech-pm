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

  // Add participants to a CC conversation (creator or super-admin only)
  addParticipants: (conversationId, userIds) =>
    api.post(`/api/messages/${conversationId}/participants`, { userIds }).then(r => r.data),

  // ── Admin thread management (Threads tab — mirrors groupApi) ──────────────
  // Super admin only: every non-group (bcc/cc) thread in the system.
  getAdminThreads: () =>
    api.get('/api/messages/threads').then(r => r.data),

  // Creator or super admin only — freeze / unfreeze a non-group thread
  disableThread: (conversationId) =>
    api.patch(`/api/messages/threads/${conversationId}/disable`).then(r => r.data),
  enableThread: (conversationId) =>
    api.patch(`/api/messages/threads/${conversationId}/enable`).then(r => r.data),

  // Creator/super admin only, only once disabled — hides from their own tabs
  deleteThread: (conversationId) =>
    api.delete(`/api/messages/threads/${conversationId}`).then(r => r.data),

  // Any participant, only once the thread is disabled — hides from their
  // own Inbox/Sent/Threads tabs without affecting anyone else
  hideThread: (conversationId) =>
    api.post(`/api/messages/threads/${conversationId}/hide`).then(r => r.data),
};