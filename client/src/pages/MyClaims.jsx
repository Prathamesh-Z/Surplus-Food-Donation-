import React, { useEffect, useRef, useState } from 'react';
import { api, formatApiError } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { timeRemaining } from './MyListings.jsx';
import { PickupCodeDisplay } from '../components/Pickup.jsx';
import { DistanceMap } from '../components/DistanceMap.jsx';

export function MyClaims() {
  const { t } = useLang();
  const [claims, setClaims] = useState([]);
  const [codes, setCodes] = useState({});
  const [wayBusy, setWayBusy] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await api('/api/claims/mine');
      setClaims(data.claims);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function showCode(id, auto = false) {
    try {
      const data = await api(`/api/claims/${id}/code`);
      setCodes((prev) => ({ ...prev, [id]: data.pickupCode }));
    } catch (err) {
      codeRequestedRef.current.delete(id);
      if (!auto) setError(formatApiError(err));
    }
  }

  // Pickup codes render directly on confirmed cards, no click needed:
  // fetch each confirmed claim's code once when it appears. The
  // Show-code button remains as the fallback if a fetch fails.
  const codeRequestedRef = useRef(new Set());
  useEffect(() => {
    for (const c of claims) {
      if (c.status === 'CONFIRMED' && !codes[c.id] && !codeRequestedRef.current.has(c.id)) {
        codeRequestedRef.current.add(c.id);
        showCode(c.id, true);
      }
    }
  }, [claims, codes]);

  async function onTheWay(id) {
    setWayBusy(id);
    setError('');
    try {
      const res = await api(`/api/claims/${id}/on-the-way`, { method: 'POST', body: {} });
      // Immediate local update from the server's own timestamp; the
      // 15 s poll keeps it reconciled thereafter.
      setClaims((prev) => prev.map((x) => (x.id === id ? { ...x, onTheWayAt: res.onTheWayAt } : x)));
    } catch (err) {
      if (err.status === 409) {
        // Already notified (e.g. pressed on another device): reload so
        // the persisted status replaces the button.
        load();
      } else {
        setError(formatApiError(err));
      }
    } finally {
      setWayBusy(null);
    }
  }

  async function cancel(id) {
    if (!window.confirm('Cancel this claim? (Cancelling less than 30 minutes before the deadline does not return the portions.)')) return;
    try {
      await api(`/api/claims/${id}/cancel`, { method: 'POST', body: {} });
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  return (
    <section>
      <h1>{t('myClaims')}</h1>
      {error && <div className="error">{error}</div>}
      {claims.length === 0 && <p className="muted">{t('noClaimsYet')}</p>}
      {claims.map((c) => (
        <div className="card" key={c.id}>
          <div className="claimHead">
            <strong className="claimTitle">{c.listing.foodName}</strong>
            <div className="claimStats">
              <span>{c.portionsClaimed} {t('portions')}</span>
              <span>⏰ {timeRemaining(c.listing.collectionDeadline)}</span>
            </div>
          </div>
          {c.status === 'CONFIRMED' && (
            <div className="claimDetails">
              {c.listing.donorContact && (
                <p style={{ margin: '0 0 6px' }}>
                  📞 {t('donorContactTitle')}:{' '}
                  <a href={`tel:+91${c.listing.donorContact}`}>{c.listing.donorContact}</a>
                </p>
              )}
              {codes[c.id] ? (
                <PickupCodeDisplay code={codes[c.id]} />
              ) : (
                <button className="secondary" onClick={() => showCode(c.id)}>{t('showCode')}</button>
              )}
            </div>
          )}
          {c.status !== 'CONFIRMED' && (
            <p className="muted">
              📍 {c.listing.pickupLocationText} · {t('provider')}: {c.listing.providerName}
              <br />Deadline: {new Date(c.listing.collectionDeadline).toLocaleString()}
            </p>
          )}
          {c.status === 'CONFIRMED' && (
            <div className="row" style={{ marginTop: 10 }}>
              {c.onTheWayAt ? (
                <span className="success">
                  🚶 {t('donorNotified')} ·{' '}
                  {new Date(c.onTheWayAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : (
                <button onClick={() => onTheWay(c.id)} disabled={wayBusy === c.id}>
                  🚶 {t('onTheWay')}
                </button>
              )}
              <button className="dangerGhost" onClick={() => cancel(c.id)}>{t('cancelClaim')}</button>
            </div>
          )}
          {c.status === 'CONFIRMED' && <DistanceMap claimId={c.id} listing={c.listing} />}
          {c.status === 'COLLECTED' && (
            <p className="success">Collected ✓ {c.collectedAt ? new Date(c.collectedAt).toLocaleString() : ''}</p>
          )}
        </div>
      ))}
    </section>
  );
}
