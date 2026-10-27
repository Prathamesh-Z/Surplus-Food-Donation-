import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setTokens } from '../lib/api.js';

export function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    role: 'CLAIMER',
    organisationName: '',
    registrationDetail: '',
  });
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form };
      if (form.role !== 'NGO') {
        delete body.organisationName;
        delete body.registrationDetail;
      }
      await api('/api/auth/register', { method: 'POST', body });
      const login = await api('/api/auth/login', {
        method: 'POST',
        body: { email: form.email, password: form.password },
      });
      setTokens(login.accessToken, login.refreshToken);
      localStorage.setItem('fws_user', JSON.stringify(login.user));
      navigate('/browse');
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }

  return (
    <section>
      <h1>Register</h1>
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit}>
        <label>Full name<input value={form.name} onChange={set('name')} required /></label>
        <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
        <label>Mobile (10 digits)<input value={form.mobile} onChange={set('mobile')} required /></label>
        <label>Password (min 8 characters)<input type="password" value={form.password} onChange={set('password')} required /></label>
        <label>
          I am a
          <select value={form.role} onChange={set('role')}>
            <option value="CLAIMER">Claimer (individual)</option>
            <option value="NGO">NGO / organisation</option>
            <option value="PROVIDER">Food provider</option>
          </select>
        </label>
        {form.role === 'NGO' && (
          <>
            <label>Organisation name<input value={form.organisationName} onChange={set('organisationName')} required /></label>
            <label>Registration detail<input value={form.registrationDetail} onChange={set('registrationDetail')} required /></label>
          </>
        )}
        <button type="submit">Create account</button>
      </form>
    </section>
  );
}
