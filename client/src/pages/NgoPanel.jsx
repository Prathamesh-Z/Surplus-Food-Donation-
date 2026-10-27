import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const DEST_TYPES = ['SHELTER', 'COMMUNITY_KITCHEN', 'OLD_AGE_HOME', 'SCHOOL', 'INDIVIDUALS', 'OTHER'];

export function NgoPanel() {
  const [me, setMe] = useState(null);
  const [claims, setClaims] = useState([]);
  const [entries, setEntries] = useState([]);
  const [forms, setForms] = useState({});
  const [error, setError] = useState('');

  async function load() {
    try {
      const [meData, claimsData, entriesData] = await Promise.all([
        api('/api/ngo/me'),
        api('/api/claims/mine'),
        api('/api/ngo/redistributions'),
      ]);
      setMe(meData);
      setClaims(claimsData.claims.filter((c) => c.status === 'COLLECTED'));
      setEntries(entriesData.entries);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function logRedistribution(claimId) {
    const f = forms[claimId] ?? {};
    try {
      await api('/api/ngo/redistributions', {
        method: 'POST',
        body: {
          claimId,
          destinationName: f.name ?? '',
          destinationType: f.type ?? 'SHELTER',
          portions: Number(f.portions ?? 0),
        },
      });
      load();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  async function removeEntry(id) {
    try {
      await api(`/api/ngo/redistributions/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  const loggedFor = (claimId) =>
    entries.filter((e) => e.claimId === claimId).reduce((s, e) => s + e.portions, 0);

  return (
    <section>
      <h1>NGO panel</h1>
      {error && <div className="error">{error}</div>}
      {me && (
        <div className="card">
          <strong>{me.profile?.organisationName}</strong>{' '}
          {me.verified ? (
            <span className="badge">✓ Verified NGO</span>
          ) : (
            <span className="badge warn">Unverified — an admin can verify your registration details. You can claim and redistribute meanwhile.</span>
          )}
        </div>
      )}

      <h2>Log redistribution for collected food</h2>
      {claims.length === 0 && <p className="muted">No collected claims yet. Redistribution can be logged once food is collected.</p>}
      {claims.map((c) => {
        const f = forms[c.id] ?? {};
        const set = (k, v) => setForms({ ...forms, [c.id]: { ...f, [k]: v } });
        return (
          <div className="card" key={c.id}>
            <div className="row">
              <strong>{c.listing.foodName}</strong>
              <span className="muted">
                Collected {c.portionsClaimed} portions · logged {loggedFor(c.id)} · remaining to log{' '}
                {c.portionsClaimed - loggedFor(c.id)}
              </span>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input placeholder="Destination name" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} style={{ maxWidth: 240 }} />
              <select value={f.type ?? 'SHELTER'} onChange={(e) => set('type', e.target.value)}>
                {DEST_TYPES.map((d) => (
                  <option key={d} value={d}>{d.replaceAll('_', ' ')}</option>
                ))}
              </select>
              <input type="number" placeholder="Portions" value={f.portions ?? ''} onChange={(e) => set('portions', e.target.value)} style={{ width: 110 }} />
              <button onClick={() => logRedistribution(c.id)}>Log redistribution</button>
            </div>
          </div>
        );
      })}

      <h2>Redistribution log</h2>
      {entries.length === 0 && <p className="muted">Nothing logged yet.</p>}
      {entries.map((e) => (
        <div className="card" key={e.id}>
          <div className="row">
            <strong>{e.destinationName}</strong>
            <span className="badge">{e.destinationType}</span>
            <span>{e.portions} portions</span>
            <span className="muted">from “{e.claim.listing.foodName}” · {new Date(e.redistributedAt).toLocaleString()}</span>
            <button className="danger" onClick={() => removeEntry(e.id)}>Delete</button>
          </div>
        </div>
      ))}
    </section>
  );
}
