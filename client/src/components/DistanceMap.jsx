import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';
import { api } from '../lib/api.js';
import { haversineKm, formatDistance } from '../lib/distance.js';

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
 * The claimer's own position comes from watchPosition and lives ONLY
 * in this component's state — no endpoint accepts claimer coordinates
 * and none are ever sent. The map is north-up; travel direction is a
 * rotating arrow on the claimer pin when the device reports a heading
 * (stationary devices report none, and the plain pin is the fallback).
 * Distances are Haversine straight-line and are labelled as such —
 * this is not road routing and claims no turn-by-turn navigation.
 */
const DONOR_POLL_MS = 10_000;
const MOVE_UPDATE_M = 5;
const HEADING_UPDATE_DEG = 5;

export function DistanceMap({ claimId, listing }) {
  const { t } = useLang();
  const { location } = useLocation();
  const savedPos =
    location && typeof location.lat === 'number' && typeof location.lng === 'number'
      ? { lat: location.lat, lng: location.lng }
      : null;
  const [myPos, setMyPos] = useState(savedPos);
  const [heading, setHeading] = useState(null);
  const [watchWanted, setWatchWanted] = useState(Boolean(savedPos));
  const [locating, setLocating] = useState(false);
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
  const myPosRef = useRef(savedPos);
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

  // ── Claimer watchPosition (device-only; never transmitted) ─────────
  useEffect(() => {
    if (!watchWanted || watchIdRef.current !== null || !navigator.geolocation) return undefined;
    setLocating(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocating(false);
        setGeoError('');
        const { latitude: lat, longitude: lng, heading: h } = pos.coords;
        const cur = myPosRef.current;
        if (!cur || haversineKm(cur.lat, cur.lng, lat, lng) * 1000 >= MOVE_UPDATE_M) {
          myPosRef.current = { lat, lng };
          setMyPos({ lat, lng });
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchWanted]);

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
      mapRef.current?.remove();
      mapRef.current = null;
      youRef.current = null;
      destRef.current = null;
      lineRef.current = null;
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

  const donorTime = donorLive?.updatedAt ? new Date(donorLive.updatedAt).toLocaleTimeString() : '';

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ margin: '0 0 2px', fontWeight: 600 }}>
        {t('distanceToPickup')}: {km !== null ? `${formatDistance(km)} ${t('away')} · ${t('straightLine')}` : '—'}
      </p>
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
            onClick={() => setWatchWanted(true)}
            disabled={locating || watchWanted}
          >
            📍 {locating ? t('locating') : t('useMyLocation')}
          </button>
          {geoError && <p className="error" style={{ margin: '8px 0 0' }}>{geoError}</p>}
        </div>
      )}
      <div
        ref={mapDivRef}
        style={{
          height: 260, borderRadius: 10, border: '1px solid #d9e8d2',
          overflow: 'hidden', background: '#eef3ea', position: 'relative', zIndex: 0,
        }}
      />
      {myPos && (
        <div className="row" style={{ marginTop: 6, alignItems: 'center' }}>
          <button type="button" className="secondary" onClick={() => setWatchWanted(true)} disabled={watchWanted && !geoError}>
            📍 {t('useMyLocation')}
          </button>
          {geoError && <span className="error">{geoError}</span>}
        </div>
      )}
      {tilesFailed && (
        <p className="muted" style={{ marginTop: 4 }}>⚠ {t('tilesFailed')}</p>
      )}
    </div>
  );
}
