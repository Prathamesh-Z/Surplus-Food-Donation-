import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../i18n/LanguageContext.jsx';
import { PickupCodeDisplay } from './Pickup.jsx';

/**
 * Claim-success confirmation modal (PRD v3.15, batch F6).
 *
 * Pure presentation over the claim result the detail page already
 * holds: rendered only when ListingDetail sets its success state in
 * the claim handler (never derived from polled data), so re-renders
 * and the page's 15-second refresh cannot reopen it. The pickup code
 * is the one issued by the claim response, shown through the existing
 * PickupCodeDisplay — no second code, no duplicated QR logic. Donor
 * contact appears only when the listing payload already carries it
 * (the server-side showContact rule decides that, not this component).
 */
export function ClaimSuccessModal({ portionsClaimed, listing, code, onClose }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const viewBtnRef = useRef(null);

  useEffect(() => {
    viewBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20, 35, 18, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-success-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, padding: '22px 20px',
          width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">✅</div>
        <h2 id="claim-success-title" style={{ margin: '8px 0 4px' }}>
          {t('claimSuccessful')}
        </h2>
        <p className="muted" style={{ margin: '0 0 14px' }}>
          {t('claimSuccess')}
        </p>
        <div style={{ textAlign: 'left', display: 'grid', gap: 6 }}>
          <p style={{ margin: 0 }}>
            <strong>{t('foodName')}:</strong> {listing.foodName}
          </p>
          <p style={{ margin: 0 }}>
            <strong>{t('portionsClaimed')}:</strong> {portionsClaimed}
          </p>
          <p style={{ margin: 0 }}>
            <strong>{t('deadline')}:</strong>{' '}
            {new Date(listing.collectionDeadline).toLocaleString()}
          </p>
          <p style={{ margin: 0 }}>
            <strong>{t('pickupLocation')}:</strong> {listing.pickupLocationText}
          </p>
          {listing.donorContact && (
            <p style={{ margin: 0 }}>
              <strong>📞 {t('donorContactTitle')}:</strong>{' '}
              <a href={`tel:+91${listing.donorContact}`}>{listing.donorContact}</a>
            </p>
          )}
        </div>
        <div style={{ marginTop: 14 }}>
          <PickupCodeDisplay code={code} />
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'center', gap: 10 }}>
          <button
            type="button"
            ref={viewBtnRef}
            onClick={() => navigate('/my-claims')}
          >
            {t('viewMyClaims')}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  );
}
