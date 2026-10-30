import React, { useEffect, useState } from 'react';
import { resolveNotificationNavigation, guardReasonKey } from '../lib/notificationNav.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';
import { formatDistance } from '../lib/distance.js';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

export function Notifications() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { location } = useLocation();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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

  /** Click-through: mark read (existing semantics), then open the
   * record — through the shared 5 km guard for claiming roles
   * (PRD v3.21), which explains instead of navigating when blocked. */
  async function open(n) {
    if (!n.read) markRead(n.id);
    setNotice('');
    const userPos =
      location && typeof location.lat === 'number' && typeof location.lng === 'number'
        ? { lat: location.lat, lng: location.lng }
        : null;
    const res = await resolveNotificationNavigation(n, {
      role: user?.role ?? null,
      userPos,
      fetchListing: async (id) => (await api(`/api/listings/${id}`)).listing ?? null,
    });
    if (res.blocked) {
      setNotice(
        t(guardReasonKey(res.blocked)) +
          (res.blocked === 'outside-radius' && typeof res.distanceKm === 'number'
            ? ` · ${formatDistance(res.distanceKm)}`
            : ''),
      );
      return;
    }
    if (res.path) navigate(res.path);
  }

  return (
    <section>
      <h1>{t('notifications')} {unread > 0 && <span className="badge">{unread} {t('unread')}</span>}</h1>
      {unread > 0 && <button className="secondary" onClick={readAll}>{t('markAllRead')}</button>}
      {error && <div className="error">{error}</div>}
      {notice && <div className="error">🚫 {notice}</div>}
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
