import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { MapPinIcon } from './icons.jsx';
import { validCoords } from '../lib/distance.js';

/**
 * Map-pin location picker (PRD v3.18, batch F4).
 *
 * The user drags a pin (or taps the map, or searches a place name) and
 * confirms; only then does the caller save { label, lat, lng } through
 * LocationContext. Nothing is saved on cancel, and coordinates are
 * used on-device only — the only network calls are the place search
 * the user explicitly submits (Nominatim, submit-only, never per
 * keystroke) and the app's existing BigDataCloud label lookup for the
 * pin's position. If the label lookup fails, the coordinates label is
 * the fallback and saving still works.
 *
 * When no location was saved before, the map opens on a country view
 * with the pin at its centre as a STARTING POINT for the user's drag —
 * that centre is never saved unless the user explicitly confirms it.
 */
const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

export function LocationPicker({ initial, onConfirm, onClose }) {
  const { t } = useLang();
  const start = validCoords(initial) ? { lat: initial.lat, lng: initial.lng } : INDIA_CENTER;
  const [selected, setSelected] = useState(start);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [query, setQuery] = useState('');
  const [searchMsg, setSearchMsg] = useState('');
  const [searching, setSearching] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const labelDirtyRef = useRef(false);
  const labelSeqRef = useRef(0);
  // v3.20: starting from the country-centre default, Save stays locked
  // until the user actually picks a place (drag, tap or search).
  const [interacted, setInteracted] = useState(() => validCoords(initial));
  const [approxNote, setApproxNote] = useState(false);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const selectedRef = useRef(start);

  function movePin(pos, { lookup = true, viaSearch = false } = {}) {
    selectedRef.current = pos;
    setSelected(pos);
    setInteracted(true);
    if (!viaSearch) setApproxNote(false);
    markerRef.current?.setLatLng([pos.lat, pos.lng]);
    if (lookup) lookupLabel(pos);
  }

  async function lookupLabel(pos) {
    // v3.20: sequence-guarded — a response for an older pin position
    // can never overwrite the label of the current one.
    const seq = ++labelSeqRef.current;
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.lat}&longitude=${pos.lng}&localityLanguage=en`,
      );
      const data = await res.json();
      if (seq !== labelSeqRef.current) return; // superseded by a newer move
      const text = [data.locality, data.city, data.principalSubdivision]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(', ');
      // Never overwrite a name the user typed themselves.
      if (text && !labelDirtyRef.current) setLabel(text);
    } catch {
      /* fallback: typed label or the coordinates — saving still works */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !mapDivRef.current || mapRef.current) return;
      const map = L.map(mapDivRef.current, { scrollWheelZoom: true });
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
      map.setView([start.lat, start.lng], validCoords(initial) ? 14 : 5);
      const marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        movePin({ lat: p.lat, lng: p.lng });
      });
      map.on('click', (e) => movePin({ lat: e.latlng.lat, lng: e.latlng.lng }));
      mapRef.current = map;
      markerRef.current = marker;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchMsg('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setSearchMsg(t('noPlaceFound'));
        return;
      }
      const pos = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      mapRef.current?.setView([pos.lat, pos.lng], 15);
      movePin(pos, { lookup: false, viaSearch: true });
      setApproxNote(true);
      if (data[0].display_name) {
        setLabel(data[0].display_name.split(',').slice(0, 3).join(','));
        labelDirtyRef.current = false;
      }
    } catch {
      setSearchMsg(t('placeSearchFailed'));
    } finally {
      setSearching(false);
    }
  }

  function confirm() {
    const fallback = `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}`;
    onConfirm(label.trim() || fallback, { lat: selected.lat, lng: selected.lng });
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,40,20,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 70, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('pickOnMap')}
        style={{
          background: '#fff', borderRadius: 12, padding: 18,
          maxWidth: 520, width: '100%', maxHeight: '92vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>🗺️ {t('pickOnMap')}</h3>
        <form onSubmit={search} className="row" style={{ marginBottom: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlace')}
            style={{ flex: 1 }}
          />
          <button type="submit" className="secondary" disabled={searching || !query.trim()}>
            {t('searchPlace')}
          </button>
        </form>
        {searchMsg && <p className="muted" style={{ margin: '0 0 8px' }}>{searchMsg}</p>}
        <div
          ref={mapDivRef}
          style={{
            height: 300, borderRadius: 10, border: '1px solid var(--line)',
            overflow: 'hidden', background: '#eef3ea', position: 'relative', zIndex: 0,
          }}
        />
        {tilesFailed && <p className="muted" style={{ marginTop: 4 }}>⚠ {t('tilesFailed')}</p>}
        {!interacted && (
          <p style={{ margin: '8px 0 0', fontSize: 13 }}>⚠ {t('pickerStartHint')}</p>
        )}
        {approxNote && (
          <p style={{ margin: '8px 0 0', fontSize: 13 }}><MapPinIcon size={13} /> {t('searchApprox')}</p>
        )}
        <p className="muted" style={{ margin: '8px 0 4px' }}>{t('dragPinHint')}</p>
        <p style={{ margin: '0 0 8px', fontSize: 13 }}>
          <MapPinIcon size={13} /> {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
        </p>
        <label>
          {t('locationName')}
          <input
            value={label}
            onChange={(e) => {
              labelDirtyRef.current = true;
              setLabel(e.target.value);
            }}
            placeholder="Karad, Maharashtra"
          />
        </label>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <button type="button" className="secondary" onClick={onClose}>
            {t('close')}
          </button>
          <button type="button" onClick={confirm} disabled={!interacted}>
            {t('saveLocation')}
          </button>
        </div>
      </div>
    </div>
  );
}
