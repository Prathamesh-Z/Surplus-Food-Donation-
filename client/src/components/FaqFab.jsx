import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../i18n/LanguageContext.jsx';

// Floating help button: fixed to the bottom-right of the viewport
// (safe-area aware, see .faqFab in styles.css) and links to the FAQ
// page from everywhere except the FAQ page itself. A plain Link, so
// it is keyboard-focusable and announced with its localized label.
export function FaqFab() {
  const { t } = useLang();
  const { pathname } = useLocation();
  if (pathname === '/faq') return null;
  return (
    <Link to="/faq" className="faqFab" aria-label={t('faqNav')} title={t('faqNav')}>
      <span aria-hidden="true">?</span>
    </Link>
  );
}
