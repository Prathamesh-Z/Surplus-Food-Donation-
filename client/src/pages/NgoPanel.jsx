import React, { useEffect, useState } from 'react';
import { api, formatApiError, getAccessToken } from '../lib/api.js';

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

  // Verification documents: files are STAGED first — each selected file
  // is validated on selection (PDF/JPEG/PNG, 20 MB max, mirroring the
  // server) and listed with its size so it can be removed before
  // submission; invalid files are refused with a message naming them,
  // never silently dropped. Submission sends the whole batch at once;
  // the server re-validates (magic bytes, size) and stores it
  // atomically. XHR is used for real upload progress on large batches.
  const DOC_OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
  const DOC_MAX_BYTES = 20 * 1024 * 1024;

  function stageFiles(fileList) {
    const rejected = [];
    const accepted = [];
    for (const f of fileList ?? []) {
      if (!DOC_OK_TYPES.includes(f.type)) {
        rejected.push(`${f.name} — must be a PDF, JPEG or PNG file`);
      } else if (f.size > DOC_MAX_BYTES) {
        rejected.push(`${f.name} — exceeds the 20 MB size limit`);
      } else {
        accepted.push(f);
      }
    }
    if (accepted.length) setStaged((prev) => [...prev, ...accepted].slice(0, 10));
    setDocError(rejected.join('; '));
    setDocMsg('');
  }

  function submitDocs() {
    if (staged.length === 0 || uploading) return;
    const count = staged.length;
    setDocError('');
    setDocMsg('');
    setUploading(true);
    setProgress(0);
    const form = new FormData();
    for (const f of staged) form.append('file', f);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ngo/documents');
    xhr.setRequestHeader('Authorization', `Bearer ${getAccessToken()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 201) {
        setStaged([]);
        setDocMsg(`${count} document(s) uploaded — an admin can view them during verification.`);
        load();
      } else {
        try {
          setDocError(JSON.parse(xhr.responseText).error || 'Upload failed');
        } catch {
          setDocError('Upload failed');
        }
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setDocError('Upload failed — check your connection.');
    };
    xhr.send(form);
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
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => {
            stageFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {staged.map((f, i) => (
          <div className="row" key={`${f.name}-${i}`} style={{ marginTop: 6 }}>
            <span>📄 {f.name}</span>
            <span className="muted">{(f.size / (1024 * 1024)).toFixed(2)} MB</span>
            <button
              type="button"
              className="secondary"
              disabled={uploading}
              onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        {uploading && (
          <div style={{ height: 6, background: '#eef3ea', borderRadius: 3, margin: '8px 0' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#2e7d32', borderRadius: 3 }} />
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
