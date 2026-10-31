import { getAccessToken } from './api.js';

// Profile-photo rules + upload, shared by the Register form and the
// Profile page. Mirrors the server (POST /api/users/me/photo): JPEG,
// PNG or WebP, 5 MB max — the server re-validates by magic bytes, so
// these checks only fail fast with a friendly message.
export const PHOTO_OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

// Returns a human-readable reason string, or null when the file is OK.
export function profilePhotoError(file) {
  if (!PHOTO_OK_TYPES.includes(file.type)) return 'must be a JPEG, PNG or WebP image';
  if (file.size > PHOTO_MAX_BYTES) return 'exceeds the 5 MB size limit';
  return null;
}

// Uploads (or replaces) the signed-in user's profile photo and
// resolves with the updated user object from the server.
export async function uploadProfilePhoto(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/users/me/photo', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Photo upload failed');
  return data.user;
}
