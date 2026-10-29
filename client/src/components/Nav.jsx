import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getAccessToken, clearTokens } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';

export function Nav() {
  const loggedIn = Boolean(getAccessToken());
  const user = JSON.parse(localStorage.getItem('fws_user') ?? 'null');
  const { lang, setLang, t } = useLang();
  const { location, openPrompt } = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  // Unread-notification badge (v3.6): same 15-second polling cadence as
  // the Notifications page (PRD FR-14 — in-app only, no push).
  useEffect(() => {
    if (!loggedIn) return;
    let live = true;
    const poll = () =>
      api('/api/notifications')
        .then((d) => { if (live) setUnreadCount(d.unreadCount ?? 0); })
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 15000);
    return () => { live = false; clearInterval(timer); };
  }, [loggedIn]);
  return (
    <header className="nav">
      <Link to="/" className="brand">🥗 {t('appName')}</Link>
      <button
        type="button"
        className="secondary"
        onClick={openPrompt}
        title={t('yourLocation')}
        style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        📍 {location?.label ?? t('locPromptTitle')} ✎
      </button>
      <nav>
        <Link to="/browse">{t('browse')}</Link>
        <Link to="/impact">Live impact</Link>
        {loggedIn ? (
          <>
            <Link to="/dashboard">{t('dashboard')}</Link>
            {(user?.role === 'PROVIDER') && <Link to="/listings/new">{t('postFood')}</Link>}
            {(user?.role === 'PROVIDER') && <Link to="/my-listings">{t('myListings')}</Link>}
            {(user?.role === 'PROVIDER') && <Link to="/recurring">{t('recurring')}</Link>}
            {(user?.role === 'CLAIMER' || user?.role === 'NGO') && <Link to="/my-claims">{t('myClaims')}</Link>}
            {user?.role === 'NGO' && <Link to="/ngo">NGO panel</Link>}
            {user?.role === 'ADMIN' && <Link to="/admin">{t('admin')}</Link>}
            <Link to="/notifications">
              {t('notifications')}
              {unreadCount > 0 && (
                <span className="badge danger" style={{ marginLeft: 6 }}>{unreadCount}</span>
              )}
            </Link>
            <Link to="/profile">{t('profile')}</Link>
            <button
              onClick={() => {
                clearTokens();
                localStorage.removeItem('fws_user');
                window.location.href = '/';
              }}
            >
              {t('logout')}
            </button>
          </>
        ) : (
          <>
            <Link to="/login">{t('login')}</Link>
            <Link to="/register">{t('register')}</Link>
          </>
        )}
        <button
          className="secondary"
          title="Switch language / भाषा बदला / भाषा बदलें"
          onClick={() => setLang(lang === 'en' ? 'mr' : lang === 'mr' ? 'hi' : 'en')}
        >
          {lang === 'en' ? 'मराठी' : lang === 'mr' ? 'हिन्दी' : 'English'}
        </button>
      </nav>
    </header>
  );
}
