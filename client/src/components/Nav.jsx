import React from 'react';
import { Link } from 'react-router-dom';
import { getAccessToken, clearTokens } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

export function Nav() {
  const loggedIn = Boolean(getAccessToken());
  const user = JSON.parse(localStorage.getItem('fws_user') ?? 'null');
  const { lang, setLang, t } = useLang();
  return (
    <header className="nav">
      <Link to="/" className="brand">🥗 {t('appName')}</Link>
      <nav>
        <Link to="/browse">{t('browse')}</Link>
        <Link to="/impact">Live impact</Link>
        {loggedIn ? (
          <>
            <Link to="/dashboard">{t('dashboard')}</Link>
            {(user?.role === 'PROVIDER') && <Link to="/my-listings">{t('myListings')}</Link>}
            {(user?.role === 'PROVIDER') && <Link to="/recurring">{t('recurring')}</Link>}
            {(user?.role === 'CLAIMER' || user?.role === 'NGO') && <Link to="/my-claims">{t('myClaims')}</Link>}
            {user?.role === 'NGO' && <Link to="/ngo">NGO panel</Link>}
            {user?.role === 'ADMIN' && <Link to="/admin">{t('admin')}</Link>}
            <Link to="/notifications">{t('notifications')}</Link>
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
          title="Switch language / भाषा बदला"
          onClick={() => setLang(lang === 'en' ? 'mr' : 'en')}
        >
          {lang === 'en' ? 'मराठी' : 'English'}
        </button>
      </nav>
    </header>
  );
}
