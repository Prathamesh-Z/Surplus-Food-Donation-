import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n/LanguageContext.jsx';
import { PriorityBadge, priorityCardStyle } from './PriorityBadge.jsx';
import { ClockIcon, MapPinIcon } from './icons.jsx';
import { timeRemaining } from '../pages/MyListings.jsx';

/** Classic Indian veg/non-veg mark + label. Vegan counts as vegetarian. */
export function DietMark({ type }) {
  const veg = type === 'VEG' || type === 'VEGAN';
  const color = type === 'NON_VEG' ? 'var(--red)' : 'var(--green-700)';
  const label = type === 'VEGAN' ? 'Vegan' : veg ? 'Veg' : 'Non-veg';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color }}>
      <span
        style={{
          width: 14, height: 14, border: `2px solid ${color}`, borderRadius: 3,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      </span>
      {label}
    </span>
  );
}

// The listing card shared by Browse and the public Home preview
// (extracted from Browse unchanged, PRD v3.30): photo or placeholder,
// title + diet mark, priority / NGO / fully-claimed badges, time
// remaining, pickup location text, and the View & Claim link. It
// renders only public listing fields — never contact or claim data.
// Browse passes its signed-in "your claim" row as children; Home
// passes nothing.
export function ListingCard({ listing: l, imgFailed = false, onImgError, children }) {
  const { t } = useLang();
  // Sold out = the backend says so: FULLY_CLAIMED status, or zero
  // portions remaining. Such cards get a neutral treatment — no
  // urgency accent, no priority badge, no "claim" wording.
  const soldOut = l.status === 'FULLY_CLAIMED' || l.portionsRemaining <= 0;
  return (
    <div
      className="card"
      style={soldOut ? { borderLeft: '5px solid #9aa0a6', opacity: 0.82 } : priorityCardStyle(l.collectionDeadline)}
    >
      {l.photoPath && !imgFailed ? (
        <img
          src={l.photoPath}
          alt={l.foodName}
          onError={onImgError}
          style={{
            width: '100%', height: 160, borderRadius: 8, objectFit: 'cover',
            ...(soldOut ? { filter: 'grayscale(45%)' } : {}),
          }}
        />
      ) : (
        <div
          style={{
            height: 160, borderRadius: 8, background: 'var(--surface-tint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, color: '#7a8a72',
          }}
          aria-label={t('noPhoto')}
        >
          🍲
        </div>
      )}
      <div className="foodCardBody">
        <div className="foodTitleRow">
          <strong className="foodTitle">{l.foodName}</strong>
          <DietMark type={l.dietaryType} />
        </div>
        <div className="row" style={{ gap: 6 }}>
          {!soldOut && <PriorityBadge deadline={l.collectionDeadline} />}
          {l.ngoSuitable && <span className="badge warn">{t('ngoSuitable')}</span>}
          {soldOut && (
            <span className="badge grey" style={{ border: '1px solid var(--grey-border)' }}>
              {t('fullyClaimed')}
            </span>
          )}
        </div>
        <div className="foodStats">
          <span><ClockIcon size={16} /> {timeRemaining(l.collectionDeadline)}</span>
        </div>
        <p className="muted foodMeta">
          <MapPinIcon size={14} /> {l.pickupLocationText}
        </p>
        <Link className="btn foodCta" to={`/listings/${l.id}`}>{soldOut ? t('viewDetails') : t('viewClaim')}</Link>
      </div>
      {children}
    </div>
  );
}
