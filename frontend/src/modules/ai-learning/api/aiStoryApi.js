import axios from 'axios';
import axiosInstance from '../../messages/api/axiosInstance';

// PUBLIC calls (the open "Share your AI story" page) use plain axios — the
// shared axiosInstance attaches the login token and treats a 401 as "log out",
// neither of which applies to someone who has no Specula account.
const PUBLIC_BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/public/ai-stories`;

export const publicStoryApi = {
  // { departments: [{ deptId, deptName }], aiModels: [...] }
  options: () => axios.get(`${PUBLIC_BASE}/options`).then(r => r.data),
  submit: (fields, beforeFiles = [], afterFiles = []) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) form.append(k, v); });
    beforeFiles.forEach(f => form.append('beforeFiles', f));
    afterFiles.forEach(f => form.append('afterFiles', f));
    return axios.post(PUBLIC_BASE, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
};

// Logged-in calls (AI Learning → AI Stories).
export const storyApi = {
  // params: { status (admin only), deptId, aiModel, search }
  list:   (params) => axiosInstance.get('/api/ai-learning/stories', { params }).then(r => r.data),
  review: (storyId, action, note) => axiosInstance.post(`/api/ai-learning/stories/${storyId}/review`, { action, note }).then(r => r.data),
  remove: (storyId) => axiosInstance.delete(`/api/ai-learning/stories/${storyId}`).then(r => r.data),
  download: (storyId, file) => saveBlob(`/api/ai-learning/stories/${storyId}/files/${file.fileId}`, file.originalName),
  // One-page "Your AI Story" summary (I.EVO header + border).
  downloadPdf: (story) => saveBlob(`/api/ai-learning/stories/${story.storyId}/pdf`,
    `Your AI Story - ${story.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'story'}.pdf`),
};

async function saveBlob(url, filename) {
  const r = await axiosInstance.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = objectUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export const STORY_FORM_PATH = '/ai-story';
