import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

function Stat({ label, value }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

export function Dashboard() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('fws_user') ?? 'null');

  useEffect(() => {
    api('/api/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p>Loading…</p>;
  const p = data.platform;
  const m = data.mine;

  return (
    <section>
      <h1>{t('dashboard')}</h1>
      <p className="muted">
        Every number below is computed from the records stored in this system — listings, claims
        and collections that actually happened here. No estimates, no external figures.
      </p>
      <h2>{t('platformImpact')}</h2>
      <div className="grid">
        <Stat label="Listings created" value={p.listingsCreated} />
        <Stat label="Portions listed" value={p.portionsListed} />
        <Stat label="Portions claimed" value={p.portionsClaimed} />
        <Stat label="Portions collected" value={p.portionsCollected} />
        <Stat label="Completion rate" value={`${p.completionRate}%`} />
        <Stat label="Expired listings" value={p.expiredListings} />
        <Stat label="Portions redistributed by NGOs" value={p.ngoPortionsRedistributed} />
      </div>
      <h2>{t('yourContribution')}{user ? ` — ${user.name} (${user.role})` : ''}</h2>
      <div className="grid">
        {m.listingsCreated !== undefined && <Stat label="Your listings" value={m.listingsCreated} />}
        {m.portionsListed !== undefined && <Stat label="Portions you listed" value={m.portionsListed} />}
        {m.portionsClaimed !== undefined && <Stat label="Portions claimed" value={m.portionsClaimed} />}
        {m.portionsCollected !== undefined && <Stat label="Portions collected" value={m.portionsCollected} />}
        {user?.role === 'NGO' && <Stat label="Portions you redistributed" value={m.ngoPortionsRedistributed} />}
      </div>
    </section>
  );
}
