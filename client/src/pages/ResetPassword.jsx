import React, { useState } from 'react';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

/** Reset password (v3.6): consumes the single-use token from the link. */
export function ResetPassword() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('passwordsDontMatch'));
      return;
    }
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      const fields = err.data?.details?.fieldErrors;
      if (fields && Object.keys(fields).length > 0) {
        setError(Object.values(fields).flat().join(' '));
      } else {
        setError(err.data?.error || err.message);
      }
    }
  }

  if (!token) {
    return (
      <section>
        <h1>{t('resetPasswordTitle')}</h1>
        <div className="error">This reset link is invalid, expired, or has already been used.</div>
        <p><Link to="/forgot-password">{t('forgotPassword')}</Link></p>
      </section>
    );
  }
  if (done) {
    return (
      <section>
        <h1>{t('resetPasswordTitle')}</h1>
        <p className="success">{t('resetDone')}</p>
        <p><Link to="/login">{t('login')}</Link></p>
      </section>
    );
  }
  return (
    <section>
      <h1>{t('resetPasswordTitle')}</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit} style={{ maxWidth: 420 }}>
        <label>
          {t('newPassword')} (min 8 characters)
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          {t('confirmPassword')}
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        <button type="submit">{t('resetPasswordTitle')}</button>
      </form>
    </section>
  );
}
