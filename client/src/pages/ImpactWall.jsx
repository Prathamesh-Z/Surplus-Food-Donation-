import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { Dashboard } from './Dashboard.jsx';

// Public live impact wall — big-number display for the demo venue screen.
// Data comes only from /api/dashboard/public (aggregates, no personal data).
function LiveWall() {
  const { t } = useLang();
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () =>
      fetch('/api/dashboard/public')
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    load();
    const tId = setInterval(load, 10000);
    return () => clearInterval(tId);
  }, []);

  if (!data) return <p style={{ textAlign: 'center' }}>{t('wallLoading')}</p>;
  const p = data.platform;

  const big = (value, label) => (
    <div className="wall-stat">
      <div className="wall-value">{value}</div>
      <div className="wall-label">{label}</div>
    </div>
  );

  return (
    <div style={{ textAlign: 'center', paddingTop: 12 }}>
      <h1 style={{ fontSize: 40, marginBottom: 4 }}>🥗 Food Waste Saver — {t('liveImpact')}</h1>
      <p className="muted" style={{ fontSize: 18 }}>{t('wallSubtitle')}</p>
      <div className="wall-grid">
        {big(p.portionsCollected, t('wallCollected'))}
        {big(p.portionsListed, t('wallListed'))}
        {big(`${p.completionRate}%`, t('wallCompletion'))}
        {big(p.listingsCreated, t('wallListings'))}
        {big(data.portionsAvailableNow, t('wallAvailable'))}
        {big(p.ngoPortionsRedistributed, t('wallRedistributed'))}
      </div>
      <p className="muted">
        {t('wallUpdated')} {new Date(data.generatedAt).toLocaleTimeString()} · {t('wallRefresh')}
      </p>
    </div>
  );
}

// Unified Impact page (/impact): the public Live Impact wall for everyone,
// plus — for signed-in users — a tab switch to My Impact (the former
// /dashboard, whose route now redirects to /impact?view=mine). Personal
// contribution data is only ever fetched and rendered when signed in.
export function ImpactWall() {
  const { t } = useLang();
  const { loggedIn } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = loggedIn && params.get('view') === 'mine' ? 'mine' : 'live';

  return (
    <section>
      {loggedIn && (
        <div className="segmented" role="tablist" aria-label={t('impactNav')}>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'live'}
            onClick={() => setParams({})}
          >
            {t('liveImpact')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'mine'}
            onClick={() => setParams({ view: 'mine' })}
          >
            {t('myImpact')}
          </button>
        </div>
      )}
      {view === 'live' ? <LiveWall /> : <Dashboard embedded />}
    </section>
  );
}
