import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { api, setTokens, clearTokens, getRefreshToken } from './api.js';

// QA-01: auth state lives in React state now. Previously Nav read
// localStorage at render time and never re-rendered after an SPA login, so
// the header stayed logged-out until a full reload. The provider syncs its
// user from localStorage whenever tokens change (the 'fws:auth-changed'
// event api.js fires on every set/clear) and across tabs (storage event).
const AuthContext = createContext({
  user: null,
  loggedIn: false,
  login: () => {},
  logout: async () => {},
  switchRole: async () => {},
  updateUser: () => {},
});

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('fws_user') ?? 'null');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);

  const sync = useCallback(() => setUser(readUser()), []);

  useEffect(() => {
    window.addEventListener('fws:auth-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('fws:auth-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [sync]);

  const login = useCallback((nextUser, access, refresh) => {
    setTokens(access, refresh);
    if (nextUser) localStorage.setItem('fws_user', JSON.stringify(nextUser));
    setUser(nextUser ?? readUser());
  }, []);

  // Replace the stored user with a fresher copy (e.g. after a profile
  // photo change) so every consumer of the context — Nav avatar first
  // of all — updates immediately, with no reload or re-login.
  const updateUser = useCallback((nextUser) => {
    if (!nextUser) return;
    localStorage.setItem('fws_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  // Active-role switching for USER accounts (Claimer <-> Donor). The
  // server authorizes from the database role on every request, so once
  // it confirms the switch, updating the stored user is all the client
  // needs — tokens are untouched. On any failure the stored user is
  // left exactly as it was (the toggle simply does not move).
  const switchRole = useCallback(async (role) => {
    try {
      const res = await api('/api/auth/switch-role', { method: 'POST', body: { role } });
      if (res.user) {
        localStorage.setItem('fws_user', JSON.stringify(res.user));
        setUser(res.user);
      }
      return res.user ?? null;
    } catch {
      return null;
    }
  }, []);

  // QA-13: logout revokes server-side first (best-effort — local state is
  // cleared regardless, so a failed call can never trap the user signed in).
  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        /* best-effort: local logout still proceeds */
      }
    }
    clearTokens();
    localStorage.removeItem('fws_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loggedIn: Boolean(user), login, logout, switchRole, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
