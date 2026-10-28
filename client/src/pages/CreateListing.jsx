import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authedFetch, recognizeFood } from '../lib/api.js';
import { CHECKLIST } from '../lib/checklist.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { CameraCapture } from '../components/CameraCapture.jsx';

const ALL_IDS = CHECKLIST.map(([id]) => id);

function todayStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Split 12-hour date/time entry (feature request): separate date field and
// hour/minute/AM-PM selects — no 24-hour clock anywhere on this form.
function SplitDateTime({ label, date, setDate, time, setTime }) {
  const set = (k) => (e) => setTime({ ...time, [k]: e.target.value });
  return (
    <fieldset style={{ border: '1px solid #d9e8d2', borderRadius: 10, margin: '0 0 12px', padding: '10px 12px' }}>
      <legend style={{ fontWeight: 600, fontSize: 14 }}>{label}</legend>
      <div className="row">
        <label style={{ flex: '1 1 160px' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          <select value={time.hh} onChange={set('hh')} style={{ width: 76 }}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </label>
        <span>:</span>
        <label>
          <select value={time.mm} onChange={set('mm')} style={{ width: 76 }}>
            {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          <select value={time.ap} onChange={set('ap')} style={{ width: 82 }}>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </label>
      </div>
    </fieldset>
  );
}

function toISO(dateStr, { hh, mm, ap }) {
  let h = Number(hh) % 12;
  if (ap === 'PM') h += 12;
  const d = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${mm}:00`);
  return d.toISOString();
}

function nowParts(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0');
  return { date: todayStr(d), time: { hh: String(h), mm, ap } };
}

export function CreateListing() {
  const navigate = useNavigate();
  const { t } = useLang();
  const cookedInit = nowParts(-60);
  const deadlineInit = nowParts(180);
  const savedUser = JSON.parse(localStorage.getItem('fws_user') ?? 'null');
  const savedLocObj = (() => {
    try { return JSON.parse(localStorage.getItem('fws_location') ?? 'null'); }
    catch { return null; }
  })();
  const savedLocation = savedLocObj?.label ?? '';
  const [form, setForm] = useState({
    foodName: '',
    foodDetails: '',
    category: 'COOKED_MEALS',
    categoryNote: '',
    dietaryType: 'VEG',
    portionType: 'INDIVIDUAL_MEALS',
    bulkUnit: 'KILOGRAMS',
    totalPortions: 50,
    ngoSuitable: false,
    pickupLocationText: savedLocation,
    contactPhone: savedUser?.mobile ?? '',
    showContact: false,
  });
  const [cookedDate, setCookedDate] = useState(cookedInit.date);
  const [cookedTime, setCookedTime] = useState(cookedInit.time);
  const [deadlineDate, setDeadlineDate] = useState(deadlineInit.date);
  const [deadlineTime, setDeadlineTime] = useState(deadlineInit.time);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [error, setError] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  /** Recognition (PRD v3.3): { status: idle|loading|done|error, result, error } */
  const [detect, setDetect] = useState({ status: 'idle', result: null, error: '' });
  const [locating, setLocating] = useState(false);
  // v3.5: exact pickup point for THIS listing (nullable). Seeded from the
  // app-level saved location when it carries coordinates; the form's own
  // "Use current location" can set it precisely. Editing the address text
  // by hand clears it, because the text may no longer match the point.
  const [pickupCoords, setPickupCoords] = useState(
    typeof savedLocObj?.lat === 'number' && typeof savedLocObj?.lng === 'number'
      ? { lat: savedLocObj.lat, lng: savedLocObj.lng }
      : null
  );
  const [cameraOpen, setCameraOpen] = useState(false);
  const detectSeq = useRef(0);

  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function onCameraCapture(file) {
    setCameraOpen(false);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  // v3.4: recognition starts AUTOMATICALLY when an image is chosen or
  // captured — there is no Detect button. The sequence token drops stale
  // results when the image changes quickly, so no duplicate/out-of-order
  // applications can occur.
  useEffect(() => {
    if (!photoFile) return;
    const seq = ++detectSeq.current;
    runDetect(photoFile, seq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoFile]);

  /** Apply one enriched prediction (primary or alternative) to the form. */
  function applySuggestion(name, description, category, categoryNote) {
    setForm((f) => ({
      ...f,
      foodName: name,
      foodDetails: description ?? f.foodDetails,
      category: category ?? f.category,
      categoryNote: categoryNote ?? f.categoryNote,
    }));
  }

  async function runDetect(file, seq) {
    setDetect({ status: 'loading', result: null, error: '' });
    try {
      const result = await recognizeFood(file);
      if (detectSeq.current !== seq) return; // a newer image superseded this
      if (result.food_name) {
        applySuggestion(result.food_name, result.description, result.category, result.categoryNote);
      }
      setDetect({ status: 'done', result, error: '' });
    } catch (err) {
      if (detectSeq.current !== seq) return;
      setDetect({ status: 'error', result: null, error: err.message });
    }
  }

  async function useCurrentLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError(t('locationFailed'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // The point is captured even if the readable label lookup fails —
        // coordinates are never written into the address text (v3.5).
        setPickupCoords({ lat: latitude, lng: longitude });
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await res.json();
          const text = [data.locality, data.city, data.principalSubdivision]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(', ');
          if (text) setForm((f) => ({ ...f, pickupLocationText: text }));
          else setError(t('locationFailed'));
        } catch {
          setError(t('locationFailed'));
        }
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(t('locationFailed'));
      },
      { timeout: 10000 }
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        foodName: form.foodName,
        foodDetails: form.foodDetails,
        category: form.category,
        categoryNote: form.category === 'OTHER' ? form.categoryNote : undefined,
        dietaryType: form.dietaryType,
        portionType: form.portionType,
        bulkUnit: form.portionType === 'BULK_SERVINGS' ? form.bulkUnit : undefined,
        totalPortions: Number(form.totalPortions),
        ngoSuitable: form.ngoSuitable,
        contactPhone: /^[6-9]\d{9}$/.test(form.contactPhone.trim()) ? form.contactPhone.trim() : undefined,
        showContact: form.showContact,
        pickupLocationText: form.pickupLocationText,
        pickupLat: pickupCoords?.lat,
        pickupLng: pickupCoords?.lng,
        cookedAt: toISO(cookedDate, cookedTime),
        collectionDeadline: toISO(deadlineDate, deadlineTime),
        checklistItems: agreed ? ALL_IDS : [],
      };
      const res = await authedFetch('/api/listings', () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create listing');
      if (photoFile) {
        await authedFetch(`/api/listings/${data.listing.id}/photo`, () => {
          const f = new FormData();
          f.append('photo', photoFile);
          return { method: 'POST', body: f };
        }).catch(() => {});
      }
      if (data.listing.status === 'DRAFT') {
        setError(t('draftWarning'));
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
        {/* ── Photo + AI detection (v3.4: upload or camera, auto-detect) ── */}
        <fieldset style={{ border: '1px solid #d9e8d2', borderRadius: 10, margin: '0 0 14px', padding: '12px' }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>{t('photoDetect')}</legend>
          <div className="row">
            <label className="secondary" style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>
              📁 {t('uploadImage')}
              <input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
            </label>
            <button type="button" className="secondary" onClick={() => setCameraOpen(true)}>
              📷 {t('scanCamera')}
            </button>
          </div>
          {cameraOpen && (
            <CameraCapture onCapture={onCameraCapture} onClose={() => setCameraOpen(false)} />
          )}
          {photoPreview && (
            <div className="row" style={{ alignItems: 'flex-start', marginTop: 10 }}>
              <img src={photoPreview} alt="" style={{ maxWidth: 240, borderRadius: 10 }} />
              <div>
                {detect.status === 'loading' && <p className="muted">🤖 {t('detectWarming')}</p>}
                {detect.status === 'done' && detect.result?.food_name && (
                  <div style={{ marginTop: 8 }}>
                    <p className="success" style={{ margin: '0 0 4px' }}>
                      ✓ {t('detectedAs')}: {detect.result.food_name} ({Math.round(detect.result.confidence * 100)}%)
                    </p>
                    {detect.result.uncertain && <p className="error" style={{ margin: '0 0 4px' }}>{t('detectUncertain')}</p>}
                    {detect.result.alternatives?.length > 0 && (
                      <p className="muted" style={{ margin: '4px 0' }}>
                        {t('detectAlternatives')}:{' '}
                        {detect.result.alternatives.map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            className="secondary"
                            style={{ marginRight: 6, padding: '2px 8px' }}
                            onClick={() => applySuggestion(a.name, a.description, a.category, a.categoryNote)}
                          >
                            {a.name} ({Math.round(a.score * 100)}%)
                          </button>
                        ))}
                      </p>
                    )}
                    {detect.result.specialist?.top?.length > 0 && (
                      <p className="muted" style={{ margin: '4px 0' }}>
                        {t('detectSpecialist')}:{' '}
                        {detect.result.specialist.top.slice(0, 2).map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            className="secondary"
                            style={{ marginRight: 6, padding: '2px 8px' }}
                            onClick={() => applySuggestion(a.name, a.description, a.category, a.categoryNote)}
                          >
                            {a.name} ({Math.round(a.score * 100)}%)
                          </button>
                        ))}
                      </p>
                    )}
                  </div>
                )}
                {detect.status === 'error' && (
                  <p className="error" style={{ marginTop: 8 }}>
                    {detect.error || t('detectionFailed')}{' '}
                    <button
                      type="button"
                      className="secondary"
                      style={{ padding: '2px 8px' }}
                      onClick={() => runDetect(photoFile, ++detectSeq.current)}
                    >
                      {t('detectTryAgain')}
                    </button>
                  </p>
                )}
              </div>
            </div>
          )}
        </fieldset>

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
        {form.category === 'OTHER' && (
          <label>
            Other — {t('category')}
            <input
              value={form.categoryNote}
              onChange={set('categoryNote')}
              placeholder={t('categoryOtherPlaceholder')}
              required
            />
          </label>
        )}
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
        {form.portionType === 'BULK_SERVINGS' && (
          <label>
            {t('bulkUnit')}
            <select value={form.bulkUnit} onChange={set('bulkUnit')}>
              <option value="KILOGRAMS">Kilograms (kg)</option>
              <option value="LITRES">Litres (L)</option>
              <option value="SERVINGS">Servings</option>
              <option value="TRAYS">Trays</option>
              <option value="BOXES">Boxes</option>
            </select>
          </label>
        )}
        <label>
          {form.portionType === 'BULK_SERVINGS' ? t('totalQuantity') : t('totalPortions')}
          <input type="number" min="1" value={form.totalPortions} onChange={set('totalPortions')} required />
        </label>
        <label>
          <input type="checkbox" checked={form.ngoSuitable} onChange={set('ngoSuitable')} style={{ width: 'auto' }} />{' '}
          {t('ngoSuitableLabel')}
        </label>
        <label>
          {t('pickupLocation')}
          <input
            value={form.pickupLocationText}
            onChange={(e) => {
              setForm((f) => ({ ...f, pickupLocationText: e.target.value }));
              setPickupCoords(null);
            }}
            required
          />
        </label>
        <button type="button" className="secondary" onClick={useCurrentLocation} disabled={locating} style={{ marginBottom: 12 }}>
          📍 {locating ? t('locating') : t('useCurrentLocation')}
        </button>
        {pickupCoords && <p className="success" style={{ marginTop: -6 }}>📍 {t('pickupPointSet')}</p>}

        {/* ── Donor contact (v3.4): prefilled from the profile ── */}
        <fieldset style={{ border: '1px solid #d9e8d2', borderRadius: 10, margin: '0 0 14px', padding: '12px' }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>{t('donorContactTitle')}</legend>
          <label>
            {t('contactNumber')}
            <input
              value={form.contactPhone}
              onChange={set('contactPhone')}
              inputMode="numeric"
              placeholder="9812345678"
            />
          </label>
          <p className="muted" style={{ margin: '4px 0' }}>{t('donorContactHint')}</p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={form.showContact}
              onChange={set('showContact')}
            />
            {t('showContactLabel')}
          </label>
        </fieldset>

        <SplitDateTime label={t('cookedAt')} date={cookedDate} setDate={setCookedDate} time={cookedTime} setTime={setCookedTime} />
        <SplitDateTime label={t('deadline')} date={deadlineDate} setDate={setDeadlineDate} time={deadlineTime} setTime={setDeadlineTime} />

        {/* ── Safety checklist as a single agreement + terms popup ── */}
        <div className="card" style={{ marginTop: 6 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {t('agreeTerms')}{' '}
              <a
                href="#terms"
                onClick={(e) => {
                  e.preventDefault();
                  setTermsOpen(true);
                }}
              >
                {t('termsLink')}
              </a>
            </span>
          </label>
        </div>
        <button type="submit">{t('publish')}</button>
      </form>

      {termsOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(20,40,20,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
          }}
          onClick={() => setTermsOpen(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 560, maxHeight: '82vh', overflowY: 'auto', margin: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>{t('termsTitle')}</h2>
            <ol>
              {CHECKLIST.map(([id, text]) => (
                <li key={id} style={{ marginBottom: 8 }}>{text}</li>
              ))}
            </ol>
            <div className="row">
              <button
                onClick={() => {
                  setAgreed(true);
                  setTermsOpen(false);
                }}
              >
                {t('iAgree')}
              </button>
              <button className="secondary" onClick={() => setTermsOpen(false)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
