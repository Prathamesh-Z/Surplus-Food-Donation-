import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { timeRemaining } from './MyListings.jsx';

export function Browse() {
  const { t } = useLang();
  const [listings, setListings] = useState([]);
  const [error, setError] = useState('');
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
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const set = (k) => (e) =>
    setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <section>
      <h1>{t('availableFood')}</h1>
      <p className="muted">{t('orderedByDeadline')}</p>
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
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={filters.ngoSuitable} onChange={set('ngoSuitable')} style={{ width: 'auto' }} / > {t('ngoSuitable')}
          </label>
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={filters.endingSoon} onChange={set('endingSoon')} style={{ width: 'auto' }} / > {t('endingSoon')}
          </label>
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={filters.availableOnly} onChange={set('availableOnly')} style={{ width: 'auto' }} / > {t('availableOnly')}
          </label>
        </div>
      </div>
      {listings.length === 0 && <p className="muted">Nothing matches right now. Listings appear here as providers post them.</p>}
      <div className="grid">
        {listings.map((l) => (
          <div className="card" key={l.id}>
            {l.photoPath && <img src={l.photoPath} alt="" style={{ width: '100%', borderRadius: 8, maxHeight: 160, objectFit: 'cover' }} />}
            <div className="row">
              <strong>{l.foodName}</strong>
              <span className="badge">{l.dietaryType}</span>
              {l.ngoSuitable && <span className="badge warn">NGO-suitable</span>}
              {l.status === 'FULLY_CLAIMED' && <span className="badge danger">Fully claimed</span>}
            </div>
            <p>{l.foodDetails}</p>
            <p className="muted">
              {l.portionsRemaining} of {l.totalPortions} portions remaining · ⏰ {timeRemaining(l.collectionDeadline)}
              <br />📍 {l.pickupLocationText}
              <br />By {l.providerName}
            </p>
            <Link className="btn" to={`/listings/${l.id}`}>{t('viewClaim')}</Link>
          </div>
        ))}
      </div>
    </section>
  );
}
