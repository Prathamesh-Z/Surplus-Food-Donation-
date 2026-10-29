import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setTokens } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';

export function Login() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const login = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      setTokens(login.accessToken, login.refreshToken);
      localStorage.setItem('fws_user', JSON.stringify(login.user));
      navigate('/browse');
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  return (
    <section>
      <h1>Log in</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button type="submit">Log in</button>
      </form>
      <p><Link to="/forgot-password">{t('forgotPassword')}</Link></p>
      <p className="muted">
        Demo accounts (synthetic): provider@demo.local / claimer@demo.local /
        ngo@demo.local / admin@demo.local — password DemoPass1
      </p>
    </section>
  );
}
