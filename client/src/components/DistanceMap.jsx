import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';
import { api } from '../lib/api.js';
import { haversineKm, formatDistance } from '../lib/distance.js';
import {
  routeUrl, parseRouteResponse, shouldRequestRoute, msUntilRouteAllowed,
  formatDuration, ROUTE_TIMEOUT_MS, googleMapsDirectionsUrl,
} from '../lib/routing.js';
import { buildRouteDiagnostics } from '../lib/routing.js';
import { accuracyBand } from '../lib/location.js';

/**
 * Pickup map for a CONFIRMED claim (PRD v3.12 static map, extended by
 * PRD v3.13 live tracking).
 *
 * Destination: the donor's LIVE point while they share (polled every
 * 10 s from the claim-scoped endpoint); otherwise the listing's static
 * pickup coordinates, labelled as the pickup point. A stale donor
 * point is drawn grey and labelled with its last-update time — never
 * presented as live.
 *
 * The claimer's distance origin (v3.20, batch F8) is the SAVED
 * location by default — the same origin Browse and ListingDetail
 * use. Live GPS is an explicit, temporary alternative the user
 * switches on here; the watcher never starts on its own, switching
 * back restores the saved origin instantly, and the saved record is
 * never modified by watching. Live positions live ONLY in this
 * component's state — no endpoint accepts claimer coordinates and
 * none are ever sent. The map is north-up; travel direction is a
 * rotating arrow on the claimer pin when the device reports a heading
 * (stationary devices report none, and the plain pin is the fallback).
 * The headline distance is the Haversine straight-line, labelled as
 * such. Since v3.19 the map additionally draws a real walking or
 * bicycle ROAD route (FOSSGIS routing.openstreetmap.de) from the
 * claimer to the route destination — fresh live donor point, else
 * the static pickup point — with the provider's own distance and
 * duration. Route guidance only: no turn-by-turn navigation. When
 * routing fails, the route line is dropped and the labelled
 * straight-line remains. Route requests are change-gated (>= 50 m
 * endpoint movement or a mode switch) and spaced to respect the
 * public service's ~1 request/second limit.
 */
const DONOR_POLL_MS = 10_000;
const MOVE_UPDATE_M = 5;
const HEADING_UPDATE_DEG = 5;

// ── DEV-only routing diagnostics (audit Fix 4) ─────────────────────
// In production import.meta.env.DEV is false and the recorder returns
// before doing anything: no console output, no window object, nothing
// persisted or transmitted. Records hold REQUEST-TIME descriptor
// values, never later component state, and stay in this browser only.
const routeDebugStore = { foot: null, bike: null };
function recordRouteDiagnostics(next, result) {
  if (!import.meta.env.DEV) return;
  const record = buildRouteDiagnostics(
    { mode: next.mode, from: { lat: next.oLat, lng: next.oLng }, to: { lat: next.dLat, lng: next.dLng } },
    result,
  );
  routeDebugStore[next.mode] = record;
  window.__FWS_ROUTE_DEBUG__ = routeDebugStore;
  console.debug('[FWS route]', record);
}

