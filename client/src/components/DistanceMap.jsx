import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';
import { listingDistanceKm, formatDistance } from '../lib/distance.js';

/**
 * Distance-to-pickup map (PRD v3.12), shown on CONFIRMED claims in
 * My Claims. The claimer's position comes from the app's saved location
 * (captured earlier with permission) or a fresh Geolocation request —
 * either way it lives ONLY in this component's state: it is never sent
 * to the server and never persisted by this component. The destination
 * is the listing's stored pickup coordinates.
 *
 * Leaflet is imported dynamically so it loads only when a claimer opens
 * My Claims. If map tiles cannot load (offline), the markers and route
 * line still draw over a plain background and the locally computed
 * distance remains correct.
 */
export function DistanceMap({ listing }) {
  const { t } = useLang();
  const { location } = useLocation();
  const savedPos =
    location && typeof location.lat === 'number' && typeof location.lng === 'number'
      ? { lat: location.lat, lng: location.lng }
      : null;
  const [myPos, setMyPos] = useState(savedPos);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [tilesFailed, setTilesFailed] = useState(false);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);

  const hasDest = typeof listing.pickupLat === 'number' && typeof listing.pickupLng === 'number';
  const km = myPos && hasDest ? listingDistanceKm(myPos, listing) : null;

  function locate() {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError(t('locationNeeded'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // Component state only — never transmitted, never stored here.
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // Denied, timed out, or position unavailable: one honest message,
        // the rest of the pickup details stay fully usable.
        setLocating(false);
        setGeoError(t('locationNeeded'));
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  // Create the map once both points are known; refresh markers/line when
  // the position changes. Depends only on primitive values, so My Claims'
  // 15 s polling re-renders do NOT reset the map or re-ask geolocation.
  useEffect(() => {
    if (!hasDest || !myPos || !mapDivRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !mapDivRef.current) return;
      if (!mapRef.current) {
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
        layersRef.current = L.layerGroup().addTo(map);
      }
      const pin = (emoji, label) =>
        L.divIcon({
          className: 'fws-pin',
          html:
            `<div style="display:inline-block;transform:translate(-50%,-110%);white-space:nowrap;` +
            `background:#fff;border:1px solid #2e7d32;border-radius:999px;padding:2px 8px;` +
            `font-size:12px;font-weight:600;color:#1d3a1a;box-shadow:0 1px 4px rgba(0,0,0,.3)">${emoji} ${label}</div>`,
          iconSize: [0, 0],
        });
      const group = layersRef.current;
      group.clearLayers();
      L.marker([myPos.lat, myPos.lng], { icon: pin('🧭', t('yourLocation')) }).addTo(group);
      L.marker([listing.pickupLat, listing.pickupLng], { icon: pin('📍', t('pickupPoint')) }).addTo(group);
      const line = L.polyline(
        [
          [myPos.lat, myPos.lng],
          [listing.pickupLat, listing.pickupLng],
        ],
        { color: '#2e7d32', weight: 3, dashArray: '6 6' },
      ).addTo(group);
      mapRef.current.fitBounds(line.getBounds(), { padding: [36, 36] });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDest, myPos, listing.pickupLat, listing.pickupLng]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    },
    [],
  );

  if (!hasDest) {
    return (
      <div
        style={{
          marginTop: 12, border: '1px dashed #c9d6c3', borderRadius: 10,
          padding: '10px 12px', background: '#f7faf5',
        }}
      >
        <p className="muted" style={{ margin: 0 }}>🗺️ {t('mapUnavailable')}</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
        {t('distanceToPickup')}: {km !== null ? `${formatDistance(km)} ${t('away')}` : '—'}
      </p>
      {!myPos ? (
        <div
          style={{
            border: '1px dashed #c9d6c3', borderRadius: 10,
            padding: '10px 12px', background: '#f7faf5',
          }}
        >
          <p className="muted" style={{ margin: '0 0 8px' }}>{t('locationNeeded')}</p>
          <button type="button" className="secondary" onClick={locate} disabled={locating}>
            📍 {locating ? t('locating') : t('useMyLocation')}
          </button>
          {geoError && <p className="error" style={{ margin: '8px 0 0' }}>{geoError}</p>}
        </div>
      ) : (
        <>
          <div
            ref={mapDivRef}
            style={{
              height: 260, borderRadius: 10, border: '1px solid #d9e8d2',
              overflow: 'hidden', background: '#eef3ea', position: 'relative', zIndex: 0,
            }}
          />
          <div className="row" style={{ marginTop: 6, alignItems: 'center' }}>
            <button type="button" className="secondary" onClick={locate} disabled={locating}>
              📍 {locating ? t('locating') : t('useMyLocation')}
            </button>
            {geoError && <span className="error">{geoError}</span>}
          </div>
          {tilesFailed && (
            <p className="muted" style={{ marginTop: 4 }}>⚠ {t('tilesFailed')}</p>
          )}
        </>
      )}
    </div>
  );
}
