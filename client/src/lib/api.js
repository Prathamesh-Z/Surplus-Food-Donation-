// Tiny API helper — stores the access token in localStorage and attaches it.
// Module 2 (auth) builds the login/register pages on top of this.
const TOKEN_KEY = 'fws_access_token';
const REFRESH_KEY = 'fws_refresh_token';

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setTokens(access, refresh) {
  if (access) localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ?? getAccessToken() ? { Authorization: `Bearer ${token ?? getAccessToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
