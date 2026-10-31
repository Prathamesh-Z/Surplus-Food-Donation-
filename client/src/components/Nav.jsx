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
  // v3.17: the badge reads the single shared notifications poll
  // (NotificationsContext) — the same fetch the banners use.
  const { unreadCount } = useNotifications();
  // QA-08: collapsed menu on small screens (was ~299px of wrapped links).
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    // QA-13: revoke server-side, then leave — no full reload needed now
    // that the header is context-driven.
    await logout();
    setMenuOpen(false);
    navigate('/');
  }

  return (
    <header className="nav">
      <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>🥗 {t('appName')}</Link>
      <button
        type="button"
        className="secondary"
        onClick={() => (location ? openDetails() : openPrompt())}
        title={t('yourLocation')}
        style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        📍 <span className="loc-label">{location?.label ?? t('locPromptTitle')}</span>{location && !hasUsableCoords(location) ? ` (${t('areaOnlyShort')})` : ''} ✎
      </button>
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
        <Link to="/browse">{t('browse')}</Link>
        <Link to="/impact">{t('impactNav')}</Link>
        <Link to="/faq">{t('faqNav')}</Link>
        {loggedIn ? (
          <>
            {(user?.role === 'PROVIDER') && <Link to="/listings/new">{t('postFood')}</Link>}
            {(user?.role === 'PROVIDER') && <Link to="/my-listings">{t('myListings')}</Link>}
            {(user?.role === 'CLAIMER' || user?.role === 'NGO') && <Link to="/my-claims">{t('myClaims')}</Link>}
            {user?.role === 'NGO' && <Link to="/ngo">NGO panel</Link>}
            {user?.role === 'ADMIN' && <Link to="/admin">{t('admin')}</Link>}
            <Link to="/notifications">
              {t('notifications')}
              {unreadCount > 0 && (
                <span className="badge danger" style={{ marginLeft: 6 }}>{unreadCount}</span>
              )}
            </Link>
            {(user?.role === 'CLAIMER' || user?.role === 'PROVIDER') && (
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
            )}
            <Link to="/profile">{t('profile')}</Link>
            <button onClick={handleLogout}>
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
