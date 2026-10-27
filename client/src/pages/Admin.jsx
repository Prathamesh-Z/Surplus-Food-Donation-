import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export function Admin() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [listings, setListings] = useState([]);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState('');

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

  async function act(path, body = {}) {
    try {
      await api(path, { method: 'POST', body });
      load();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  return (
    <section>
      <h1>Admin</h1>
      {error && <div className="error">{error}</div>}
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
          <button onClick={() => act(`/api/admin/ngo/${p.userId}/verify`)}>Verify NGO</button>
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
            {u.ngoProfile && (
              <span className={`badge ${u.ngoProfile.verificationStatus === 'VERIFIED' ? '' : 'warn'}`}>
                NGO {u.ngoProfile.verificationStatus}
              </span>
            )}
            {u.suspended && <span className="badge danger">Suspended</span>}
            <span className="muted">{u.email} · {u.mobile}</span>
          </div>
          {u.role !== 'ADMIN' &&
            (u.suspended ? (
              <button className="secondary" onClick={() => act(`/api/admin/users/${u.id}/unsuspend`)}>Unsuspend</button>
            ) : (
              <button
                className="danger"
                onClick={() => {
                  const reason = window.prompt('Reason for suspension?');
                  if (reason) act(`/api/admin/users/${u.id}/suspend`, { reason });
                }}
              >
                Suspend
              </button>
            ))}
          {u.ngoProfile?.verificationStatus === 'VERIFIED' && (
            <button className="secondary" onClick={() => act(`/api/admin/ngo/${u.id}/unverify`, {})}>Unverify NGO</button>
          )}
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
                if (reason) act(`/api/admin/listings/${l.id}/remove`, { reason });
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
    </section>
  );
}
