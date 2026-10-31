import React, { createContext, useContext, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';
import { MapPinIcon } from '../components/icons.jsx';
import { LocationPicker } from '../components/LocationPicker.jsx';
import { accuracyBand, hasUsableCoords, locationSourceKey } from '../lib/location.js';

/**
 * App-level location (v3.4), Zepto/Blinkit-style: a place NAME the user
 * picks once, shown in the header, editable any time.
 *
 * Scope: the label text is what other people see; coordinates (v3.5)
 * are captured only when the user explicitly picks "Use current
 * location" or a map pin, stored only in localStorage on this device,
 * and used solely to compute distances on-device — they are never
 * sent to the server and never shown to other users.
 *
 * v3.20 (batch F8): records also carry `source` ('gps' | 'pin' |
 * 'text') so the UI can say honestly how the location was set;
 * older records without a source are interpreted, not migrated.
 * GPS detection is high-accuracy, surfaces the device-reported
 * accuracy, and never discards a valid fix when reverse geocoding
 * fails. The saved record is the app's one reference location —
 * nothing anywhere silently replaces it as the distance origin.
 */
const LocContext = createContext({
  location: null,
  setLocation: () => {},
  clearLocation: () => {},
  openPrompt: () => {},
  openDetails: () => {},
});

const KEY = 'fws_location';
const DISMISSED = 'fws_location_dismissed';

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function LocationProvider({ children }) {
  const [location, setLoc] = useState(readSaved);
  const [promptOpen, setPromptOpen] = useState(
    () => !readSaved() && !localStorage.getItem(DISMISSED)
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  function setLocation(label, coords = null, source = undefined) {
    const value = {
      label,
      lat: typeof coords?.lat === 'number' ? coords.lat : null,
      lng: typeof coords?.lng === 'number' ? coords.lng : null,
      savedAt: new Date().toISOString(),
      source: source ?? (coords ? undefined : 'text'),
    };
    if (value.source === undefined) delete value.source;
    localStorage.setItem(KEY, JSON.stringify(value));
    setLoc(value);
    setPromptOpen(false);
    setDetailsOpen(false);
  }
  function clearLocation() {
    localStorage.removeItem(KEY);
    setLoc(null);
  }
  function dismissPrompt() {
    localStorage.setItem(DISMISSED, '1');
    setPromptOpen(false);
  }
  function openPrompt() {
    setDetailsOpen(false);
    setPromptOpen(true);
  }
  function openDetails() {
    setPromptOpen(false);
    setDetailsOpen(true);
  }

  return (
    <LocContext.Provider value={{ location, setLocation, clearLocation, openPrompt, openDetails }}>
      {children}
      {promptOpen && (
        <LocationPrompt
          onClose={() => {
            setPromptOpen(false);
            if (!location) dismissPrompt();
          }}
        />
      )}
      {detailsOpen && <LocationDetails onClose={() => setDetailsOpen(false)} />}
    </LocContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocContext);
}

function formatSavedAt(iso, t) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return sameDay ? `${t('today')}, ${time}` : `${d.toLocaleDateString()}, ${time}`;
}

/** Read-only inspection of exactly what is saved (PRD v3.20). */
function LocationDetails({ onClose }) {
  const { t } = useLang();
  const { location, openPrompt } = useLocation();
  const usable = hasUsableCoords(location);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,40,20,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('savedLocationTitle')}
        style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 420, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}><MapPinIcon size={17} /> {t('savedLocationTitle')}</h3>
        {!location ? (
          <p className="muted">{t('noLocationSaved')}</p>
        ) : (
          <>
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 16 }}>{location.label}</p>
            {usable ? (
              <>
                <p style={{ margin: '0 0 2px', fontSize: 13 }}>
                  {t('coordinatesLabel')}: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
                <p className="muted" style={{ margin: '0 0 2px', fontSize: 13 }}>
                  {t('sourceLabel')}: {t(locationSourceKey(location))}
                </p>
              </>
            ) : (
              <div
                style={{
                  border: '1px dashed #d8b13c', borderRadius: 10, background: '#fdf8e7',
                  padding: '8px 10px', margin: '6px 0',
                }}
              >
                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13 }}>⚠ {t('areaOnlyTitle')}</p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('areaOnlyText')}</p>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {t('sourceLabel')}: {t(locationSourceKey(location))}
                </p>
              </div>
            )}
            {location.savedAt && (
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                {t('updatedLabel')}: {formatSavedAt(location.savedAt, t)}
              </p>
            )}
          </>
        )}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <button type="button" className="secondary" onClick={onClose}>
            {t('close')}
          </button>
          <button type="button" onClick={openPrompt}>
            {location ? t('changeLocation') : t('setLocation')}
          </button>
        </div>
      </div>
    </div>
  );
}

