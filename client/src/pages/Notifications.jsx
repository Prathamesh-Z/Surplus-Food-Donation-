import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export function Notifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await api('/api/notifications');
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
    // PRD FR-14: notifications are in-app and polled — no real-time push.
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function markRead(id) {
    await api(`/api/notifications/${id}/read`, { method: 'POST', body: {} });
    load();
  }
  async function readAll() {
    await api('/api/notifications/read-all', { method: 'POST', body: {} });
    load();
  }

  return (
    <section>
      <h1>Notifications {unread > 0 && <span className="badge">{unread} unread</span>}</h1>
      {unread > 0 && <button className="secondary" onClick={readAll}>Mark all read</button>}
      {error && <div className="error">{error}</div>}
      {items.length === 0 && <p className="muted">No notifications yet.</p>}
      {items.map((n) => (
        <div className="card" key={n.id} style={{ opacity: n.read ? 0.65 : 1 }}>
          <div className="row">
            <strong>{n.title}</strong>
            <span className="muted">{new Date(n.createdAt).toLocaleString()}</span>
            {!n.read && <button className="secondary" onClick={() => markRead(n.id)}>Mark read</button>}
          </div>
          <p>{n.body}</p>
        </div>
      ))}
    </section>
  );
}
