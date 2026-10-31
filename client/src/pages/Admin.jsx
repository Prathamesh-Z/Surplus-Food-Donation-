import React, { useEffect, useRef, useState } from 'react';
import { api, formatApiError, getAccessToken } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

export function Admin() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [listings, setListings] = useState([]);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // Delete confirmation (same dialog pattern as the logout confirm):
  // holds the user row awaiting confirmation, or null.
  const [pendingDelete, setPendingDelete] = useState(null);
  const cancelDeleteRef = useRef(null);

  useEffect(() => {
    if (!pendingDelete) return;
    cancelDeleteRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') setPendingDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    setError('');
    setMsg('');
    try {
      await api(`/api/admin/users/${target.id}`, { method: 'DELETE' });
      setMsg('User deleted.');
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  async function load() {
    try {
      const [s, p, a] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/admin/ngo/pending'),
        api('/api/admin/audit'),
      ]);
      setStats(s);
      setPending(p.pending);
      setAudit(a.audit);
      const l = await api('/api/listings?availableOnly=false');
      setListings(l.listings);
      await searchUsers('');
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchUsers(query) {
    const data = await api(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    setUsers(data.users);
  }

  async function act(path, body = {}, successText = '') {
    setError('');
    setMsg('');
    try {
      await api(path, { method: 'POST', body });
      if (successText) setMsg(successText);
      load();
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  // Verification documents are private: the download goes through the
  // admin-only endpoint with the access token, never a public URL.
  async function downloadDoc(doc) {
    try {
      const res = await fetch(`/api/admin/ngo-documents/${doc.id}`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download the document.');
    }
  }

  return (
    <section>
      <h1>Admin</h1>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}
      {stats && (
        <div className="grid">
          <div className="card"><strong>{stats.totalUsers}</strong><div className="muted">Users</div></div>
          <div className="card"><strong>{stats.platform.listingsCreated}</strong><div className="muted">Listings created</div></div>
          <div className="card"><strong>{stats.platform.portionsCollected}</strong><div className="muted">Portions collected</div></div>
          <div className="card"><strong>{stats.pendingNgoVerifications}</strong><div className="muted">NGO verifications pending</div></div>
          <div className="card"><strong>{stats.suspendedUsers}</strong><div className="muted">Suspended users</div></div>
        </div>
      )}

      <h2>NGO verification queue</h2>
      {pending.length === 0 && <p className="muted">No NGOs waiting for verification.</p>}
      {pending.map((p) => (
        <div className="card" key={p.id}>
          <div className="row">
            <strong>{p.organisationName}</strong>
            <span className="muted">{p.user.name} · {p.user.email} · {p.user.mobile}</span>
          </div>
          <p className="muted">Registration detail provided: {p.registrationDetail}</p>
          {p.documents?.length > 0 && (
            <div style={{ margin: '6px 0' }}>
              <span className="muted">Verification documents:</span>
              {p.documents.map((d) => (
                <div className="row" key={d.id}>
                  <span>📄 {d.originalName}</span>
                  <span className="muted">{(d.sizeBytes / 1024).toFixed(0)} KB · {new Date(d.createdAt).toLocaleDateString()}</span>
                  <button type="button" className="secondary" onClick={() => downloadDoc(d)}>Download</button>
                </div>
              ))}
            </div>
          )}
          {p.verificationNote && (
            <p className="muted">Previous review note: {p.verificationNote}</p>
          )}
          <div className="adminActions">
            <button onClick={() => act(`/api/admin/ngo/${p.userId}/verify`, {}, 'NGO verified.')}>Verify NGO</button>
            <button
              className="caution"
              onClick={() => {
                const reason = window.prompt('Reason for keeping this NGO unverified (optional)?');
                if (reason === null) return;
                act(
                  `/api/admin/ngo/${p.userId}/keep-unverified`,
                  { reason: reason.trim() || undefined },
                  'NGO kept unverified — the decision was shared with the NGO.'
                );
              }}
            >
              Keep Unverified
            </button>
          </div>
        </div>
      ))}

      <h2>Users</h2>
      <div className="row">
        <input placeholder="Search name, email or mobile" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <button className="secondary" onClick={() => searchUsers(q)}>Search</button>
      </div>
      {users.map((u) => (
        <div className="card" key={u.id}>
          <div className="row">
            <strong>{u.name}</strong>
            <span className="badge">{u.role}</span>
            <span className="badge">{u.accountType}</span>
            {u.isMainAdmin && <span className="badge">Main admin</span>}
            {u.ngoProfile && (
              <span className={`badge ${u.ngoProfile.verificationStatus === 'VERIFIED' ? '' : 'warn'}`}>
                NGO {u.ngoProfile.verificationStatus}
              </span>
            )}
            {u.suspended && <span className="badge danger">Suspended</span>}
            <span className="muted">{u.email} · {u.mobile}</span>
          </div>
          <div className="adminActions">
            {u.role !== 'ADMIN' &&
              (u.suspended ? (
                <button className="secondary" onClick={() => act(`/api/admin/users/${u.id}/unsuspend`, {}, 'User unsuspended.')}>Unsuspend</button>
              ) : (
                <button
                  className="danger"
                  onClick={() => {
                    const reason = window.prompt('Reason for suspension?');
                    if (reason) act(`/api/admin/users/${u.id}/suspend`, { reason }, 'User suspended.');
                  }}
                >
                  Suspend
                </button>
              ))}
            {u.ngoProfile?.verificationStatus === 'VERIFIED' && (
              <button className="caution" onClick={() => act(`/api/admin/ngo/${u.id}/unverify`, {}, 'NGO unverified.')}>Unverify NGO</button>
            )}
            {u.id !== me?.id && u.accountType === 'USER' && (
              <button className="secondary" onClick={() => act(`/api/admin/users/${u.id}/promote`, {}, 'User promoted to admin.')}>Promote to admin</button>
            )}
            {u.id !== me?.id && !u.isMainAdmin && (u.accountType === 'ADMIN' || u.role === 'ADMIN') && (
              <button className="caution" onClick={() => act(`/api/admin/users/${u.id}/demote`, {}, 'Admin demoted to user.')}>Demote to user</button>
            )}
            {u.id !== me?.id && !u.isMainAdmin && (
              <button className="danger" onClick={() => setPendingDelete(u)}>Delete user</button>
            )}
          </div>
        </div>
      ))}

      <h2>Listings (remove with reason)</h2>
      {listings.map((l) => (
        <div className="card" key={l.id}>
          <div className="row">
            <strong>{l.foodName}</strong>
            <span className="badge">{l.status}</span>
            <span className="muted">by {l.providerName}</span>
            <button
              className="danger"
              onClick={() => {
                const reason = window.prompt('Reason for removal?');
                if (reason) act(`/api/admin/listings/${l.id}/remove`, { reason }, 'Listing removed.');
              }}
            >
              Remove listing
            </button>
          </div>
        </div>
      ))}

      <h2>Audit log (append-only)</h2>
      {audit.length === 0 && <p className="muted">No admin actions recorded yet.</p>}
      {audit.map((a) => (
        <div className="card" key={a.id}>
          <span className="badge">{a.action}</span>{' '}
          {a.targetType} {a.targetId.slice(0, 8)}… by {a.admin.name}
          {a.reason ? ` — “${a.reason}”` : ''}{' '}
          <span className="muted">{new Date(a.createdAt).toLocaleString()}</span>
        </div>
      ))}

      {pendingDelete && (
        <div
          onClick={() => setPendingDelete(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(20, 35, 18, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 1000,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-confirm-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: '22px 20px',
              width: '100%', maxWidth: 380,
              boxShadow: '0 12px 40px rgba(0,0,0,0.35)', textAlign: 'center',
            }}
          >
            <h2 id="delete-user-confirm-title" style={{ margin: '4px 0 6px', fontSize: 20 }}>
              Delete this user?
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {pendingDelete.name} · {pendingDelete.email}
              <br />
              Their listings, claims, notifications and other account data
              will be permanently deleted. This cannot be undone.
            </p>
            <div className="row" style={{ marginTop: 16, justifyContent: 'center', gap: 10 }}>
              <button
                type="button"
                className="secondary"
                ref={cancelDeleteRef}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmDelete}>
                Delete user
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
