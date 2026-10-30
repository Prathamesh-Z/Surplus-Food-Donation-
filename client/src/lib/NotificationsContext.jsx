import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './AuthContext.jsx';

/**
 * The app's single notifications poll (PRD FR-14: in-app only, 15 s).
 * Lifted out of Nav in v3.17 so the unread badge AND the banner host
 * read the same fetch — there is deliberately no second poller.
 * The Notifications page keeps its own full fetch (read-all, delete)
 * exactly as before.
 */
const NotificationsCtx = createContext(null);

export function NotificationsProvider({ children }) {
  const { loggedIn } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loggedIn) {
      setNotifications([]);
      setUnreadCount(0);
      setLoaded(false);
      return undefined;
    }
    let live = true;
    const poll = () =>
      api('/api/notifications')
        .then((d) => {
          if (!live) return;
          setNotifications(d.notifications ?? []);
          setUnreadCount(d.unreadCount ?? 0);
          setLoaded(true);
        })
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [loggedIn]);

  async function markRead(id) {
    try {
      await api(`/api/notifications/${id}/read`, { method: 'POST', body: {} });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* the next poll resynchronises */
    }
  }

  return (
    <NotificationsCtx.Provider value={{ notifications, unreadCount, loaded, markRead }}>
      {children}
    </NotificationsCtx.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsCtx);
}
