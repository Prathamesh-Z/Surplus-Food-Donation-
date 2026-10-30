import React, { useState } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';

/**
 * Password field with a show/hide toggle (PRD v3.14).
 * Hidden by default; the toggle is a real button (keyboard-focusable,
 * aria-labelled in the UI language) and changes ONLY the input type —
 * value, validation, autocomplete and submission are untouched.
 */
export function PasswordInput({ value, onChange, autoComplete, required }) {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);
  const label = visible ? t('hidePassword') : t('showPassword');
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        style={{ width: '100%', paddingRight: 42, boxSizing: 'border-box' }}
      />
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setVisible((v) => !v)}
        style={{
          position: 'absolute', right: 4, top: '50%',
          transform: 'translateY(-50%)', background: 'none',
          border: 'none', cursor: 'pointer', fontSize: 16,
          padding: '6px 8px', lineHeight: 1, boxShadow: 'none',
        }}
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </span>
  );
}
