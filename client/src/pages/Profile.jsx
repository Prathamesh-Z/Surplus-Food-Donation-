import React, { useEffect, useState } from 'react';
import { api, formatApiError } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

/**
 * Profile / account settings (v3.4): account details (read-only) + the
 * saved contact number, editable with the same validation as registration.
 * The number pre-fills the Donor Contact section on the posting form.
 */
export function Profile() {
  const { t } = useLang();
  const [user, setUser] = useState(null);
  const [mobile, setMobile] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api('/api/auth/me')
      .then((d) => {
        setUser(d.user);
        setMobile(d.user.mobile ?? '');
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      setError(t('contactInvalid'));
      return;
    }
    try {
      const res = await api('/api/users/me/contact', {
        method: 'PATCH',
        body: { mobile: mobile.trim() },
      });
      setMobile(res.mobile);
      setMsg(t('contactSaved'));
      const stored = JSON.parse(localStorage.getItem('fws_user') ?? 'null');
      if (stored) {
        stored.mobile = res.mobile;
        localStorage.setItem('fws_user', JSON.stringify(stored));
      }
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  if (!user) return <p className="muted">{error || '…'}</p>;
  return (
    <section>
      <h1>{t('profile')}</h1>
      <h3>{t('accountDetails')}</h3>
      <p>
        <strong>{user.name}</strong> · {user.email} · {user.role}
        {user.ngoProfile ? ` · ${user.ngoProfile.organisationName}` : ''}
      </p>
      <form onSubmit={save} style={{ maxWidth: 420 }}>
        <label>
          {t('contactNumber')}
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            inputMode="numeric"
            placeholder="9812345678"
            required
          />
        </label>
        {msg && <p className="success">{msg}</p>}
        {error && <div className="error">{error}</div>}
        <button type="submit">{t('save')}</button>
      </form>
      {user.inviteCode && (
        <>
          <h3>{t('inviteFriends')}</h3>
          <p className="muted">{t('inviteLinkHint')}</p>
          <p style={{ wordBreak: 'break-all' }}>
            {`${window.location.origin}/?invite=${user.inviteCode}`}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                const link = `${window.location.origin}/?invite=${user.inviteCode}`;
                let ok = false;
                try {
                  await navigator.clipboard.writeText(link);
                  ok = true;
                } catch {
                  try {
                    const ta = document.createElement('textarea');
                    ta.value = link;
                    document.body.appendChild(ta);
                    ta.select();
                    ok = document.execCommand('copy');
                    document.body.removeChild(ta);
                  } catch {
                    ok = false;
                  }
                }
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? t('copied') : t('copyLink')}
            </button>
            <a
              className="btn secondary"
              href={`https://wa.me/?text=${encodeURIComponent(`${t('inviteShareText')} ${window.location.origin}/?invite=${user.inviteCode}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('shareOnWhatsApp')}
            </a>
          </div>
          <p className="muted">
            {t('invitedCount')}: {user.invitesCount ?? 0}
          </p>
        </>
      )}
    </section>
  );
}
