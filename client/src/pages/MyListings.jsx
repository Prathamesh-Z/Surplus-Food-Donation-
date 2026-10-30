import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '../lib/api.js';
import { VerifyPickup } from '../components/Pickup.jsx';
import { LiveShareControl } from '../components/LiveShareControl.jsx';
import { PriorityBadge, priorityCardStyle } from '../components/PriorityBadge.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { CHECKLIST } from '../lib/checklist.js';

const ALL_IDS = CHECKLIST.map(([id]) => id);

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
  // QA-04: publish modal state — which DRAFT is being published + its ticks.
  const [publishId, setPublishId] = useState('');
  const [publishTicks, setPublishTicks] = useState([]);
  const [publishError, setPublishError] = useState('');

  async function publish() {
    setPublishError('');
    try {
      await api(`/api/listings/${publishId}/publish`, { method: 'POST', body: { checklistItems: publishTicks } });
      setPublishId('');
      setPublishTicks([]);
      load();
    } catch (err) {
      setPublishError(formatApiError(err));
    }
  }

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
        <div className="card" key={l.id} style={priorityCardStyle(l.collectionDeadline)}>
          {l.photoPath && (
            <img
              src={l.photoPath}
              alt={l.foodName}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              style={{
                width: '100%', height: 180, borderRadius: 8,
                // contain + neutral backdrop: the WHOLE dish stays visible
                // whatever the photo's shape (v3.6 — cover at this size was
                // zooming/cropping portrait phone photos badly).
                objectFit: 'contain', background: '#eef4ea',
              }}
            />
          )}
          <div className="row">
            <strong>{l.foodName}</strong>
            <span className="badge">{l.status}</span>
            <PriorityBadge deadline={l.collectionDeadline} />
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
                  {c.status === 'CONFIRMED' && <LiveShareControl claimId={c.id} />}
                </div>
              ))}
            </div>
          )}
          {['LIVE', 'PARTIALLY_CLAIMED', 'FULLY_CLAIMED', 'DRAFT'].includes(l.status) && (
            <div className="row" style={{ marginTop: 8 }}>
              <Link className="btn secondary" to={`/listings/${l.id}/edit`}>{t('edit')}</Link>
              {l.status === 'DRAFT' && (
                <button onClick={() => { setPublishId(l.id); setPublishTicks([]); setPublishError(''); }}>
                  {t('publish')}
                </button>
              )}
              <button className="danger" onClick={() => cancel(l.id)}>{t('cancelListing')}</button>
            </div>
          )}
        </div>
      ))}
      {publishId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(20,40,20,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
          }}
          onClick={() => setPublishId('')}
        >
          <div
            className="card"
            style={{ maxWidth: 560, maxHeight: '82vh', overflowY: 'auto', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>{t('publishChecklistTitle')}</h2>
            {publishError && <div className="error">{publishError}</div>}
            {CHECKLIST.map(([id, text]) => (
              <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginTop: 3 }}
                  checked={publishTicks.includes(id)}
                  onChange={(e) => setPublishTicks((prev) =>
                    e.target.checked ? [...prev, id] : prev.filter((x) => x !== id)
                  )}
                />
                <span>{text}</span>
              </label>
            ))}
            <div className="row">
              <button disabled={publishTicks.length !== ALL_IDS.length} onClick={publish}>
                {t('publish')}
              </button>
              <button className="secondary" onClick={() => setPublishId('')}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
