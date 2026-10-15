/**
 * api.js — API service for communicating with the Flask backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Unable to connect to the server. Is the backend running?');
    }
    throw err;
  }
}

/**
 * Check server health.
 */
export async function checkHealth() {
  return apiFetch('/health');
}

/**
 * List all files.
 */
export async function listFiles() {
  return apiFetch('/files');
}

/**
 * Upload files with progress tracking.
 * @param {FileList|File[]} files
 * @param {function} onProgress - Called with (loaded, total)
 * @returns {Promise<object>}
 */
export function uploadFiles(files, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/files`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded, e.total);
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.error || 'Upload failed'));
        }
      } catch {
        reject(new Error('Invalid response from server'));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'));
    });

    xhr.send(formData);
  });
}

/**
 * Get download URL for a file.
 */
export async function getDownloadUrl(fileId) {
  const data = await apiFetch(`/files/${encodeURIComponent(fileId)}/download`);
  // In dev mode, URLs are relative — prepend API base
  if (data.url.startsWith('/api/')) {
    return `${API_BASE.replace('/api', '')}${data.url}`;
  }
  return data.url;
}

/**
 * Get preview URL for a file.
 */
export async function getPreviewUrl(fileId) {
  const data = await apiFetch(`/files/${encodeURIComponent(fileId)}/preview`);
  if (data.url.startsWith('/api/')) {
    return `${API_BASE.replace('/api', '')}${data.url}`;
  }
  return data.url;
}

/**
 * Delete a file.
 */
export async function deleteFile(fileId) {
  return apiFetch(`/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });
}

/**
 * Get metadata for a single file.
 */
export async function getFileMetadata(fileId) {
  return apiFetch(`/files/${encodeURIComponent(fileId)}/metadata`);
}
