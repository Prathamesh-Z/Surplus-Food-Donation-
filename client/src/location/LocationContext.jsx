import React, { createContext, useContext, useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';

/**
 * App-level location (v3.4), Zepto/Blinkit-style: a place NAME the user
 * picks once, shown in the header, editable any time.
 *
 * Deliberate scope (consistent with PRD discovery rules): only the label
 * text is stored — never coordinates — in localStorage on this device.
 * It does NOT filter, rank or distance-sort listings; it prefills the
 * pickup-location text on the posting form and labels the header.
 */
const LocContext = createContext({
  location: null,
  setLocation: () => {},
  clearLocation: () => {},
  openPrompt: () => {},
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

  function setLocation(label) {
    const value = { label, savedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(value));
    setLoc(value);
    setPromptOpen(false);
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
    setPromptOpen(true);
  }

  return (
    <LocContext.Provider value={{ location, setLocation, clearLocation, openPrompt }}>
      {children}
      {promptOpen && (
        <LocationPrompt
          onClose={() => {
            setPromptOpen(false);
            if (!location) dismissPrompt();
          }}
        />
      )}
    </LocContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocContext);
}

function LocationPrompt({ onClose }) {
  const { t } = useLang();
  const { location, setLocation } = useLocation();
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function detect() {
    setError('');
    if (!navigator.geolocation) {
      setError(t('locationFailed'));
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await res.json();
          const text = [data.locality, data.city, data.principalSubdivision]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(', ');
          if (text) setLocation(text);
          else setError(t('locationFailed'));
        } catch {
          setError(t('locationFailed'));
        }
        setBusy(false);
      },
      () => {
        setBusy(false);
        setError(t('locationFailed'));
      },
      { timeout: 10000 }
    );
  }

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
        <h3 style={{ marginTop: 0 }}>📍 {t('locPromptTitle')}</h3>
        <p className="muted">{t('locPromptText')}</p>
        {error && <div className="error">{error}</div>}
        <button type="button" onClick={detect} disabled={busy} style={{ width: '100%', marginBottom: 10 }}>
          {busy ? t('locating') : `📍 ${t('useCurrentLocation')}`}
        </button>
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
            onClick={() => setLocation(manual.trim())}
          >
            {t('saveLocation')}
          </button>
        </div>
      </div>
    </div>
  );
}
