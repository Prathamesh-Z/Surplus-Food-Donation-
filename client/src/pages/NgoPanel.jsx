import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '../lib/api.js';
import { DocumentStaging } from '../components/DocumentStaging.jsx';
import { uploadDocuments } from '../lib/documents.js';

const DEST_TYPES = ['SHELTER', 'COMMUNITY_KITCHEN', 'OLD_AGE_HOME', 'SCHOOL', 'INDIVIDUALS', 'OTHER'];

export function NgoPanel() {
  const [me, setMe] = useState(null);
  const [claims, setClaims] = useState([]);
  const [entries, setEntries] = useState([]);
  const [forms, setForms] = useState({});
  const [error, setError] = useState('');
  const [docs, setDocs] = useState([]);
  const [staged, setStaged] = useState([]);
  const [docError, setDocError] = useState('');
  const [docMsg, setDocMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function load() {
    try {
      const [meData, claimsData, entriesData, docsData] = await Promise.all([
        api('/api/ngo/me'),
        api('/api/claims/mine'),
        api('/api/ngo/redistributions'),
        api('/api/ngo/documents'),
      ]);
      setDocs(docsData.documents);
      setMe(meData);
      setClaims(claimsData.claims.filter((c) => c.status === 'COLLECTED'));
      setEntries(entriesData.entries);
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Verification documents: files are staged with the shared
  // DocumentStaging picker (validation mirrors the server) and
  // submitted as one batch through the shared uploadDocuments helper;
  // the server re-validates (magic bytes, size) and stores atomically.
  async function submitDocs() {
    if (staged.length === 0 || uploading) return;
    const count = staged.length;
    setDocError('');
    setDocMsg('');
    setUploading(true);
    setProgress(0);
    try {
      await uploadDocuments(staged, setProgress);
      setStaged([]);
      setDocMsg(`${count} document(s) uploaded — an admin can view them during verification.`);
      load();
    } catch (err) {
      setDocError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(id) {
    try {
      await api(`/api/ngo/documents/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function logRedistribution(claimId) {
    const f = forms[claimId] ?? {};
    try {
      await api('/api/ngo/redistributions', {
        method: 'POST',
        body: {
          claimId,
          destinationName: f.name ?? '',
          destinationType: f.type ?? 'SHELTER',
          portions: Number(f.portions ?? 0),
        },
      });
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function removeEntry(id) {
    try {
      await api(`/api/ngo/redistributions/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  const loggedFor = (claimId) =>
    entries.filter((e) => e.claimId === claimId).reduce((s, e) => s + e.portions, 0);

  return (
    <section>
      <h1>NGO panel</h1>
      {error && <div className="error">{error}</div>}
      {me && (
        <div className="card">
          <strong>{me.profile?.organisationName}</strong>{' '}
          {me.verified ? (
            <span className="badge">✓ Verified NGO</span>
          ) : (
            <span className="badge warn">Unverified — an admin can verify your registration details. You can claim and redistribute meanwhile.</span>
          )}
          {!me.verified && (me.profile?.verificationReviewedAt || me.profile?.verificationNote) && (
            <p className="muted" style={{ marginTop: 6 }}>
              Admin review{me.profile?.verificationReviewedAt
                ? ` on ${new Date(me.profile.verificationReviewedAt).toLocaleDateString()}`
                : ''}: your organisation remains unverified.
              {me.profile?.verificationNote && <> Reason given: {me.profile.verificationNote}</>}
              {' '}You can upload more documents below to ask for another review.
            </p>
          )}
        </div>
      )}

      <h2>Verification documents</h2>
      <p className="muted">
        Upload your registration certificate or supporting documents (PDF, JPEG or PNG,
        up to 20 MB each — you can select several at once). They are stored privately —
        only admins reviewing your verification can access them.
      </p>
      {docs.map((d) => (
        <div className="card" key={d.id}>
          <div className="row">
            <span>📄 {d.originalName}</span>
            <span className="muted">{(d.sizeBytes / 1024).toFixed(0)} KB · {new Date(d.createdAt).toLocaleDateString()}</span>
            <button type="button" className="secondary" onClick={() => removeDoc(d.id)}>Remove</button>
          </div>
        </div>
      ))}
      <div className="card">
        <DocumentStaging staged={staged} onChange={setStaged} disabled={uploading} />
        {uploading && (
          <div style={{ height: 6, background: '#eef3ea', borderRadius: 3, margin: '8px 0' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--green-700)', borderRadius: 3 }} />
          </div>
        )}
        {docError && <div className="error">{docError}</div>}
        {docMsg && <p className="success">{docMsg}</p>}
        <button type="button" onClick={submitDocs} disabled={staged.length === 0 || uploading} style={{ marginTop: 8 }}>
          {uploading
            ? `Uploading… ${progress}%`
            : staged.length > 0
              ? `Upload ${staged.length} document(s)`
              : 'Upload documents'}
        </button>
      </div>

      <h2>Log redistribution for collected food</h2>
      {claims.length === 0 && <p className="muted">No collected claims yet. Redistribution can be logged once food is collected.</p>}
      {claims.map((c) => {
        const f = forms[c.id] ?? {};
        const set = (k, v) => setForms({ ...forms, [c.id]: { ...f, [k]: v } });
        return (
          <div className="card" key={c.id}>
            <div className="row">
              <strong>{c.listing.foodName}</strong>
              <span className="muted">
                Collected {c.portionsClaimed} portions · logged {loggedFor(c.id)} · remaining to log{' '}
                {c.portionsClaimed - loggedFor(c.id)}
              </span>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input placeholder="Destination name" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} style={{ maxWidth: 240 }} />
              <select value={f.type ?? 'SHELTER'} onChange={(e) => set('type', e.target.value)}>
                {DEST_TYPES.map((d) => (
                  <option key={d} value={d}>{d.replaceAll('_', ' ')}</option>
                ))}
              </select>
              <input type="number" placeholder="Portions" value={f.portions ?? ''} onChange={(e) => set('portions', e.target.value)} style={{ width: 110 }} />
              <button onClick={() => logRedistribution(c.id)}>Log redistribution</button>
            </div>
          </div>
        );
      })}

      <h2>Redistribution log</h2>
      {entries.length === 0 && <p className="muted">Nothing logged yet.</p>}
      {entries.map((e) => (
        <div className="card" key={e.id}>
          <div className="row">
            <strong>{e.destinationName}</strong>
            <span className="badge">{e.destinationType}</span>
            <span>{e.portions} portions</span>
            <span className="muted">from “{e.claim.listing.foodName}” · {new Date(e.redistributedAt).toLocaleString()}</span>
            <button className="danger" onClick={() => removeEntry(e.id)}>Delete</button>
          </div>
        </div>
      ))}
    </section>
  );
}
