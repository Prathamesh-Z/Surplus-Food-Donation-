import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { useNotifications } from '../lib/NotificationsContext.jsx';
import { resolveNotificationNavigation, guardReasonKey } from '../lib/notificationNav.js';
import { api } from '../lib/api.js';
import { useLocation } from '../location/LocationContext.jsx';
import { formatDistance } from '../lib/distance.js';

/**
 * Notification banners (PRD v3.17, batch F3).
 *
 * Reads the shared notifications poll (NotificationsContext) — no
 * poller of its own. Rules:
 * - Baseline: the first loaded fetch defines "existing"; nothing in
 *   it ever banners, so login/refresh/remount cannot flood the user
 *   with old unread items.
 * - Detection is by notification ID (never timestamps): an unread
 *   notification whose ID is in neither the baseline nor the shown
 *   set is new. Once bannered, an ID stays in the shown set for the
 *   session, so repeat polls and re-renders can never duplicate it.
 * - At most 3 visible; the rest queue in arrival order and surface
 *   as slots free. Each visible banner auto-dismisses after ~12 s
 *   (its own timer, cleaned up on unmount/removal).
 * - Click: mark read via the shared handler + navigate with the same
 *   mapping as the Notifications page. The × button dismisses ONLY
 *   the banner — the notification stays unread on the server.
 * - Everything resets when the signed-in user changes.
 */
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 12_000;

function BannerItem({ n, onOpen, onDismiss }) {
  const { t } = useLang();
  useEffect(() => {
    const id = setTimeout(() => onDismiss(n.id), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(n);
      }}
      style={{
        background: '#fff', border: '1px solid #b9d3ac', borderLeft: '4px solid var(--green-600, #2e7d32)',
        borderRadius: 10, boxShadow: '0 6px 20px rgba(20,35,18,0.22)',
        padding: '10px 12px', cursor: 'pointer', pointerEvents: 'auto',
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>{n.notice ? n.title : `🔔 ${n.title}`}</strong>
        <button
          type="button"
          className="secondary"
          aria-label={t('close')}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(n.id);
          }}
          style={{ padding: '0 7px', lineHeight: 1.6, flexShrink: 0 }}
        >
          ×
        </button>
      </div>
      <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{n.body}</p>
    </div>
  );
}

export function NotificationBanners() {
  const { notifications, loaded, markRead } = useNotifications();
  const { user } = useAuth();
  const { location } = useLocation();
  const { t } = useLang();
  const navigate = useNavigate();
  const [notices, setNotices] = useState([]);
  const baselineRef = useRef(null);
  const shownRef = useRef(new Set());
  const queueRef = useRef([]);
  const [visible, setVisible] = useState([]);
  const [, setQueueTick] = useState(0);
  const userId = user?.id ?? null;

  // Reset everything when the signed-in user changes (incl. logout).
  useEffect(() => {
    baselineRef.current = null;
    shownRef.current = new Set();
    queueRef.current = [];
    setVisible([]);
  }, [userId]);

  // Baseline + new-arrival detection, by ID.
  useEffect(() => {
    if (!loaded || !userId) return;
    if (baselineRef.current === null) {
      baselineRef.current = new Set(notifications.map((n) => n.id));
      return;
    }
    const fresh = notifications
      .filter((n) => !n.read && !baselineRef.current.has(n.id) && !shownRef.current.has(n.id))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (fresh.length === 0) return;
    for (const n of fresh) {
      shownRef.current.add(n.id);
      baselineRef.current.add(n.id);
      queueRef.current.push(n);
    }
    setQueueTick((x) => x + 1);
  }, [notifications, loaded, userId]);

  // Pump the queue into free visible slots.
  useEffect(() => {
    if (visible.length < MAX_VISIBLE && queueRef.current.length > 0) {
      const take = queueRef.current.splice(0, MAX_VISIBLE - visible.length);
      if (take.length > 0) setVisible((v) => [...v, ...take]);
    }
  }, [visible, notifications]);

  function dismiss(id) {
    setVisible((v) => v.filter((n) => n.id !== id));
  }

  // Click-through (v3.21): mark read exactly as before, then resolve
  // through the shared radius guard — a blocked click dismisses the
  // banner and explains itself in a notice instead of navigating.
  async function open(n) {
    if (!n.read) markRead(n.id);
    dismiss(n.id);
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
      const body =
        t(guardReasonKey(res.blocked)) +
        (res.blocked === 'outside-radius' && typeof res.distanceKm === 'number'
          ? ` · ${formatDistance(res.distanceKm)}`
          : '');
      setNotices((prev) => [
        ...prev,
        { id: `guard-${Date.now()}`, notice: true, title: `🚫 ${t('guardTitle')}`, body },
      ]);
      return;
    }
    if (res.path) navigate(res.path);
  }

  function dismissNotice(id) {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }

  if (visible.length === 0 && notices.length === 0) return null;
  return (
    <div
      style={{
        position: 'fixed', top: 70, right: 12, left: 12, zIndex: 900,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 380, marginLeft: 'auto', pointerEvents: 'none',
      }}
    >
      {notices.map((n) => (
        <BannerItem key={n.id} n={n} onOpen={() => dismissNotice(n.id)} onDismiss={dismissNotice} />
      ))}
      {visible.map((n) => (
        <BannerItem key={n.id} n={n} onOpen={open} onDismiss={dismiss} />
      ))}
    </div>
  );
}