export function DistanceMap({ claimId, listing, minimal = false }) {
  const { t } = useLang();
  const { location } = useLocation();
  const savedPos =
    location && typeof location.lat === 'number' && typeof location.lng === 'number'
      ? { lat: location.lat, lng: location.lng }
      : null;
  // Origin model (v3.20): 'saved' (default, the LocationContext
  // record) or 'live' (explicit opt-in GPS watch). myPos is DERIVED —
  // live wins only while Live GPS is selected AND has a fix; a failed
  // or pending watch falls back to the saved origin, never to nothing
  // the user didn't choose.
  const [originMode, setOriginMode] = useState('saved');
  const [livePos, setLivePos] = useState(null);
  // Device-reported accuracy (metres) of the latest live fix — audit
  // Fix 2. Updated on EVERY watch callback, independent of the 5 m
  // position gate; never persisted, never transmitted.
  const [liveAccuracy, setLiveAccuracy] = useState(null);
  const [heading, setHeading] = useState(null);
  const [locating, setLocating] = useState(false);
  const myPos = originMode === 'live' && livePos ? livePos : savedPos;
  const [geoError, setGeoError] = useState('');
  const [donorLive, setDonorLive] = useState(null);
  const [netDown, setNetDown] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const mapDivRef = useRef(null);
  const LRef = useRef(null);
  const mapRef = useRef(null);
  const youRef = useRef(null);
  const destRef = useRef(null);
  const lineRef = useRef(null);
  const watchIdRef = useRef(null);
  const livePosRef = useRef(null);
  const headingRef = useRef(null);
  const fitKeyRef = useRef('');

  const pickupPoint =
    typeof listing.pickupLat === 'number' && typeof listing.pickupLng === 'number'
      ? { lat: listing.pickupLat, lng: listing.pickupLng }
      : null;
  const donorPoint =
    donorLive && (donorLive.state === 'live' || donorLive.state === 'stale')
      ? { lat: donorLive.lat, lng: donorLive.lng }
      : null;
  const dest = donorPoint ?? pickupPoint;
  const destKind = donorPoint ? donorLive.state : 'pickup';
  const km = myPos && dest ? haversineKm(myPos.lat, myPos.lng, dest.lat, dest.lng) : null;
  // Route destination (v3.19): the donor's LIVE point only while it is
  // fresh; stale/stopped/waiting sharing routes to the static pickup
  // point instead (the marker above still shows the stale point grey,
  // exactly as before — only the route target differs).
  const routeDest = donorLive?.state === 'live' ? donorPoint : pickupPoint;

  // ── Routing (v3.19, batch F2) ─────────────────────────────────────
  const [mode, setMode] = useState('foot');
  const [route, setRoute] = useState(null);
  const [routeStatus, setRouteStatus] = useState('idle');
  const routeLineRef = useRef(null);
  const routeReqRef = useRef(null);
  const routeSeqRef = useRef(0);
  const routeAbortRef = useRef(null);
  const routeTimerRef = useRef(null);
  const lastFetchAtRef = useRef(0);

  // ── Claimer watchPosition: ONLY while Live GPS is explicitly
  // selected (v3.20). Device-only; never transmitted, never saved. ──
  useEffect(() => {
    if (originMode !== 'live' || !navigator.geolocation) return undefined;
    setLocating(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocating(false);
        setGeoError('');
        const { latitude: lat, longitude: lng, heading: h, accuracy: acc } = pos.coords;
        setLiveAccuracy(typeof acc === 'number' && !Number.isNaN(acc) && acc >= 0 ? acc : null);
        const cur = livePosRef.current;
        if (!cur || haversineKm(cur.lat, cur.lng, lat, lng) * 1000 >= MOVE_UPDATE_M) {
          livePosRef.current = { lat, lng };
          setLivePos({ lat, lng });
        }
        if (typeof h === 'number' && !Number.isNaN(h)) {
          if (headingRef.current === null || Math.abs(h - headingRef.current) >= HEADING_UPDATE_DEG) {
            headingRef.current = h;
            setHeading(h);
          }
        } else if (headingRef.current !== null) {
          headingRef.current = null;
          setHeading(null);
        }
      },
      () => {
        setLocating(false);
        setGeoError(t('locationNeeded'));
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      headingRef.current = null;
      setHeading(null);
      setLiveAccuracy(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originMode]);

  // ── Donor live point: claim-scoped poll while mounted ──────────────
  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        const d = await api(`/api/claims/${claimId}/location`);
        if (!live) return;
        setDonorLive(d);
        setNetDown(false);
      } catch {
        if (live) setNetDown(true);
      }
    }
    poll();
    const iv = setInterval(poll, DONOR_POLL_MS);
    return () => {
      live = false;
      clearInterval(iv);
    };
  }, [claimId]);

  async function fireRoute(next, seq) {
    routeAbortRef.current?.abort();
    const ac = new AbortController();
    routeAbortRef.current = ac;
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, ROUTE_TIMEOUT_MS);
    lastFetchAtRef.current = Date.now();
    setRouteStatus('loading');
    try {
      const res = await fetch(
        routeUrl(next.mode, { lat: next.oLat, lng: next.oLng }, { lat: next.dLat, lng: next.dLng }),
        { signal: ac.signal },
      );
      const json = await res.json();
      if (seq !== routeSeqRef.current) return; // a newer request owns the map now
      const parsed = parseRouteResponse(json);
      if (!parsed) {
        recordRouteDiagnostics(next, { ok: false, failure: 'bad-response' });
        setRoute(null);
        setRouteStatus('unavailable');
        return;
      }
      recordRouteDiagnostics(next, { ok: true, parsed });
      setRoute({ ...parsed, mode: next.mode });
      setRouteStatus('ok');
    } catch {
      if (seq !== routeSeqRef.current) return;
      if (!timedOut && routeAbortRef.current !== ac) return; // superseded abort
      recordRouteDiagnostics(next, { ok: false, failure: timedOut ? 'timeout' : 'network' });
      setRoute(null);
      setRouteStatus('unavailable');
    } finally {
      clearTimeout(killer);
    }
  }

  // Change-gated route requests: mode switch, or either endpoint moved
  // >= 50 m from the last issued request. Repeat 10 s donor polls with
  // unchanged coordinates never re-request. Scheduling honours the
  // provider spacing; the latest descriptor wins.
  useEffect(() => {
    if (!myPos || !routeDest) {
      setRoute(null);
      setRouteStatus('idle');
      return undefined;
    }
    const next = { mode, oLat: myPos.lat, oLng: myPos.lng, dLat: routeDest.lat, dLng: routeDest.lng };
    if (!shouldRequestRoute(routeReqRef.current, next)) return undefined;
    routeReqRef.current = next;
    const seq = ++routeSeqRef.current;
    const wait = msUntilRouteAllowed(lastFetchAtRef.current, Date.now());
    clearTimeout(routeTimerRef.current);
    routeTimerRef.current = setTimeout(() => fireRoute(next, seq), wait);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, myPos, routeDest]);

  // Route polyline on the existing map instance; refit once per route.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    if (route?.coords?.length >= 2) {
      routeLineRef.current = L.polyline(route.coords, { color: '#1565c0', weight: 5, opacity: 0.85 }).addTo(map);
      map.fitBounds(L.latLngBounds(route.coords), { padding: [36, 36] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, mapReady]);

  // ── Leaflet: init once a destination exists ────────────────────────
  useEffect(() => {
    if (!dest || !mapDivRef.current || mapRef.current) return undefined;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !mapDivRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(mapDivRef.current, { scrollWheelZoom: false });
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      });
      let errors = 0;
      tiles.on('tileerror', () => {
        errors += 1;
        if (errors >= 3) setTilesFailed(true);
      });
      tiles.addTo(map);
      mapRef.current = map;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest !== null]);

  // ── Markers + line: cheap in-place updates, no map re-creation ─────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map || !dest) return;
    const pin = (emoji, label, border, extra = '') =>
      L.divIcon({
        className: 'fws-pin',
        html:
          `<div style="display:inline-block;transform:translate(-50%,-110%);white-space:nowrap;` +
          `background:#fff;border:1px solid ${border};border-radius:999px;padding:2px 8px;` +
          `font-size:12px;font-weight:600;color:#1d3a1a;box-shadow:0 1px 4px rgba(0,0,0,.3)">${emoji} ${extra}${label}</div>`,
        iconSize: [0, 0],
      });
    const destBorder = destKind === 'stale' ? '#9e9e9e' : '#2e7d32';
    const destLabel = destKind === 'pickup' ? t('pickupPoint') : t('donorLocation');
    const destEmoji = destKind === 'stale' ? '⏳' : '📍';
    if (!destRef.current) {
      destRef.current = L.marker([dest.lat, dest.lng], { icon: pin(destEmoji, destLabel, destBorder) }).addTo(map);
    } else {
      destRef.current.setLatLng([dest.lat, dest.lng]);
      destRef.current.setIcon(pin(destEmoji, destLabel, destBorder));
    }
    if (myPos) {
      const arrow =
        typeof heading === 'number'
          ? `<span style="display:inline-block;transform:rotate(${heading - 90}deg);font-size:11px">➤</span> `
          : '';
      if (!youRef.current) {
        youRef.current = L.marker([myPos.lat, myPos.lng], { icon: pin('🧭', t('yourLocation'), '#1565c0', arrow) }).addTo(map);
      } else {
        youRef.current.setLatLng([myPos.lat, myPos.lng]);
        youRef.current.setIcon(pin('🧭', t('yourLocation'), '#1565c0', arrow));
      }
      const latlngs = [
        [myPos.lat, myPos.lng],
        [dest.lat, dest.lng],
      ];
      if (!lineRef.current) {
        lineRef.current = L.polyline(latlngs, { color: '#2e7d32', weight: 3, dashArray: '6 6' }).addTo(map);
      } else {
        lineRef.current.setLatLngs(latlngs);
      }
      // Refit only when the destination identity/kind changes — never
      // just because the claimer moved (that would fight the user).
      const key = `${destKind}:${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
      if (fitKeyRef.current !== key) {
        fitKeyRef.current = key;
        map.fitBounds(L.latLngBounds(latlngs), { padding: [36, 36] });
      }
    } else {
      const key = `dest-only:${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
      if (fitKeyRef.current !== key) {
        fitKeyRef.current = key;
        map.setView([dest.lat, dest.lng], 15);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, dest, destKind, myPos, heading]);

  useEffect(
    () => () => {
      clearTimeout(routeTimerRef.current);
      routeAbortRef.current?.abort();
      mapRef.current?.remove();
      mapRef.current = null;
      youRef.current = null;
      destRef.current = null;
      lineRef.current = null;
      routeLineRef.current = null;
    },
    [],
  );

  if (!dest) {
    return (
      <div
        style={{
          marginTop: 12, border: '1px dashed #c9d6c3', borderRadius: 10,
          padding: '10px 12px', background: '#f7faf5',
        }}
      >
        <p className="muted" style={{ margin: 0 }}>
          🗺️ {donorLive ? t('mapUnavailable') : t('locating')}
        </p>
      </div>
    );
  }

  // Google Maps handoff: strictly the app's selected origin (myPos —
  // saved record, or Live GPS only when explicitly selected) and the
  // routing destination (routeDest — fresh donor live point, else the
  // static pickup coordinates; never the stale-inclusive marker dest).
  const directionsUrl = googleMapsDirectionsUrl({ from: myPos, to: routeDest, mode });

  const donorTime = donorLive?.updatedAt ? new Date(donorLive.updatedAt).toLocaleTimeString() : '';

  return (
    <div style={{ marginTop: 12 }}>
      {/* Minimal mode (My Claims card): every text/control block above the
          map is presentation only — the positions, donor polling and
          routing underneath keep running unchanged. */}
      {!minimal && (<>
      <p className="muted" style={{ margin: '0 0 6px' }}>📍 {listing.pickupLocationText}</p>
      {donorLive?.state === 'live' && (
        <p className="success" style={{ margin: '0 0 6px' }}>
          ● {t('liveLabel')} · {t('donorLocation')} · {t('lastUpdated')} {donorTime}
        </p>
      )}
      {donorLive?.state === 'stale' && (
        <p className="muted" style={{ margin: '0 0 6px' }}>
          ⏳ {t('staleLabel')} · {t('donorLocation')} · {t('lastUpdated')} {donorTime}
        </p>
      )}
      {donorLive?.state === 'waiting' && (
        <p className="muted" style={{ margin: '0 0 6px' }}>{t('waitingForDonor')}</p>
      )}
      {donorLive?.state === 'stopped' && (
        <p className="muted" style={{ margin: '0 0 6px' }}>{t('donorStoppedSharing')}</p>
      )}
      {netDown && (
        <p className="error" style={{ margin: '0 0 6px' }}>{t('connectionLost')}</p>
      )}
      <p style={{ margin: '0 0 2px', fontWeight: 600 }}>
        {t('distanceToPickup')}: {km !== null ? `${formatDistance(km)} ${t('away')} · ${t('straightLine')}` : '—'}
      </p>
      {myPos && routeDest && (
        <div style={{ margin: '2px 0 6px' }}>
          <div className="row" role="group" aria-label={t('travelMode')} style={{ gap: 6 }}>
            <button
              type="button"
              className={mode === 'foot' ? undefined : 'secondary'}
              aria-pressed={mode === 'foot'}
              onClick={() => setMode('foot')}
            >
              🚶 {t('modeWalking')}
            </button>
            <button
              type="button"
              className={mode === 'bike' ? undefined : 'secondary'}
              aria-pressed={mode === 'bike'}
              onClick={() => setMode('bike')}
            >
              🚴 {t('modeBicycle')}
            </button>
            {routeStatus === 'loading' && <span className="muted">{t('routeLoading')}</span>}
          </div>
          {routeStatus === 'ok' && route && (
            <p style={{ margin: '4px 0 0', fontWeight: 600, color: '#1565c0' }}>
              {route.mode === 'foot' ? '🚶' : '🚴'} {route.mode === 'foot' ? t('modeWalking') : t('modeBicycle')}
              {' · '}{formatDistance(route.distanceKm)}{' · '}⏱ {formatDuration(route.durationSec)}
            </p>
          )}
          {routeStatus === 'unavailable' && (
            <p className="muted" style={{ margin: '4px 0 0' }}>⚠ {t('routeUnavailable')}</p>
          )}
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{t('routingAttribution')}</p>
        </div>
      )}
      {!myPos && (
        <div
          style={{
            border: '1px dashed #c9d6c3', borderRadius: 10,
            padding: '10px 12px', background: '#f7faf5', marginBottom: 8,
          }}
        >
          <p className="muted" style={{ margin: '0 0 8px' }}>{t('locationNeeded')}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setOriginMode('live')}
            disabled={locating}
          >
            📍 {locating ? t('locating') : t('originLiveGps')}
          </button>
          {geoError && <p className="error" style={{ margin: '8px 0 0' }}>{geoError}</p>}
        </div>
      )}
      <div className="row" style={{ margin: '6px 0', alignItems: 'center' }} role="group" aria-label={t('distanceFrom')}>
        <span className="muted">{t('distanceFrom')}:</span>
        <button
          type="button"
          className={originMode === 'saved' ? undefined : 'secondary'}
          aria-pressed={originMode === 'saved'}
          onClick={() => setOriginMode('saved')}
          disabled={!savedPos}
        >
          📍 {t('originSaved')}
        </button>
        <button
          type="button"
          className={originMode === 'live' ? undefined : 'secondary'}
          aria-pressed={originMode === 'live'}
          onClick={() => setOriginMode('live')}
        >
          🛰️ {t('originLiveGps')}
        </button>
        {originMode === 'live' && locating && <span className="muted">{t('locating')}</span>}
        {originMode === 'live' && geoError && <span className="error">{geoError}</span>}
      </div>
      {originMode === 'live' && livePos && liveAccuracy !== null && (
        <p className="muted" style={{ margin: '4px 0' }}>
          {t('gpsAccuracy')} {Math.round(liveAccuracy).toLocaleString()} m
        </p>
      )}
      {originMode === 'live' && livePos && liveAccuracy !== null && accuracyBand(liveAccuracy) === 'poor' && (
        <p className="error" style={{ margin: '4px 0' }}>⚠ {t('liveGpsPoor')}</p>
      )}
      </>)}
      <div
        ref={mapDivRef}
        style={{
          height: 'clamp(220px, 45vh, 340px)', borderRadius: 10, border: '1px solid #d9e8d2',
          overflow: 'hidden', background: '#eef3ea', position: 'relative', zIndex: 0,
        }}
      />
      {directionsUrl && (
        <>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block', marginTop: 8, padding: '8px 16px',
              background: '#2e7d32', color: '#fff', borderRadius: 8,
              textDecoration: 'none', fontWeight: 600,
            }}
          >
            🧭 {t('getDirections')}
          </a>
          {!minimal && (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{t('directionsPrivacy')}</p>
          )}
        </>
      )}
      {tilesFailed && (
        <p className="muted" style={{ marginTop: 4 }}>⚠ {t('tilesFailed')}</p>
      )}
    </div>
  );
}
