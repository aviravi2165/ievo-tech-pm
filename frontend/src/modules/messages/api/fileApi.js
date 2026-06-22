import api from './axiosInstance';

export const fileApi = {
  /**
   * POST /api/files/upload
   * Accepts a File object; calls onProgress(percent) during upload.
   * Returns { attachmentId, originalName, mimeType, fileSize }
   *
   * @param {File}     file
   * @param {Function} [onProgress]  — (percent: number) => void
   */
  upload: (file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post('/api/files/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded * 100) / e.total));
          }
        },
      })
      .then((r) => r.data);
  },

  /**
   * Authenticated file download.
   *
   * Fetches the file with a Bearer token, converts to a Blob, and triggers
   * the browser's native Save-As dialog — no new tab, no 401.
   *
   * @param {number} attachmentId
   * @param {string} [filename]   — suggested save-as name (falls back to ID)
   * @returns {Promise<void>}
   */
  download: async (attachmentId, filename = `file_${attachmentId}`) => {
    const token = localStorage.getItem('erp_token');
    const baseURL = api.defaults.baseURL || '';
    const url = `${baseURL}/api/files/${attachmentId}/download`;

    const response = await fetch(url, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Download failed (${response.status}): ${text || response.statusText}`
      );
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Revoke after a short delay to allow the browser to initiate the download
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  },

  /**
   * @deprecated Use fileApi.download(attachmentId, filename) instead.
   * Returns a plain URL that cannot carry the Authorization header — will 401
   * on JWT-protected routes.
   */
  getDownloadUrl: (attachmentId) => {
    console.warn(
      '[fileApi] getDownloadUrl() is deprecated and cannot attach an ' +
        'Authorization header.  Switch to fileApi.download(attachmentId, name).'
    );
    return `${api.defaults.baseURL}/api/files/${attachmentId}/download`;
  },
};