import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';
import { listingDistanceKm, formatDistance } from '../lib/distance.js';
import { PriorityBadge, priorityCardStyle } from '../components/PriorityBadge.jsx';
import { timeRemaining } from './MyListings.jsx';

/** Classic Indian veg/non-veg mark + label. Vegan counts as vegetarian. */
function DietMark({ type }) {
  const veg = type === 'VEG' || type === 'VEGAN';
  const color = type === 'NON_VEG' ? '#b3261e' : '#1e7d32';
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

const SORTS = ['urgent', 'timeHigh', 'vegFirst', 'nonvegFirst', 'nearest', 'farthest'];

export function Browse() {
  const { t } = useLang();
  const { location } = useLocation();
  const [listings, setListings] = useState([]);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('urgent');
  const [imgFailed, setImgFailed] = useState(() => new Set());
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
  const sorted = useMemo(() => {
    const withDist = listings.map((l) => ({ ...l, distanceKm: listingDistanceKm(userCoords, l) }));
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
  }, [listings, effectiveSort, location?.lat, location?.lng]);

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
      <h1>{t('availableFood')}</h1>
      <p className="muted">{sortLabels[effectiveSort]}</p>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <div className="row">
          <input placeholder={t('searchFood')} value={filters.q} onChange={set('q')} style={{ maxWidth: 220 }} />
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
        </div>
        {distanceSort && !userCoords && <p className="muted" style={{ marginBottom: 0 }}>{t('distanceNeedsLocation')}</p>}
      </div>
      {sorted.length === 0 && <p className="muted">Nothing matches right now. Listings appear here as providers post them.</p>}
      <div className="grid">
        {sorted.map((l) => (
          <div className="card" key={l.id} style={priorityCardStyle(l.collectionDeadline)}>
            {l.photoPath && !imgFailed.has(l.id) ? (
              <img
                src={l.photoPath}
                alt={l.foodName}
                onError={() => setImgFailed((prev) => new Set(prev).add(l.id))}
                style={{ width: '100%', height: 160, borderRadius: 8, objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  height: 160, borderRadius: 8, background: '#eef4ea',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 40, color: '#7a8a72',
                }}
                aria-label={t('noPhoto')}
              >
                🍲
              </div>
            )}
            <div className="row">
              <strong>{l.foodName}</strong>
              <DietMark type={l.dietaryType} />
              <PriorityBadge deadline={l.collectionDeadline} />
              {l.ngoSuitable && <span className="badge warn">NGO-suitable</span>}
              {l.status === 'FULLY_CLAIMED' && <span className="badge danger">Fully claimed</span>}
            </div>
            <p>{l.foodDetails}</p>
            <p className="muted">
              {l.portionsRemaining} of {l.totalPortions} {l.bulkUnit ? `${l.bulkUnit.toLowerCase()} (bulk)` : 'portions'} remaining · ⏰ {timeRemaining(l.collectionDeadline)}
              {l.categoryNote ? <><br />Other: {l.categoryNote}</> : ''}
              <br />📍 {l.pickupLocationText}
              {l.distanceKm !== null && l.distanceKm !== undefined && (
                <> · 🚶 {formatDistance(l.distanceKm)} {t('awayFromYou')}</>
              )}
              <br />By {l.providerName}
            </p>
            <Link className="btn" to={`/listings/${l.id}`}>{t('viewClaim')}</Link>
          </div>
        ))}
      </div>
    </section>
  );
}
