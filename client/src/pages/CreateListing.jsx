import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAccessToken } from '../lib/api.js';
import { CHECKLIST } from '../lib/checklist.js';
import { useLang } from '../i18n/LanguageContext.jsx';

function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateListing() {
  const { t } = useLang();
  const navigate = useNavigate();
  const now = new Date();
  const [form, setForm] = useState({
    foodName: '',
    foodDetails: '',
    category: 'COOKED_MEALS',
    dietaryType: 'VEG',
    portionType: 'INDIVIDUAL_MEALS',
    totalPortions: 50,
    ngoSuitable: false,
    pickupLocationText: '',
    cookedAt: toLocalInput(new Date(now.getTime() - 3600e3)),
    collectionDeadline: toLocalInput(new Date(now.getTime() + 3 * 3600e3)),
  });
  const [checked, setChecked] = useState([]);
  const [error, setError] = useState('');
  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...form,
        totalPortions: Number(form.totalPortions),
        cookedAt: new Date(form.cookedAt).toISOString(),
        collectionDeadline: new Date(form.collectionDeadline).toISOString(),
        checklistItems: checked,
      };
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create listing');
      if (data.listing.status === 'DRAFT') {
        setError('Saved as DRAFT — all 8 safety items must be confirmed before the listing can go live.');
        return;
      }
      navigate('/my-listings');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <h1>{t('createListingTitle')}</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        <label>{t('foodName')}<input value={form.foodName} onChange={set('foodName')} required /></label>
        <label>{t('details')}<textarea value={form.foodDetails} onChange={set('foodDetails')} required /></label>
        <label>
          {t('category')}
          <select value={form.category} onChange={set('category')}>
            <option value="COOKED_MEALS">Cooked meals</option>
            <option value="RAW_PRODUCE">Raw produce</option>
            <option value="BAKERY">Bakery</option>
            <option value="DAIRY">Dairy</option>
            <option value="PACKAGED_FOOD">Packaged food</option>
            <option value="BEVERAGES">Beverages</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          {t('dietaryType')}
          <select value={form.dietaryType} onChange={set('dietaryType')}>
            <option value="VEG">Veg</option>
            <option value="NON_VEG">Non-veg</option>
            <option value="VEGAN">Vegan</option>
          </select>
        </label>
        <label>
          {t('portionType')}
          <select value={form.portionType} onChange={set('portionType')}>
            <option value="INDIVIDUAL_MEALS">Individual meals</option>
            <option value="BULK_SERVINGS">Bulk servings</option>
            <option value="KILOGRAMS">Kilograms</option>
            <option value="LITRES">Litres</option>
            <option value="PACKETS">Packets</option>
          </select>
        </label>
        <label>{t('totalPortions')}<input type="number" min="1" value={form.totalPortions} onChange={set('totalPortions')} required /></label>
        <label>
          <input type="checkbox" checked={form.ngoSuitable} onChange={set('ngoSuitable')} style={{ width: 'auto' }} />{' '}
          {t('ngoSuitableLabel')}
        </label>
        <label>{t('pickupLocation')} (text)<input value={form.pickupLocationText} onChange={set('pickupLocationText')} required /></label>
        <label>{t('cookedAt')}<input type="datetime-local" value={form.cookedAt} onChange={set('cookedAt')} required /></label>
        <label>{t('deadline')}<input type="datetime-local" value={form.collectionDeadline} onChange={set('collectionDeadline')} required /></label>

        <fieldset>
          <legend><strong>{t('checklistTitle')}</strong></legend>
          {CHECKLIST.map(([id, text]) => (
            <label key={id} style={{ display: 'block', fontWeight: 400 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={checked.includes(id)}
                onChange={(e) =>
                  setChecked(e.target.checked ? [...checked, id] : checked.filter((c) => c !== id))
                }
              />{' '}
              {text}
            </label>
          ))}
        </fieldset>
        <button type="submit">{t('publish')}</button>
      </form>
    </section>
  );
}
