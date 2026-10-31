import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { ListingCard } from '../components/ListingCard.jsx';

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

  // Public listings preview (PRD v3.30): the same public endpoint
  // Browse uses — anonymous responses are already privacy-shaped by
  // the API (no donor contact, no claim data). Show up to six
  // available listings, soonest deadline first; claiming still
  // requires sign-in on the detail page.
  const [preview, setPreview] = useState(null);
  const [imgFailed, setImgFailed] = useState(() => new Set());
  useEffect(() => {
    fetch('/api/listings')
      .then((r) => r.json())
      .then((d) =>
        setPreview(
          (d.listings ?? [])
            .filter((l) => l.status === 'ACTIVE' && l.portionsRemaining > 0)
            .sort((a, b) => new Date(a.collectionDeadline) - new Date(b.collectionDeadline))
            .slice(0, 6)
        )
      )
      .catch(() => setPreview([]));
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

      {preview !== null && (
        <>
          <h2>{t('browseCta')}</h2>
          {preview.length === 0 ? (
            <p className="muted">{t('noListingsYet')}</p>
          ) : (
            <>
              <div className="grid">
                {preview.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    imgFailed={imgFailed.has(l.id)}
                    onImgError={() => setImgFailed((prev) => new Set(prev).add(l.id))}
                  />
                ))}
              </div>
              <p style={{ marginTop: 12 }}>
                <Link className="btn secondary" to="/browse">{t('browse')}</Link>
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
