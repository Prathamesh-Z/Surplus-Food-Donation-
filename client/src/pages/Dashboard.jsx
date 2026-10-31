import React, { useEffect, useState } from 'react';
import { api, getAccessToken } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

function Stat({ label, value }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

// The signed-in impact view (FR-15). Rendered standalone before the
// unification; now it is the "My Impact" tab of /impact via `embedded`
// (the unified page supplies the heading). Data and definitions are
// unchanged: /api/dashboard computes everything from system records.
export function Dashboard({ embedded = false }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const user = JSON.parse(localStorage.getItem('fws_user') ?? 'null');

  useEffect(() => {
    api('/api/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  // CSV export: the endpoint is auth-gated, so fetch with the access
  // token and save the blob. On a 401, a normal api() call silently
  // renews the token — retry the download once with the fresh one.
  async function exportCsv() {
    setExportError('');
    try {
      const attempt = () =>
        fetch('/api/dashboard/export.csv', {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
      let res = await attempt();
      if (res.status === 401) {
        await api('/api/dashboard');
        res = await attempt();
      }
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'food-waste-saver-impact.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t('exportFailed'));
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p>Loading…</p>;
  const p = data.platform;
  const m = data.mine;

  const body = (
    <>
      <div className="row">
        <h2 style={{ margin: 0 }}>{t('platformImpact')}</h2>
        <button type="button" className="secondary" onClick={exportCsv}>{t('exportCsv')}</button>
      </div>
      {exportError && <div className="error">{exportError}</div>}
      <div className="grid">
        <Stat label={t('statListingsCreated')} value={p.listingsCreated} />
        <Stat label={t('statPortionsListed')} value={p.portionsListed} />
        <Stat label={t('statPortionsClaimed')} value={p.portionsClaimed} />
        <Stat label={t('statPortionsCollected')} value={p.portionsCollected} />
        <Stat label={t('statCompletionRate')} value={`${p.completionRate}%`} />
        <Stat label={t('statExpired')} value={p.expiredListings} />
        <Stat label={t('statRedistributed')} value={p.ngoPortionsRedistributed} />
      </div>
      <h2>{t('yourContribution')}{user ? ` — ${user.name} (${user.role})` : ''}</h2>
      <div className="grid">
        {m.listingsCreated !== undefined && <Stat label={t('statYourListings')} value={m.listingsCreated} />}
        {m.portionsListed !== undefined && <Stat label={t('statPortionsYouListed')} value={m.portionsListed} />}
        {m.portionsClaimed !== undefined && <Stat label={t('statPortionsClaimed')} value={m.portionsClaimed} />}
        {m.portionsCollected !== undefined && <Stat label={t('statPortionsCollected')} value={m.portionsCollected} />}
        {user?.role === 'NGO' && <Stat label={t('statYouRedistributed')} value={m.ngoPortionsRedistributed} />}
      </div>
    </>
  );

  if (embedded) return body;
  return (
    <section>
      <h1>{t('dashboard')}</h1>
      {body}
    </section>
  );
}
