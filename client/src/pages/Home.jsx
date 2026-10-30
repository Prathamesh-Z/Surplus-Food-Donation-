import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

export function Home() {
  const { t } = useLang();
  const { loggedIn } = useAuth();
  const [live, setLive] = useState(null);
  useEffect(() => {
    fetch('/api/dashboard/public')
      .then((r) => r.json())
      .then(setLive)
      .catch(() => {});
  }, []);

  return (
    <section>
      <div className="hero">
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroText')}</p>
        <div className="row">
          <Link className="btn" to="/browse">{t('browseCta')}</Link>
          <Link className="btn secondary" to="/impact">{t('impactCta')}</Link>
        </div>
        {loggedIn && (
          <p style={{ marginTop: 12 }}>
            <Link to="/profile">{t('inviteFriends')} →</Link>
          </p>
        )}
        {live && (
          <div className="hero-stats">
            <div><div className="n">{live.portionsAvailableNow}</div><div className="l">{t('availableNow')}</div></div>
            <div><div className="n">{live.platform.portionsCollected}</div><div className="l">{t('collectedSoFar')}</div></div>
            <div><div className="n">{live.platform.completionRate}%</div><div className="l">{t('ofClaimsCompleted')}</div></div>
          </div>
        )}
      </div>

      <div className="grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t('forProviders')}</h2>
          <p>{t('forProvidersText')}</p>
          <Link className="btn secondary" to="/register">Register as a provider</Link>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t('forClaimers')}</h2>
          <p>{t('forClaimersText')}</p>
          <Link className="btn secondary" to="/browse">Find food near you</Link>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t('honestImpact')}</h2>
          <p>{t('honestImpactText')}</p>
          <Link className="btn secondary" to="/impact">Open the impact wall</Link>
        </div>
      </div>
      <p className="muted">
        Demo build for Hackathon 2K26 (Team HA040). Demo data in this system is synthetic and labelled as such.
      </p>
    </section>
  );
}
