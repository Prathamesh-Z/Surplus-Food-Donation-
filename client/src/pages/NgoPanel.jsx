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
  const [docFile, setDocFile] = useState(null);
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

  // Verification documents: client-side checks mirror the server's
  // (PDF/JPEG/PNG/WebP, 20 MB max) so mistakes surface before uploading;
  // the server re-validates type by magic bytes and size by multer.
  // XHR is used for real upload progress on large files.
  function uploadDoc() {
    if (!docFile) return;
    const okTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!okTypes.includes(docFile.type)) {
      setDocError('Document must be a PDF, JPEG, PNG or WebP file');
      return;
    }
    if (docFile.size > 20 * 1024 * 1024) {
      setDocError('Document exceeds the 20 MB size limit');
      return;
    }
    setDocError('');
    setDocMsg('');
    setUploading(true);
    setProgress(0);
    const form = new FormData();
    form.append('file', docFile);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ngo/documents');
    xhr.setRequestHeader('Authorization', `Bearer ${getAccessToken()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 201) {
        setDocFile(null);
        setDocMsg('Document uploaded — an admin can view it during verification.');
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
        Upload your registration certificate or supporting documents (PDF, JPEG, PNG or WebP,
        up to 20 MB each). They are stored privately — only admins reviewing your verification
        can access them.
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
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => {
            setDocFile(e.target.files?.[0] ?? null);
            setDocError('');
            setDocMsg('');
          }}
        />
        {docFile && (
          <p className="muted">Selected: {docFile.name} ({(docFile.size / (1024 * 1024)).toFixed(2)} MB)</p>
        )}
        {uploading && (
          <div style={{ height: 6, background: '#eef3ea', borderRadius: 3, margin: '8px 0' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#2e7d32', borderRadius: 3 }} />
          </div>
        )}
        {docError && <div className="error">{docError}</div>}
        {docMsg && <p className="success">{docMsg}</p>}
        <button type="button" onClick={uploadDoc} disabled={!docFile || uploading}>
          {uploading ? `Uploading… ${progress}%` : 'Upload document'}
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