function LocationPrompt({ onClose }) {
  const { t } = useLang();
  const { location, setLocation } = useLocation();
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  /** A GPS fix awaiting the user's decision: { lat, lng, accuracy, label } */
  const [fix, setFix] = useState(null);

  function detect() {
    setError('');
    setFix(null);
    if (!navigator.geolocation) {
      setError(t('geoUnavailable'));
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        let label = '';
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await res.json();
          label = [data.locality, data.city, data.principalSubdivision]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(', ');
        } catch {
          /* label stays empty — the fix itself is still valid (v3.20) */
        }
        // Never auto-save: the user sees the accuracy and decides.
        setFix({ lat: latitude, lng: longitude, accuracy: typeof accuracy === 'number' ? accuracy : null, label });
        setBusy(false);
      },
      (err) => {
        setBusy(false);
        if (err?.code === 1) setError(t('geoDenied'));
        else if (err?.code === 3) setError(t('geoTimeout'));
        else setError(t('geoUnavailable'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function saveFix() {
    if (!fix) return;
    setLocation(fix.label || t('selectedGpsLocation'), { lat: fix.lat, lng: fix.lng }, 'gps');
  }

  const band = fix ? accuracyBand(fix.accuracy) : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,40,20,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 420, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}><MapPinIcon size={17} /> {t('locPromptTitle')}</h3>
        <p className="muted">{t('locPromptText')}</p>
        {error && <div className="error">{error}</div>}
        <button type="button" onClick={detect} disabled={busy} style={{ width: '100%', marginBottom: 10 }}>
          {busy ? t('locating') : <><MapPinIcon size={15} /> {t('useCurrentLocation')}</>}
        </button>
        {fix && (
          <div
            style={{
              border: '1px solid #b9d3ac', borderRadius: 10, background: '#f7faf5',
              padding: '10px 12px', marginBottom: 10,
            }}
          >
            <p style={{ margin: '0 0 2px', fontWeight: 600 }}>
              {fix.label || t('selectedGpsLocation')}
            </p>
            <p style={{ margin: '0 0 2px', fontSize: 13 }}>
              {t('coordinatesLabel')}: {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
            </p>
            {fix.accuracy !== null && (
              <p style={{ margin: '0 0 2px', fontSize: 13 }}>
                {t('gpsAccuracy')} {Math.round(fix.accuracy)} m
              </p>
            )}
            {band === 'warn' && <p style={{ margin: '0 0 2px', fontSize: 13 }}>⚠ {t('accuracyWarn')}</p>}
            {band === 'poor' && <p className="error" style={{ margin: '0 0 2px', fontSize: 13 }}>⚠ {t('accuracyPoor')}</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" onClick={saveFix}>
                {band === 'poor' ? t('saveApproxLocation') : t('useThisLocation')}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setPickerOpen(true)}
              >
                🗺️ {t('adjustWithPin')}
              </button>
              <button type="button" className="secondary" onClick={() => setFix(null)}>
                {t('close')}
              </button>
            </div>
          </div>
        )}
        <button type="button" className="secondary" onClick={() => setPickerOpen(true)} style={{ width: '100%', marginBottom: 10 }}>
          🗺️ {t('pickOnMap')}
        </button>
        {pickerOpen && (
          <LocationPicker
            initial={fix ? { label: fix.label, lat: fix.lat, lng: fix.lng } : location}
            onClose={() => setPickerOpen(false)}
            onConfirm={(label, coords) => {
              setPickerOpen(false);
              setLocation(label, coords, 'pin');
            }}
          />
        )}
        <label>
          {t('enterLocationManually')}
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Karad, Maharashtra"
          />
        </label>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <button type="button" className="secondary" onClick={onClose}>
            {location ? t('close') : t('skipForNow')}
          </button>
          <button
            type="button"
            disabled={!manual.trim()}
            onClick={() => setLocation(manual.trim(), null, 'text')}
          >
            {t('saveLocation')}
          </button>
        </div>
      </div>
    </div>
  );
}
