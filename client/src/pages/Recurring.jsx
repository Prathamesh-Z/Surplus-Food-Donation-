import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '../lib/api.js';
import { CHECKLIST } from '../lib/checklist.js';
import { useLang } from '../i18n/LanguageContext.jsx';

// Weekday indices match JS Date#getDay (0 = Sunday). Chips and schedule
// summaries render Monday-first; the stored values never change.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_KEYS = ['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat'];

function DayChips({ value, onChange, labelId }) {
  const { t } = useLang();
  function toggle(day) {
    onChange(value.includes(day) ? value.filter((x) => x !== day) : [...value, day]);
  }
  return (
    <div className="dayChips" role="group" aria-labelledby={labelId}>
      {DAY_ORDER.map((day) => {
        const on = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            className={on ? 'dayChip' : 'dayChip secondary'}
            aria-pressed={on}
            onClick={() => toggle(day)}
          >
            {t(DAY_KEYS[day])}
          </button>
        );
      })}
    </div>
  );
}

export function Recurring() {
  const { t } = useLang();
  const [schedules, setSchedules] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    title: '',
    daysOfWeek: [1, 2, 3, 4, 5],
    generationTimeLocal: '17:00',
    deadlineOffsetMinutes: 180,
    foodName: '',
    foodDetails: '',
    pickupLocationText: '',
  });
  const [draftState, setDraftState] = useState({});
  const [edit, setEdit] = useState(null); // { id, daysOfWeek, generationTimeLocal, deadlineOffsetMinutes }

  async function load() {
    try {
      const [s, mine] = await Promise.all([api('/api/recurring'), api('/api/listings/mine')]);
      setSchedules(s.schedules);
      setDrafts(mine.listings.filter((l) => l.status === 'DRAFT'));
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    try {
      await api('/api/recurring', {
        method: 'POST',
        body: {
          title: form.title,
          daysOfWeek: form.daysOfWeek,
          generationTimeLocal: form.generationTimeLocal,
          deadlineOffsetMinutes: Number(form.deadlineOffsetMinutes),
          template: {
            foodName: form.foodName,
            foodDetails: form.foodDetails,
            category: 'COOKED_MEALS',
            dietaryType: 'VEG',
            portionType: 'INDIVIDUAL_MEALS',
            pickupLocationText: form.pickupLocationText,
          },
        },
      });
      setMessage(t('scheduleSaved'));
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function generateNow() {
    try {
      const res = await api('/api/recurring/generate-now', { method: 'POST', body: {} });
      setMessage(res.created > 0 ? `${t('draftsCreated')}: ${res.created}` : t('noScheduleDue'));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // The PATCH contract covers the schedule's timing only (days, generation
  // time, deadline offset, active) — the template itself is fixed at
  // creation, so Edit edits exactly those fields.
  async function saveEdit() {
    try {
      await api(`/api/recurring/${edit.id}`, {
        method: 'PATCH',
        body: {
          daysOfWeek: edit.daysOfWeek,
          generationTimeLocal: edit.generationTimeLocal,
          deadlineOffsetMinutes: Number(edit.deadlineOffsetMinutes),
        },
      });
      setEdit(null);
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function completeDraft(d) {
    const state = draftState[d.id] ?? { portions: 50, checked: [] };
    try {
      await api(`/api/listings/${d.id}`, { method: 'PATCH', body: { totalPortions: Number(state.portions) } });
      const res = await api(`/api/listings/${d.id}/publish`, {
        method: 'POST',
        body: { checklistItems: state.checked },
      });
      if (res.listing.status !== 'LIVE') throw new Error('Draft did not go live');
      setMessage(t('draftPublished'));
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  return (
    <section>
      <h1>{t('recurring')}</h1>
      <p className="muted">{t('recurringIntro')}</p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <form onSubmit={create} className="card recurForm">
        <h2 style={{ margin: 0 }}>{t('createSchedule')}</h2>
        <label>{t('scheduleName')}<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label>{t('foodNameLabel')}<input value={form.foodName} onChange={(e) => setForm({ ...form, foodName: e.target.value })} required /></label>
        <label>{t('detailsLabel')}<textarea value={form.foodDetails} onChange={(e) => setForm({ ...form, foodDetails: e.target.value })} required /></label>
        <label>{t('pickupLocation')}<input value={form.pickupLocationText} onChange={(e) => setForm({ ...form, pickupLocationText: e.target.value })} required /></label>
        <div>
          <span className="fieldLabel" id="recur-days-label">{t('daysOfWeek')}</span>
          <DayChips labelId="recur-days-label" value={form.daysOfWeek} onChange={(days) => setForm({ ...form, daysOfWeek: days })} />
        </div>
        <label>{t('generationTime')}<input type="time" value={form.generationTimeLocal} onChange={(e) => setForm({ ...form, generationTimeLocal: e.target.value })} /></label>
        <label>{t('draftExpiresAfter')}<input type="number" value={form.deadlineOffsetMinutes} onChange={(e) => setForm({ ...form, deadlineOffsetMinutes: e.target.value })} /></label>
        <div>
          <button type="submit">{t('saveSchedule')}</button>
        </div>
      </form>

      <div className="row" style={{ marginTop: 22 }}>
        <h2 style={{ margin: 0 }}>{t('mySchedules')}</h2>
        <button className="secondary" onClick={generateNow}>{t('generateNow')}</button>
      </div>
      {schedules.map((s) => (
        <div className="card" key={s.id}>
          <div className="row">
            <strong>{s.templateFields?.title}</strong>
            {s.templateFields?.foodName && <span className="muted">{s.templateFields.foodName}</span>}
            <span className={s.active ? 'badge' : 'badge amber'}>{s.active ? t('statusActive') : t('statusPaused')}</span>
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {[...s.daysOfWeek].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => t(DAY_KEYS[d])).join(', ')}
            {' · '}{s.generationTimeLocal} IST · +{s.deadlineOffsetMinutes} min
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="secondary"
              onClick={() =>
                setEdit(
                  edit?.id === s.id
                    ? null
                    : { id: s.id, daysOfWeek: s.daysOfWeek, generationTimeLocal: s.generationTimeLocal, deadlineOffsetMinutes: s.deadlineOffsetMinutes },
                )
              }
            >
              {t('editAction')}
            </button>
            <button className="secondary" onClick={async () => { await api(`/api/recurring/${s.id}`, { method: 'PATCH', body: { active: !s.active } }); load(); }}>
              {s.active ? t('pauseAction') : t('resumeAction')}
            </button>
            <button className="danger" onClick={async () => { await api(`/api/recurring/${s.id}`, { method: 'DELETE' }); load(); }}>{t('deleteAction')}</button>
          </div>
          {edit?.id === s.id && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <div>
                <span className="fieldLabel" id={`edit-days-${s.id}`}>{t('daysOfWeek')}</span>
                <DayChips labelId={`edit-days-${s.id}`} value={edit.daysOfWeek} onChange={(days) => setEdit({ ...edit, daysOfWeek: days })} />
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <label>{t('generationTime')}
                  <input type="time" value={edit.generationTimeLocal} onChange={(e) => setEdit({ ...edit, generationTimeLocal: e.target.value })} />
                </label>
                <label>{t('draftExpiresAfter')}
                  <input type="number" value={edit.deadlineOffsetMinutes} onChange={(e) => setEdit({ ...edit, deadlineOffsetMinutes: e.target.value })} />
                </label>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button onClick={saveEdit}>{t('saveChanges')}</button>
                <button className="secondary" onClick={() => setEdit(null)}>{t('cancelAction')}</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <h2 style={{ marginTop: 22 }}>{t('draftsToComplete')}</h2>
      {drafts.length === 0 && <p className="muted">{t('noDraftsWaiting')}</p>}
      {drafts.map((d) => {
        const state = draftState[d.id] ?? { portions: 50, checked: [] };
        const setState = (next) => setDraftState({ ...draftState, [d.id]: next });
        return (
          <div className="card" key={d.id}>
            <strong>{d.foodName}</strong>{' '}
            <span className="muted">
              {d.createdAt && <>{t('generatedOn')} {new Date(d.createdAt).toLocaleDateString()} · </>}
              {t('deadline')} {new Date(d.collectionDeadline).toLocaleString()}
            </span>
            <div className="row" style={{ marginTop: 8 }}>
              <label>{t('portionsToday')}
                <input type="number" value={state.portions} onChange={(e) => setState({ ...state, portions: e.target.value })} style={{ width: 110 }} />
              </label>
            </div>
            {CHECKLIST.map(([id, text]) => (
              <label key={id} style={{ display: 'block', fontWeight: 400 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={state.checked.includes(id)}
                  onChange={(e) =>
                    setState({
                      ...state,
                      checked: e.target.checked
                        ? [...state.checked, id]
                        : state.checked.filter((c) => c !== id),
                    })
                  }
                />{' '}
                {text}
              </label>
            ))}
            <button onClick={() => completeDraft(d)}>{t('publishOccurrence')}</button>
          </div>
        );
      })}
    </section>
  );
}
