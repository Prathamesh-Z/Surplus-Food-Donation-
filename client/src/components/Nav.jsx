import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../lib/NotificationsContext.jsx';
import { hasUsableCoords } from '../lib/location.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Avatar } from './Avatar.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useLocation } from '../location/LocationContext.jsx';

export function Nav() {
  // QA-01: auth state now comes from context, so the header re-renders on
  // login/logout with no reload (it used to read localStorage at render).
  const { user, loggedIn, logout, switchRole } = useAuth();
  const navigate = useNavigate();
  const { lang, setLang, t } = useLang();
  const { location, openPrompt, openDetails } = useLocation();
  // The bell badge reads the single shared notifications poll
  // (NotificationsContext) — the same fetch the banners use.
  const { unreadCount } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    // QA-13: revoke server-side, then leave — no full reload needed now
    // that the header is context-driven.
    await logout();
    setMenuOpen(false);
    navigate('/');
  }

  const languageButton = (
    <button
      className="secondary"
      title="Switch language / भाषा बदला / भाषा बदलें"
      onClick={() => setLang(lang === 'en' ? 'mr' : lang === 'mr' ? 'hi' : 'en')}
    >
      {lang === 'en' ? 'मराठी' : lang === 'mr' ? 'हिन्दी' : 'English'}
    </button>
  );

  return (
    <header className="nav">
      <Link
        to="/"
        className="brand"
        aria-label={t('appName')}
        title={t('appName')}
        onClick={() => setMenuOpen(false)}
      >
        🥗
      </Link>
      <button
        type="button"
        className="secondary"
        onClick={() => (location ? openDetails() : openPrompt())}
        title={t('yourLocation')}
        style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        📍 <span className="loc-label">{location?.label ?? t('locPromptTitle')}</span>{location && !hasUsableCoords(location) ? ` (${t('areaOnlyShort')})` : ''} ✎
      </button>
      <Link
        to="/notifications"
        className="bellBtn"
        aria-label={
          unreadCount > 0
            ? `${t('notifications')}, ${unreadCount} ${t('unread')}`
            : t('notifications')
        }
        title={t('notifications')}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75v-.7V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unreadCount > 0 && <span className="bellBadge">{unreadCount}</span>}
      </Link>
      <button
        type="button"
        className="avatarBtn"
        aria-expanded={menuOpen}
        aria-label={t('accountMenu')}
        title={t('accountMenu')}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <Avatar user={user} size={34} />
      </button>
      <nav className={menuOpen ? 'open' : ''} onClick={() => setMenuOpen(false)}>
        {loggedIn ? (
          <>
            <Link to="/profile">{t('profile')}</Link>
            {user?.role === 'PROVIDER' && <Link to="/my-listings">{t('myListings')}</Link>}
            {(user?.role === 'CLAIMER' || user?.role === 'NGO') && (
              <Link to="/my-claims">{t('myClaims')}</Link>
            )}
            <Link to="/browse">{t('browse')}</Link>
            {user?.role === 'PROVIDER' && <Link to="/listings/new">{t('postFood')}</Link>}
            <Link to="/impact">{t('impactNav')}</Link>
            {user?.role === 'NGO' && <Link to="/ngo">NGO panel</Link>}
            {user?.role === 'ADMIN' && <Link to="/admin">{t('admin')}</Link>}
            {(user?.role === 'CLAIMER' || user?.role === 'PROVIDER') && (
              // Switching role must NOT close the panel (the nav's
              // click-to-close would hide the Donor menu — including
              // Post Surplus Food — the moment Donor becomes active).
              <div className="menuIndent" onClick={(e) => e.stopPropagation()}>
                <span className="segmented" role="group" aria-label={t('modeLabel')}>
                  <button
                    type="button"
                    aria-pressed={user.role === 'CLAIMER'}
                    onClick={() => switchRole('CLAIMER')}
                  >
                    {t('modeClaimer')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={user.role === 'PROVIDER'}
                    onClick={() => switchRole('PROVIDER')}
                  >
                    {t('modeDonor')}
                  </button>
                </span>
              </div>
            )}
            <div className="menuRow">
              <button onClick={handleLogout}>{t('logout')}</button>
              {languageButton}
            </div>
          </>
        ) : (
          <>
            <Link to="/browse">{t('browse')}</Link>
            <Link to="/impact">{t('impactNav')}</Link>
            <div className="menuRow">
              <Link to="/login">{t('login')}</Link>
              <Link to="/register">{t('register')}</Link>
              {languageButton}
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
