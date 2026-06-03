import api from './axiosInstance';

export const fileApi = {
  /**
   * POST /api/files/upload
   * Accepts a File object; returns { attachmentId, originalName, mimeType, fileSize }
   * @param {File} file
   * @param {Function} onProgress — (percent: number) => void
   */
  upload: (file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    }).then(r => r.data);
  },

  /** GET /api/files/:fileId/download — triggers browser download */
  getDownloadUrl: (attachmentId) =>
    `${api.defaults.baseURL}/api/files/${attachmentId}/download`,
};