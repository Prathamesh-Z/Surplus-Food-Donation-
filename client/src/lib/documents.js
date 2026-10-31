import { getAccessToken } from './api.js';

// Shared NGO verification-document rules and upload — ONE
// implementation used by the NGO Panel and the NGO registration form,
// both posting to POST /api/ngo/documents (NGO-only, private storage,
// admin-reviewed). The server enforces the same limits again (multer
// size cap + magic-byte type check); these client checks exist so
// mistakes surface before a large upload starts.
export const DOC_OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const DOC_MAX_BYTES = 20 * 1024 * 1024; // 20 MB per file
export const DOC_MAX_FILES = 10;
export const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

// Returns a human-readable reason string, or null when the file is OK.
export function docFileError(file) {
  if (!DOC_OK_TYPES.includes(file.type)) return 'must be a PDF, JPEG or PNG file';
  if (file.size > DOC_MAX_BYTES) return 'exceeds the 20 MB size limit';
  return null;
}

// Uploads the files as one atomic batch with real progress (XHR).
// Resolves with the stored document metadata; rejects with an Error
// carrying the server's message.
export function uploadDocuments(files, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const f of files) form.append('file', f);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ngo/documents');
    xhr.setRequestHeader('Authorization', `Bearer ${getAccessToken()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText).documents ?? []);
        } catch {
          resolve([]);
        }
      } else {
        let message = 'Upload failed';
        try {
          message = JSON.parse(xhr.responseText).error || message;
        } catch {
          /* keep the default message */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
    xhr.send(form);
  });
}
