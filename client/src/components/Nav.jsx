import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../lib/NotificationsContext.jsx';
import { hasUsableCoords } from '../lib/location.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Avatar } from './Avatar.jsx';
import { BrandMark, MapPinIcon, PencilIcon } from './icons.jsx';
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
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const cancelLogoutRef = useRef(null);

  async function handleLogout() {
    // QA-13: revoke server-side, then leave — no full reload needed now
    // that the header is context-driven.
    await logout();
    setMenuOpen(false);
    navigate('/');
  }

  // Role switch (v3.31): the panel closes ONLY after a successful
  // switch. switchRole returns the updated user on success and null
  // on failure, so a failure keeps the panel open and shows feedback;
  // the in-flight flag blocks duplicate requests.
  async function handleSwitch(role) {
    if (switching) return;
    setSwitching(true);
    setSwitchError('');
    const updated = await switchRole(role);
    setSwitching(false);
    if (updated) {
      setMenuOpen(false);
    } else {
      setSwitchError(t('modeSwitchFailed'));
    }
  }

  async function confirmLogout() {
    setConfirmingLogout(false);
    await handleLogout();
  }

  // Logout dialog: Escape cancels, and focus starts on Cancel — the
  // safe action (ClaimSuccessModal pattern).
  useEffect(() => {
    if (!confirmingLogout) return undefined;
    cancelLogoutRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') setConfirmingLogout(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmingLogout]);

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
        <BrandMark size={30} />
      </Link>
      <button
        type="button"
        className="secondary"
        onClick={() => (location ? openDetails() : openPrompt())}
        title={t('yourLocation')}
        style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        <MapPinIcon size={15} /> <span className="loc-label">{location?.label ?? t('locPromptTitle')}</span>{location && !hasUsableCoords(location) ? ` (${t('areaOnlyShort')})` : ''} <PencilIcon size={13} />
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
              // The toggle block stop-propagates so the nav's
              // click-to-close cannot fire before the switch result
              // is known; handleSwitch closes the panel itself, only
              // on success (v3.31 — reverses v3.30's stay-open).
              <div className="menuIndent" onClick={(e) => e.stopPropagation()}>
                <span className="segmented" role="group" aria-label={t('modeLabel')}>
                  <button
                    type="button"
                    aria-pressed={user.role === 'CLAIMER'}
                    disabled={switching}
                    onClick={() => handleSwitch('CLAIMER')}
                  >
                    {t('modeClaimer')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={user.role === 'PROVIDER'}
                    disabled={switching}
                    onClick={() => handleSwitch('PROVIDER')}
                  >
                    {t('modeDonor')}
                  </button>
                </span>
                {switchError && (
                  <div className="error" role="alert" style={{ marginTop: 8 }}>
                    {switchError}
                  </div>
                )}
              </div>
            )}
            <div className="menuRow">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingLogout(true);
                }}
              >
                {t('logout')}
              </button>
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
      {confirmingLogout && (
        <div
          onClick={() => setConfirmingLogout(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(20, 35, 18, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 1000,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: '22px 20px',
              width: '100%', maxWidth: 380,
              boxShadow: '0 12px 40px rgba(0,0,0,0.35)', textAlign: 'center',
            }}
          >
            <h2 id="logout-confirm-title" style={{ margin: '4px 0 6px', fontSize: 20 }}>
              {t('logoutConfirm')}
            </h2>
            <div className="row" style={{ marginTop: 16, justifyContent: 'center', gap: 10 }}>
              <button
                type="button"
                className="secondary"
                ref={cancelLogoutRef}
                onClick={() => setConfirmingLogout(false)}
              >
                {t('cancel')}
              </button>
              <button type="button" onClick={confirmLogout}>
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
