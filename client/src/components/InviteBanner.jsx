import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';

// Invite landing banner: when a visitor opens the app with ?invite=<code>,
// the code is remembered (localStorage) so registration attributes the
// signup, and a banner names the inviter when the code resolves. The banner
// shows only to logged-out visitors; dismissing it clears the stored code.
const STORAGE_KEY = 'fws_invite_code';

export function InviteBanner() {
  const { loggedIn } = useAuth();
  const { t } = useLang();
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [inviterName, setInviterName] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('invite');
      if (param?.trim()) {
        const clean = param.trim().toUpperCase();
        localStorage.setItem(STORAGE_KEY, clean);
        setCode(clean);
        setDismissed(false);
      }
    } catch {
      /* storage/URL unavailable — banner simply stays hidden */
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    let live = true;
    fetch(`/api/auth/invite/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => {
        if (live && d.valid) setInviterName(d.inviterName || '');
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [code]);

  function dismiss() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  if (loggedIn || dismissed || !code) return null;
  return (
    <div className="success" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <span>
        <strong>{t('inviteBannerTitle')}</strong>
        {inviterName ? ` ${t('invitedBy')} ${inviterName}.` : ''}
        {` ${t('inviteBannerCta')}`}
      </span>
      <span style={{ display: 'inline-flex', gap: 8, flexShrink: 0 }}>
        <Link className="btn" to="/register">Register</Link>
        <button type="button" className="secondary" onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </span>
    </div>
  );
}
