// Tiny API helper — stores tokens in localStorage and attaches the access
// token. Access tokens live 15 minutes (PRD FR-02); when one expires, the
// helper silently exchanges the 7-day refresh token for a new access token
// and retries the request once, so a long-open page never surfaces a raw
// "Invalid or expired token" error mid-task (fixed in v3.4.1).
const TOKEN_KEY = 'fws_access_token';
const REFRESH_KEY = 'fws_refresh_token';

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(access, refresh) {
  if (access) localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  notifyAuthChange();
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  notifyAuthChange();
}

// QA-01: token changes used to be invisible to React — Nav read
// localStorage at render time and never re-rendered after login. Every
// token write now broadcasts, and the AuthContext syncs from it.
export function notifyAuthChange() {
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent('fws:auth-changed'));
  }
}

// Join Zod field errors from a server payload ({details: {fieldErrors}})
// into one readable line; '' when there are none.
export function fieldErrorsText(data) {
  const fields = data?.details?.fieldErrors;
  if (fields && Object.keys(fields).length > 0) return Object.values(fields).flat().join(' ');
  return '';
}

// One error string for a failed api() call: field errors first (QA-03),
// then the server message, then the generic message.
export function formatApiError(err) {
  return fieldErrorsText(err?.data) || err?.data?.error || err?.message || 'Request failed';
}

let refreshInFlight = null;

/** Exchange the stored refresh token for a new access token (single-flight). */
export async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;
        const data = await res.json().catch(() => ({}));
        if (!data.accessToken) return null;
        setTokens(data.accessToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * fetch() with the access token attached; on a 401 it refreshes the token
 * once and retries. `makeInit` is a factory so bodies like FormData are
 * rebuilt fresh for the retry.
 */
export async function authedFetch(path, makeInit) {
  const build = (token) => {
    const init = typeof makeInit === 'function' ? makeInit() : { ...makeInit };
    init.headers = { ...(init.headers ?? {}), Authorization: `Bearer ${token}` };
    return init;
  };
  let res = await fetch(path, build(getAccessToken()));
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      res = await fetch(path, build(fresh));
    } else {
      clearTokens();
    }
  }
  return res;
}

export async function api(path, { method = 'GET', body, token, skipRefresh = false } = {}) {
  const doCall = (tok) =>
    fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  let res = await doCall(token ?? getAccessToken());
  // QA-02: some 401s are business errors, not expired tokens (the pickup
  // verify endpoint used to answer 401 for a wrong code). Callers that know
  // their 401 is not an auth failure pass skipRefresh so no silent refresh
  // (and no session-clearing) happens.
  if (res.status === 401 && !token && !skipRefresh) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await doCall(fresh);
    else clearTokens();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Food recognition (PRD v3.3): multipart upload to the backend proxy. */
export async function recognizeFood(file) {
  const res = await authedFetch('/api/listings/recognize', () => {
    const fd = new FormData();
    fd.append('photo', file);
    return { method: 'POST', body: fd };
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Recognition failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

