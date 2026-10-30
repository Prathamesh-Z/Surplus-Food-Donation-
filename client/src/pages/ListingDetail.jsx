import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formatApiError } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';
import { listingDistanceKm, formatDistance } from '../lib/distance.js';
import { PriorityBadge } from '../components/PriorityBadge.jsx';
import { PickupCodeDisplay } from '../components/Pickup.jsx';
import { ClaimSuccessModal } from '../components/ClaimSuccessModal.jsx';
import { timeRemaining } from './MyListings.jsx';

export function ListingDetail() {
  const { t } = useLang();
  const { location } = useLocation();
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [portions, setPortions] = useState(1);
  const [message, setMessage] = useState('');
  const [issuedCode, setIssuedCode] = useState('');
  const [successClaim, setSuccessClaim] = useState(null);
  const [myClaims, setMyClaims] = useState([]);
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('fws_user') ?? 'null');

  async function load() {
    try {
      const data = await api(`/api/listings/${id}`);
      setListing(data.listing);
    } catch (err) {
      setError(err.message);
    }
  }
  async function loadMine() {
    try {
      const data = await api('/api/claims/mine');
      setMyClaims((data.claims ?? []).filter((c) => c.listingId === id && c.status === 'CONFIRMED'));
    } catch { /* not a claimer, or not signed in — the section just stays hidden */ }
  }
  useEffect(() => {
    load();
    loadMine();
    const t = setInterval(() => { load(); loadMine(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cancelMyClaim(claimId) {
    if (!window.confirm('Cancel this claim? (Cancelling less than 30 minutes before the deadline does not return the portions.)')) return;
    try {
      await api(`/api/claims/${claimId}/cancel`, { method: 'POST', body: {} });
      loadMine();
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function claim(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const data = await api('/api/claims', {
        method: 'POST',
        body: { listingId: id, portions: Number(portions) },
      });
      setMessage(t('claimSuccess'));
      setIssuedCode(data.pickupCode);
      setSuccessClaim({ portionsClaimed: data.claim.portionsClaimed, code: data.pickupCode });
      load();
      loadMine();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  if (error && !listing) return <div className="error">{error}</div>;
  if (!listing) return <p>Loading…</p>;
  const canClaim = user && (user.role === 'CLAIMER' || user.role === 'NGO');

  return (
    <section>
      <h1>{listing.foodName}</h1>
      {listing.photoPath && (
        <img
          src={listing.photoPath}
          alt={listing.foodName}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 12 }}
        />
      )}
      <p>{listing.foodDetails}</p>
      <div className="card">
        <p>
          <strong>{listing.portionsRemaining}</strong> {t('ofTotal')} {listing.totalPortions} {t('portions')} {t('remaining')}
          {' · '}⏰ {timeRemaining(listing.collectionDeadline)} <PriorityBadge deadline={listing.collectionDeadline} />
          {' · '}Deadline: {new Date(listing.collectionDeadline).toLocaleString()}
        </p>
        <p>
          📍 {t('pickup')}: {listing.pickupLocationText}
          {(() => {
            const d = listingDistanceKm(
              typeof location?.lat === 'number' ? { lat: location.lat, lng: location.lng } : null,
              listing
            );
            return d !== null ? <> · 🚶 {formatDistance(d)} {t('awayFromYou')}</> : null;
          })()}
        </p>
        <p className="muted">
          {listing.category}
          {listing.categoryNote ? ` (${listing.categoryNote})` : ''} · {listing.dietaryType} · {listing.portionType}
          {listing.bulkUnit ? ` · ${listing.bulkUnit}` : ''} · {t('byProvider')} {listing.providerName}
          {listing.ngoSuitable ? ' · NGO-suitable' : ''}
        </p>
        <p className="muted">{t('safetyConfirmed')}</p>
        {listing.donorContact && (
          <p>
            📞 {t('donorContactTitle')}:{' '}
            <a href={`tel:+91${listing.donorContact}`}>{listing.donorContact}</a>
          </p>
        )}
      </div>
      {message && (
        <div className="success">
          {message}
          {issuedCode && (
            <div style={{ marginTop: 8 }}>
              <PickupCodeDisplay code={issuedCode} />
            </div>
          )}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {successClaim && (
        <ClaimSuccessModal
          portionsClaimed={successClaim.portionsClaimed}
          listing={listing}
          code={successClaim.code}
          onClose={() => setSuccessClaim(null)}
        />
      )}
      {canClaim && listing.portionsRemaining > 0 && (
        <form onSubmit={claim} className="row">
          <label>
            {t('portionsToClaim')}
            <input
              type="number"
              min="1"
              max={listing.portionsRemaining}
              value={portions}
              onChange={(e) => setPortions(e.target.value)}
              style={{ width: 110 }}
            />
          </label>
          <button type="submit">{t('claim')}</button>
        </form>
      )}
      {myClaims.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          {myClaims.map((c) => (
            <div className="row" key={c.id}>
              <span className="badge">{t('yourClaim')}: {c.portionsClaimed} {t('portions')}</span>
              <span className="badge">{c.status}</span>
              <button className="danger" onClick={() => cancelMyClaim(c.id)}>{t('cancelClaim')}</button>
            </div>
          ))}
        </div>
      )}
      {!canClaim && <p className="muted">{t('loginToClaim')}</p>}
    </section>
  );
}
