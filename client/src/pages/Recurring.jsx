import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '../lib/api.js';
import { CHECKLIST } from '../lib/checklist.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Recurring() {
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
      setMessage('Schedule saved. Occurrences appear as DRAFTS on the chosen days — never auto-published.');
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function generateNow() {
    try {
      const res = await api('/api/recurring/generate-now', { method: 'POST', body: {} });
      setMessage(res.created > 0 ? `Created ${res.created} draft occurrence(s).` : 'No schedule is due right now.');
      load();
    } catch (err) {
      setError(err.message);
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
      setMessage(`“${d.foodName}” is live.`);
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  return (
    <section>
      <h1>Recurring donations</h1>
      <p className="muted">
        A schedule creates a <strong>draft</strong> on each chosen day. You always set that day's
        portions and confirm the food-safety checklist yourself — nothing is ever auto-published.
      </p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <form onSubmit={create} className="card">
        <label>Schedule title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label>Food name (template)<input value={form.foodName} onChange={(e) => setForm({ ...form, foodName: e.target.value })} required /></label>
        <label>Details<textarea value={form.foodDetails} onChange={(e) => setForm({ ...form, foodDetails: e.target.value })} required /></label>
        <label>Pickup location (text)<input value={form.pickupLocationText} onChange={(e) => setForm({ ...form, pickupLocationText: e.target.value })} required /></label>
        <div className="row">
          {DAYS.map((d, i) => (
            <label key={d} style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.daysOfWeek.includes(i)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    daysOfWeek: e.target.checked
                      ? [...form.daysOfWeek, i]
                      : form.daysOfWeek.filter((x) => x !== i),
                  })
                }
              />{' '}
              {d}
            </label>
          ))}
        </div>
        <label>Generate draft at (IST)<input type="time" value={form.generationTimeLocal} onChange={(e) => setForm({ ...form, generationTimeLocal: e.target.value })} /></label>
        <label>Deadline offset (minutes after generation)<input type="number" value={form.deadlineOffsetMinutes} onChange={(e) => setForm({ ...form, deadlineOffsetMinutes: e.target.value })} /></label>
        <button type="submit">Save schedule</button>
      </form>

      <div className="row">
        <h2 style={{ margin: 0 }}>My schedules</h2>
        <button className="secondary" onClick={generateNow}>Generate due occurrences now</button>
      </div>
      {schedules.map((s) => (
        <div className="card" key={s.id}>
          <div className="row">
            <strong>{s.templateFields?.title}</strong>
            <span className="badge">{s.active ? 'Active' : 'Paused'}</span>
            <span className="muted">
              {s.daysOfWeek.map((d) => DAYS[d]).join(', ')} at {s.generationTimeLocal} IST · deadline +{s.deadlineOffsetMinutes} min
            </span>
            <button className="secondary" onClick={async () => { await api(`/api/recurring/${s.id}`, { method: 'PATCH', body: { active: !s.active } }); load(); }}>
              {s.active ? 'Pause' : 'Resume'}
            </button>
            <button className="danger" onClick={async () => { await api(`/api/recurring/${s.id}`, { method: 'DELETE' }); load(); }}>Delete</button>
          </div>
        </div>
      ))}

      <h2>Draft occurrences to complete</h2>
      {drafts.length === 0 && <p className="muted">No drafts waiting.</p>}
      {drafts.map((d) => {
        const state = draftState[d.id] ?? { portions: 50, checked: [] };
        const setState = (next) => setDraftState({ ...draftState, [d.id]: next });
        return (
          <div className="card" key={d.id}>
            <strong>{d.foodName}</strong>{' '}
            <span className="muted">deadline {new Date(d.collectionDeadline).toLocaleString()}</span>
            <div className="row" style={{ marginTop: 8 }}>
              <label>Portions today
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
            <button onClick={() => completeDraft(d)}>Publish today's occurrence</button>
          </div>
        );
      })}
    </section>
  );
}
