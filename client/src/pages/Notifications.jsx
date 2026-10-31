import React, { useEffect, useRef, useState } from 'react';
import { resolveNotificationNavigation, guardReasonKey } from '../lib/notificationNav.js';
import { swipeAxis, swipeReleaseVerdict } from '../lib/swipe.js';
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

  // Swipe-to-dismiss (PRD v3.26): pointer drag on a card. The pure
  // axis/verdict rules live in lib/swipe.js — vertical-dominant drags
  // are scrolling and never dismiss; a horizontal drag dismisses only
  // past the threshold. Any horizontal swipe suppresses the trailing
  // click so a dismissal (or snap-back) never also opens details.
  const dragRef = useRef(null);
  const suppressClickRef = useRef(0);
  const [drag, setDrag] = useState(null);

  function onCardPointerDown(e, n) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragRef.current = { id: n.id, startX: e.clientX, startY: e.clientY, axis: null };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
  }
  function onCardPointerMove(e, n) {
    const d = dragRef.current;
    if (!d || d.id !== n.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.axis === null) d.axis = swipeAxis(dx, dy);
    if (d.axis === 'horizontal') {
      setDrag({ id: n.id, dx });
    } else if (d.axis === 'vertical') {
      dragRef.current = null;
      setDrag(null);
    }
  }
  function onCardPointerUp(e, n) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.id !== n.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setDrag(null);
    if (swipeAxis(dx, dy) === 'horizontal') suppressClickRef.current = n.id;
    if (swipeReleaseVerdict(dx, dy) === 'dismiss') dismiss(n.id);
  }
  function onCardPointerCancel() {
    dragRef.current = null;
    setDrag(null);
  }
  function onCardClick(n) {
    if (suppressClickRef.current === n.id) {
      suppressClickRef.current = 0;
      return;
    }
    if (n.relatedListingId || n.relatedClaimId) open(n);
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
      {items.map((n) => {
        const linked = Boolean(n.relatedListingId || n.relatedClaimId);
        const dragDx = drag && drag.id === n.id ? drag.dx : 0;
        return (
          <div
            className="card swipeCard"
            key={n.id}
            style={{
              opacity: n.read ? 0.65 : 1,
              cursor: linked ? 'pointer' : 'default',
              transform: dragDx ? `translateX(${dragDx}px)` : undefined,
              transition: dragDx ? 'none' : undefined,
            }}
            onClick={() => onCardClick(n)}
            onPointerDown={(e) => onCardPointerDown(e, n)}
            onPointerMove={(e) => onCardPointerMove(e, n)}
            onPointerUp={(e) => onCardPointerUp(e, n)}
            onPointerCancel={onCardPointerCancel}
          >
            <div className="row">
              <strong>{n.title}</strong>
              <span className="muted">{new Date(n.createdAt).toLocaleString()}</span>
              <button
                type="button"
                className="closeBtn"
                aria-label={t('dismissNotification')}
                title={t('dismissNotification')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
              >
                ×
              </button>
            </div>
            <p>{n.body}</p>
          </div>
        );
      })}
    </section>
  );
}
