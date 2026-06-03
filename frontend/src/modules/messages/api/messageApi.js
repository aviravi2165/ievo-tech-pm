import api from './axiosInstance';

export const messageApi = {
  /** GET /api/messages/inbox — paginated */
  getInbox: (page = 1, limit = 30) =>
    api.get('/api/messages/inbox', { params: { page, limit } }).then(r => r.data),

  /** GET /api/messages/sent */
  getSent: (page = 1, limit = 30) =>
    api.get('/api/messages/sent', { params: { page, limit } }).then(r => r.data),

  /** GET /api/messages/unread-count */
  getUnreadCount: () =>
    api.get('/api/messages/unread-count').then(r => r.data.count),

  /** GET /api/messages/search?q= */
  search: (q) =>
    api.get('/api/messages/search', { params: { q } }).then(r => r.data),

  /** GET /api/messages/:id/thread */
  getThread: (conversationId) =>
    api.get(`/api/messages/${conversationId}/thread`).then(r => r.data),

  /**
   * POST /api/messages/send
   * body: { recipientIds, groupIds, subject, bodyHtml, allowReply, attachmentIds }
   */
  send: (payload) =>
    api.post('/api/messages/send', payload).then(r => r.data),

  /**
   * POST /api/messages/:id/reply
   * body: { bodyHtml, attachmentIds, parentMessageId }
   */
  reply: (conversationId, payload) =>
    api.post(`/api/messages/${conversationId}/reply`, payload).then(r => r.data),

  /** PATCH /api/messages/:id/read */
  markRead: (messageId) =>
    api.patch(`/api/messages/${messageId}/read`).then(r => r.data),

  /** PATCH /api/messages/:id/archive */
  archive: (conversationId) =>
    api.patch(`/api/messages/${conversationId}/archive`).then(r => r.data),

  /** DELETE /api/messages/:id (soft) */
  deleteMessage: (messageId) =>
    api.delete(`/api/messages/${messageId}`).then(r => r.data),
};