import React, { useEffect, useState } from 'react';
import { notificationPath } from '../lib/notificationNav.js';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

export function Notifications() {
  const { t } = useLang();
  const navigate = useNavigate();
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
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  async function markRead(id) {
    await api(`/api/notifications/${id}/read`, { method: 'POST', body: {} });
    load();
  }
  async function readAll() {
    await api('/api/notifications/read-all', { method: 'POST', body: {} });
    load();
  }
  async function dismiss(id) {
    await api(`/api/notifications/${id}`, { method: 'DELETE' });
    load();
  }

  /** Click-through: open the record the notification is about, marking it read. */
  function open(n) {
    if (!n.read) markRead(n.id);
    const path = notificationPath(n);
    if (path) navigate(path);
  }

  return (
    <section>
      <h1>{t('notifications')} {unread > 0 && <span className="badge">{unread} {t('unread')}</span>}</h1>
      {unread > 0 && <button className="secondary" onClick={readAll}>{t('markAllRead')}</button>}
      {error && <div className="error">{error}</div>}
      {items.length === 0 && <p className="muted">{t('noNotifications')}</p>}
      {items.map((n) => (
        <div className="card" key={n.id} style={{ opacity: n.read ? 0.65 : 1 }}>
          <div className="row">
            <strong
              style={{ cursor: n.relatedListingId || n.relatedClaimId ? 'pointer' : 'default' }}
              onClick={() => open(n)}
            >
              {n.title}
            </strong>
            <span className="muted">{new Date(n.createdAt).toLocaleString()}</span>
            {(n.relatedListingId || n.relatedClaimId) && (
              <button className="secondary" onClick={() => open(n)}>{t('viewDetails')}</button>
            )}
            {!n.read && <button className="secondary" onClick={() => markRead(n.id)}>{t('markRead')}</button>}
            <button className="secondary" onClick={() => dismiss(n.id)}>{t('dismiss')}</button>
          </div>
          <p>{n.body}</p>
        </div>
      ))}
    </section>
  );
}
