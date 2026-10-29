import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { timeRemaining } from './MyListings.jsx';
import { PickupCodeDisplay } from '../components/Pickup.jsx';

export function MyClaims() {
  const { t } = useLang();
  const [claims, setClaims] = useState([]);
  const [codes, setCodes] = useState({});
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

  async function showCode(id) {
    try {
      const data = await api(`/api/claims/${id}/code`);
      setCodes({ ...codes, [id]: data.pickupCode });
    } catch (err) {
      setError(formatApiError(err));
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
          <div className="row">
            <strong>{c.listing.foodName}</strong>
            <span className="badge">{c.status}</span>
            <span className="muted">{c.portionsClaimed} {t('portions')}</span>
            <span className="muted">⏰ {timeRemaining(c.listing.collectionDeadline)}</span>
          </div>
          <p className="muted">
            📍 {c.listing.pickupLocationText} · {t('provider')}: {c.listing.providerName}
            <br />Deadline: {new Date(c.listing.collectionDeadline).toLocaleString()}
          </p>
          {c.status === 'CONFIRMED' && (
            <div className="row">
              {codes[c.id] ? (
                <PickupCodeDisplay code={codes[c.id]} />
              ) : (
                <button className="secondary" onClick={() => showCode(c.id)}>{t('showCode')}</button>
              )}
              <button className="danger" onClick={() => cancel(c.id)}>{t('cancelClaim')}</button>
            </div>
          )}
          {c.status === 'COLLECTED' && (
            <p className="success">Collected ✓ {c.collectedAt ? new Date(c.collectedAt).toLocaleString() : ''}</p>
          )}
        </div>
      ))}
    </section>
  );
}
