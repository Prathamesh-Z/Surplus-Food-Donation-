import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { haversineKm } from '../lib/distance.js';
import { MapPinIcon } from './icons.jsx';

/**
 * Donor-side live location sharing (PRD v3.13), one control per
 * CONFIRMED claim in My Listings.
 *
 * Publishing discipline:
 * - watchPosition with a single watcher (a ref guards re-renders and
 *   StrictMode double-mounts from ever creating a second one);
 * - a fix is published when the donor moved ≥ 25 m, and a 20-second
 *   heartbeat re-publishes the latest fix so the point stays "live"
 *   (the server's stale threshold is 60 s);
 * - stopping clears the watch and tells the server, which nulls the
 *   stored coordinates — nothing keeps being published after the donor
 *   leaves this screen (unmount clears the watch immediately and
 *   makes a best-effort stop call; the 60 s stale window covers a
 *   browser that dies before the call lands);
 * - after a page refresh the control asks the server whether sharing
 *   is active and, if so, restores the sharing state and the watch.
 */
const PUBLISH_MOVE_M = 25;
const HEARTBEAT_MS = 20_000;

export function LiveShareControl({ claimId }) {
  const { t } = useLang();
  const [sharing, setSharing] = useState(false);
  const [lastShared, setLastShared] = useState(null);
  const [error, setError] = useState('');
  const watchIdRef = useRef(null);
  const latestPosRef = useRef(null);
  const lastSentRef = useRef(null);
  const sharingRef = useRef(false);

  async function send(lat, lng) {
    try {
      const res = await api(`/api/claims/${claimId}/location`, {
        method: 'POST',
        body: { lat, lng },
      });
      lastSentRef.current = { lat, lng, time: Date.now() };
      setLastShared(res.updatedAt ?? new Date().toISOString());
    } catch (err) {
      if (err.status === 409) {
        // The claim is no longer CONFIRMED — sharing is over.
        stopWatchOnly();
        sharingRef.current = false;
        setSharing(false);
      }
      // Other failures are retried by the next movement/heartbeat.
    }
  }

  function stopWatchOnly() {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }

  function startWatch() {
    if (watchIdRef.current !== null) return; // never two watchers
    if (!navigator.geolocation) {
      setError(t('shareLocationDenied'));
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        latestPosRef.current = { lat, lng };
        const last = lastSentRef.current;
        const movedM = last ? haversineKm(last.lat, last.lng, lat, lng) * 1000 : Infinity;
        if (!last || movedM >= PUBLISH_MOVE_M || Date.now() - last.time >= HEARTBEAT_MS) {
          send(lat, lng);
        }
      },
      () => {
        // Permission revoked or position unavailable mid-share: stop
        // cleanly on both sides rather than pretending to share.
        stopWatchOnly();
        sharingRef.current = false;
        setSharing(false);
        setError(t('shareLocationDenied'));
        api(`/api/claims/${claimId}/location`, { method: 'DELETE' }).catch(() => {});
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  function startSharing() {
    setError('');
    sharingRef.current = true;
    setSharing(true);
    startWatch();
  }

  async function stopSharing() {
    stopWatchOnly();
    sharingRef.current = false;
    setSharing(false);
    lastSentRef.current = null;
    try {
      await api(`/api/claims/${claimId}/location`, { method: 'DELETE' });
    } catch {
      /* the stale window covers a stop that could not be delivered */
    }
  }

  // Restore after refresh: server truth decides the initial state.
  useEffect(() => {
    let live = true;
    api(`/api/claims/${claimId}/location`)
      .then((d) => {
        if (!live) return;
        if (d.state === 'live' || d.state === 'stale') {
          sharingRef.current = true;
          setSharing(true);
          setLastShared(d.updatedAt);
          startWatch();
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId]);

  // Heartbeat: re-publish the latest fix every 20 s while sharing.
  useEffect(() => {
    if (!sharing) return undefined;
    const iv = setInterval(() => {
      const p = latestPosRef.current;
      if (p) send(p.lat, p.lng);
    }, HEARTBEAT_MS);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, claimId]);

  // Leaving the screen: stop publishing at once; best-effort server stop.
  useEffect(
    () => () => {
      stopWatchOnly();
      if (sharingRef.current) {
        api(`/api/claims/${claimId}/location`, { method: 'DELETE' }).catch(() => {});
        sharingRef.current = false;
      }
    },
    [claimId],
  );

  if (!sharing) {
    return (
      <span>
        <button type="button" className="secondary" onClick={startSharing}>
          <MapPinIcon size={15} /> {t('shareLiveLocation')}
        </button>
        {error && (
          <span className="error" style={{ marginLeft: 8 }}>
            {error}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
      <span className="success">
        ● {t('sharingLive')}
        {lastShared ? ` · ${t('lastShared')} ${new Date(lastShared).toLocaleTimeString()}` : ''}
      </span>
      <button type="button" className="secondary" onClick={stopSharing}>
        {t('stopSharing')}
      </button>
      {error && <span className="error">{error}</span>}
    </span>
  );
}
