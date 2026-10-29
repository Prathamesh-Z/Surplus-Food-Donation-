import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

/**
 * Forgot password (v3.6): always shows the same generic confirmation —
 * the page never reveals whether the email is registered. When the
 * backend runs in dev mode without email (DEV_RESET_LINK), it returns
 * the link in the response and we show it here for local testing only.
 */
export function ForgotPassword() {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      if (res.resetUrl) setDevLink(res.resetUrl);
      setSent(true);
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  if (sent) {
    return (
      <section>
        <h1>{t('forgotPassword')}</h1>
        <p className="success">{t('resetSent')}</p>
        {devLink && (
          <p>
            {t('devResetLink')} <a href={devLink}>{devLink}</a>
          </p>
        )}
      </section>
    );
  }
  return (
    <section>
      <h1>{t('forgotPassword')}</h1>
      <p className="muted">{t('forgotText')}</p>
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit} style={{ maxWidth: 420 }}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit">{t('sendResetLink')}</button>
      </form>
    </section>
  );
}
