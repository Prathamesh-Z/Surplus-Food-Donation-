import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';
import { listingDistanceKm, applyBrowseRadius } from '../lib/distance.js';
import { ListingCard } from '../components/ListingCard.jsx';

const SORTS = ['urgent', 'timeHigh', 'vegFirst', 'nonvegFirst', 'nearest', 'farthest'];

export function Browse() {
  const { t } = useLang();
  const { location, openPrompt } = useLocation();
  const [listings, setListings] = useState([]);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('urgent');
  const [imgFailed, setImgFailed] = useState(() => new Set());
  const [myClaims, setMyClaims] = useState([]);
  const browseUser = JSON.parse(localStorage.getItem('fws_user') ?? 'null');
  const canClaimRole = browseUser && (browseUser.role === 'CLAIMER' || browseUser.role === 'NGO');
  const [filters, setFilters] = useState({
    q: '',
    category: '',
    dietaryType: '',
    portionType: '',
    ngoSuitable: false,
    endingSoon: false,
    availableOnly: true,
  });

  async function load() {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.category) params.set('category', filters.category);
    if (filters.dietaryType) params.set('dietaryType', filters.dietaryType);
    if (filters.portionType) params.set('portionType', filters.portionType);
    if (filters.ngoSuitable) params.set('ngoSuitable', 'true');
    if (filters.endingSoon) params.set('endingSoon', 'true');
    if (!filters.availableOnly) params.set('availableOnly', 'false');
    try {
      const data = await api(`/api/listings?${params.toString()}`);
      setListings(data.listings);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const set = (k) => (e) =>
    setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function loadMine() {
    if (!canClaimRole) return;
    try {
      const data = await api('/api/claims/mine');
      setMyClaims(data.claims ?? []);
    } catch { /* the claim row is a convenience; browsing must not break */ }
  }
  useEffect(() => { loadMine(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const myClaimFor = (listingId) =>
    myClaims.find((c) => c.status === 'CONFIRMED' && c.listingId === listingId);

  async function cancelMyClaim(claimId) {
    if (!window.confirm('Cancel this claim? (Cancelling less than 30 minutes before the deadline does not return the portions.)')) return;
    try {
      await api(`/api/claims/${claimId}/cancel`, { method: 'POST', body: {} });
      loadMine();
      load();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  const userCoords =
    typeof location?.lat === 'number' && typeof location?.lng === 'number'
      ? { lat: location.lat, lng: location.lng }
      : null;
  const distanceSort = sortBy === 'nearest' || sortBy === 'farthest';
  const effectiveSort = distanceSort && !userCoords ? 'urgent' : sortBy;

  // Sorting runs over the FULL filtered result set returned by the API
  // (there is no pagination), so the global order is correct. Listings
  // without coordinates always go last in distance sorts — an unknown
  // distance is never treated as nearest or farthest.
  // PRD v3.18 (batch F4): the 5 km discovery radius — claimer/NGO only,
  // only with real saved coordinates, applied client-side before sorting.
  const radius = useMemo(
    () => applyBrowseRadius(listings, userCoords, browseUser?.role ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listings, location?.lat, location?.lng, browseUser?.role],
  );

  const sorted = useMemo(() => {
    const withDist = radius.listings.map((l) => ({ ...l, distanceKm: listingDistanceKm(userCoords, l) }));
    const byDeadline = (a, b) => new Date(a.collectionDeadline) - new Date(b.collectionDeadline);
    const vegRank = (l) => (l.dietaryType === 'NON_VEG' ? 1 : 0);
    const arr = [...withDist];
    switch (effectiveSort) {
      case 'timeHigh':
        arr.sort((a, b) => byDeadline(b, a));
        break;
      case 'vegFirst':
        arr.sort((a, b) => vegRank(a) - vegRank(b) || byDeadline(a, b));
        break;
      case 'nonvegFirst':
        arr.sort((a, b) => vegRank(b) - vegRank(a) || byDeadline(a, b));
        break;
      case 'nearest':
        arr.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || byDeadline(a, b));
        break;
      case 'farthest':
        arr.sort((a, b) => (b.distanceKm ?? -Infinity) - (a.distanceKm ?? -Infinity) || byDeadline(a, b));
        break;
      default:
        arr.sort(byDeadline);
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius.listings, effectiveSort, location?.lat, location?.lng]);

  const sortLabels = {
    urgent: t('sortUrgent'),
    timeHigh: t('sortTimeHigh'),
    vegFirst: t('sortVegFirst'),
    nonvegFirst: t('sortNonvegFirst'),
    nearest: t('sortNearest'),
    farthest: t('sortFarthest'),
  };

  return (
    <section>
      {/* QA-09: the label used to show the FALLBACK sort ("Time remaining")
         while the dropdown still showed the chosen distance sort — a silent
         switch. The label now matches the chosen sort; the note below the
         filters (already present) explains the fallback order. */}
      {error && <div className="error">{error}</div>}
      <div className="filterBar">
          <input
            placeholder={t('searchFood')}
            value={filters.q}
            onChange={set('q')}
            style={{ flex: '1 1 130px', maxWidth: 190 }}
          />
          <select value={filters.category} onChange={set('category')}>
            <option value="">{t('allCategories')}</option>
            <option value="COOKED_MEALS">Cooked meals</option>
            <option value="RAW_PRODUCE">Raw produce</option>
            <option value="BAKERY">Bakery</option>
            <option value="DAIRY">Dairy</option>
            <option value="PACKAGED_FOOD">Packaged food</option>
            <option value="BEVERAGES">Beverages</option>
            <option value="OTHER">Other</option>
          </select>
          <select value={filters.dietaryType} onChange={set('dietaryType')}>
            <option value="">Veg / non-veg / vegan</option>
            <option value="VEG">Veg</option>
            <option value="NON_VEG">Non-veg</option>
            <option value="VEGAN">Vegan</option>
          </select>
          <label style={{ fontWeight: 600 }}>
            {t('sortBy')}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s} value={s}>{sortLabels[s]}</option>
              ))}
            </select>
          </label>
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={filters.ngoSuitable} onChange={set('ngoSuitable')} style={{ width: 'auto' }} /> {t('ngoSuitable')}
          </label>
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={filters.endingSoon} onChange={set('endingSoon')} style={{ width: 'auto' }} /> {t('endingSoon')}
          </label>
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={filters.availableOnly} onChange={set('availableOnly')} style={{ width: 'auto' }} /> {t('availableOnly')}
          </label>
        <span className="muted filterBarNote">{sortLabels[sortBy]}</span>
        {distanceSort && !userCoords && <span className="muted filterBarNote">{t('distanceNeedsLocation')}</span>}
      </div>
      {canClaimRole && !userCoords && (
        <p className="muted">
          {t('radiusPrompt')}{' '}
          <button type="button" className="secondary" onClick={openPrompt}>{t('setLocation')}</button>
        </p>
      )}
      {radius.applied && radius.hiddenCount > 0 && (
        <p className="muted">{radius.hiddenCount} {t('listingsHiddenRadius')}</p>
      )}
      {sorted.length === 0 && radius.applied && listings.length > 0 ? (
        <p className="muted">{t('noListingsWithinRadius')}</p>
      ) : sorted.length === 0 ? (
        <p className="muted">Nothing matches right now. Listings appear here as providers post them.</p>
      ) : null}
      <div className="grid">
        {sorted.map((l) => {
          const mine = myClaimFor(l.id);
          return (
            <ListingCard
              key={l.id}
              listing={l}
              imgFailed={imgFailed.has(l.id)}
              onImgError={() => setImgFailed((prev) => new Set(prev).add(l.id))}
            >
              {mine && (
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="badge">{t('yourClaim')}: {mine.portionsClaimed} {t('portions')}</span>
                  <button className="danger" onClick={() => cancelMyClaim(mine.id)}>{t('cancelClaim')}</button>
                </div>
              )}
            </ListingCard>
          );
        })}
      </div>
    </section>
  );
}
