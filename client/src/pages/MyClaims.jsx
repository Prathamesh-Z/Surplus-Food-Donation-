import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { timeRemaining } from './MyListings.jsx';

export function MyClaims() {
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
      setError(err.data?.error || err.message);
    }
  }

  async function cancel(id) {
    if (!window.confirm('Cancel this claim? (Cancelling less than 30 minutes before the deadline does not return the portions.)')) return;
    try {
      await api(`/api/claims/${id}/cancel`, { method: 'POST', body: {} });
      load();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  return (
    <section>
      <h1>My claims</h1>
      {error && <div className="error">{error}</div>}
      {claims.length === 0 && <p className="muted">No claims yet — browse available food to make your first claim.</p>}
      {claims.map((c) => (
        <div className="card" key={c.id}>
          <div className="row">
            <strong>{c.listing.foodName}</strong>
            <span className="badge">{c.status}</span>
            <span className="muted">{c.portionsClaimed} portions</span>
            <span className="muted">⏰ {timeRemaining(c.listing.collectionDeadline)}</span>
          </div>
          <p className="muted">
            📍 {c.listing.pickupLocationText} · Provider: {c.listing.providerName}
            <br />Deadline: {new Date(c.listing.collectionDeadline).toLocaleString()}
          </p>
          {c.status === 'CONFIRMED' && (
            <div className="row">
              {codes[c.id] ? (
                <span>
                  Pickup code: <span className="code">{codes[c.id]}</span>
                </span>
              ) : (
                <button className="secondary" onClick={() => showCode(c.id)}>Show pickup code</button>
              )}
              <button className="danger" onClick={() => cancel(c.id)}>Cancel claim</button>
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
