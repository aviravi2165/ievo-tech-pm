import axios from 'axios';
import axiosInstance from '../../messages/api/axiosInstance';

// PUBLIC calls (the open "Share a tech" form and the AI Feed) use plain axios — the shared
// axiosInstance attaches the login token and treats a 401 as "log out", neither of which
// applies to someone who has no Specula account.
const API = import.meta.env.VITE_API_BASE_URL || '';
const TECH_BASE = `${API}/api/public/ai-tech`;
const FEED_BASE = `${API}/api/public/ai-feed`;

export const TECH_FORM_PATH = '/ai-tech';
// The public timeline of approved stories and tech posts. Its name and address live here only
// (the API address /api/public/ai-feed is internal and stays as it is).
export const FEED_NAME = 'AI Pulse';
export const FEED_PATH = '/ai-pulse';

export const publicTechApi = {
  // { departments: [{ deptId, deptName }], techTypes: [...] }
  options: () => axios.get(`${TECH_BASE}/options`).then(r => r.data),
  submit: (fields, files = []) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) form.append(k, v); });
    files.forEach(f => form.append('files', f));
    return axios.post(TECH_BASE, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  // Attachment of an approved tech post (images show inline in the feed).
  fileUrl: (postId, fileId) => `${TECH_BASE}/${postId}/files/${fileId}`,
};

// The feed identifies a visitor only by the name + email they type (an honour system — nobody
// can verify an email), so these calls just carry them along.
export const publicFeedApi = {
  options: () => axios.get(`${FEED_BASE}/options`).then(r => r.data),
  // params: { type ('story'|'tech'), deptId, q, page, email }  ->  { items, hasMore, page }
  list: (params) => axios.get(FEED_BASE, { params }).then(r => r.data),
  comments: (type, id) => axios.get(`${FEED_BASE}/${type}/${id}/comments`).then(r => r.data),
  addComment: (type, id, who, body, website = '') =>
    axios.post(`${FEED_BASE}/${type}/${id}/comments`, { name: who.name, email: who.email, body, website }).then(r => r.data),
  toggleLike: (type, id, who) =>
    axios.post(`${FEED_BASE}/${type}/${id}/like`, { name: who.name, email: who.email }).then(r => r.data),
};

// Logged-in admin calls (AI Learning → AI Tech / Feed comments).
export const techApi = {
  // params: { status, deptId, search }
  list:   (params) => axiosInstance.get('/api/ai-learning/tech', { params }).then(r => r.data),
  review: (postId, action, note) => axiosInstance.post(`/api/ai-learning/tech/${postId}/review`, { action, note }).then(r => r.data),
  remove: (postId) => axiosInstance.delete(`/api/ai-learning/tech/${postId}`).then(r => r.data),
  download: async (postId, file) => {
    const r = await axiosInstance.get(`/api/ai-learning/tech/${postId}/files/${file.fileId}`, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = objectUrl; a.download = file.originalName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  },
};

export const feedAdminApi = {
  recentComments: () => axiosInstance.get('/api/ai-learning/feed/comments').then(r => r.data),
  removeComment: (commentId) => axiosInstance.delete(`/api/ai-learning/feed/comments/${commentId}`).then(r => r.data),
};
