import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { VerifyPickup } from '../components/Pickup.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';

export function timeRemaining(deadline) {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'Deadline passed';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

export function MyListings() {
  const { t } = useLang();
  const [listings, setListings] = useState([]);
  const [error, setError] = useState('');
  const [claims, setClaims] = useState({});

  async function load() {
    try {
      const data = await api('/api/listings/mine');
      setListings(data.listings);
      const map = {};
      await Promise.all(
        data.listings.map(async (l) => {
          try {
            const c = await api(`/api/listings/${l.id}/claims`);
            map[l.id] = c.claims;
          } catch {
            map[l.id] = [];
          }
        })
      );
      setClaims(map);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function cancel(id) {
    const reason = window.prompt('Reason for cancelling this listing?');
    if (!reason) return;
    try {
      await api(`/api/listings/${id}/cancel`, { method: 'POST', body: { reason } });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <h1>{t('myListings')}</h1>
      <p><Link className="btn" to="/listings/new">{t('postFoodCta')}</Link></p>
      {error && <div className="error">{error}</div>}
      {listings.length === 0 && <p className="muted">{t('noListingsYet')}</p>}
      {listings.map((l) => (
        <div className="card" key={l.id}>
          <div className="row">
            <strong>{l.foodName}</strong>
            <span className="badge">{l.status}</span>
            <span className="muted">{l.portionsRemaining}/{l.totalPortions} {t('portions')} {t('remaining')}</span>
            <span className="muted">{timeRemaining(l.collectionDeadline)}</span>
          </div>
          <p className="muted">📍 {l.pickupLocationText}</p>
          {(claims[l.id] ?? []).length > 0 && (
            <div>
              <strong>{t('claimsOnListing')}</strong>
              {(claims[l.id] ?? []).map((c) => (
                <div className="row" key={c.id} style={{ marginTop: 6 }}>
                  <span>{c.claimerName} — {c.portionsClaimed} portions — {c.status}</span>
                  {c.status === 'CONFIRMED' && <VerifyPickup claimId={c.id} onDone={load} />}
                </div>
              ))}
            </div>
          )}
          {['LIVE', 'PARTIALLY_CLAIMED', 'FULLY_CLAIMED', 'DRAFT'].includes(l.status) && (
            <button className="danger" onClick={() => cancel(l.id)}>{t('cancelListing')}</button>
          )}
        </div>
      ))}
    </section>
  );
}
