import React, { useState } from 'react';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatApiError } from '../lib/api.js';
import { DocumentStaging } from '../components/DocumentStaging.jsx';
import { uploadDocuments } from '../lib/documents.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLang } from '../i18n/LanguageContext.jsx';

const INVITE_STORAGE_KEY = 'fws_invite_code';

function readInviteCode() {
  try {
    const param = new URLSearchParams(window.location.search).get('invite');
    if (param?.trim()) {
      const clean = param.trim().toUpperCase();
      localStorage.setItem(INVITE_STORAGE_KEY, clean);
      return clean;
    }
    return localStorage.getItem(INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function Register() {
  const navigate = useNavigate();
  const { login: setAuth } = useAuth();
  const { t } = useLang();
  const [inviteCode] = useState(readInviteCode);
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
  const [info, setInfo] = useState('');
  // NGO verification documents staged on the form (optional). They are
  // uploaded AFTER the account is created and signed in, through the
  // same endpoint/helper the NGO Panel uses — no second upload system.
  const [stagedDocs, setStagedDocs] = useState([]);
  const [docUploading, setDocUploading] = useState(false);
  const [docProgress, setDocProgress] = useState(0);
  const [created, setCreated] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    // Account already created (only the document upload failed on the
    // first pass): the button now just continues into the app.
    if (created) {
      navigate('/browse');
      return;
    }
    setError('');
    setInfo('');
    try {
      const body = { ...form };
      // Send NGO fields only when they actually have content — an empty
      // string is not the same as "not provided" to the API.
      if (!body.organisationName?.trim()) delete body.organisationName;
      if (!body.registrationDetail?.trim()) delete body.registrationDetail;
      if (inviteCode) body.inviteCode = inviteCode;
      const reg = await api('/api/auth/register', { method: 'POST', body });
      // QA-15: a duplicate email/mobile answers with a neutral message and
      // no user object. Show it with a login link instead of auto-signing
      // in (and never attempt a login that would leak the same signal).
      if (!reg.user) {
        setInfo(reg.message || 'Registration received. Please log in.');
        return;
      }
      const login = await api('/api/auth/login', {
        method: 'POST',
        body: { email: form.email, password: form.password },
      });
      setAuth(login.user, login.accessToken, login.refreshToken);
      try {
        localStorage.removeItem(INVITE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      // Attach any staged verification documents to the new NGO account.
      // Registration is complete either way: if the upload fails, the
      // account stands and the NGO can upload later from the NGO Panel.
      if (form.role === 'NGO' && stagedDocs.length > 0) {
        setDocUploading(true);
        setDocProgress(0);
        try {
          await uploadDocuments(stagedDocs, setDocProgress);
        } catch (err) {
          setDocUploading(false);
          setCreated(true);
          setError(
            `Your account was created, but the documents could not be uploaded (${err.message}). ` +
              'Press Continue to proceed — you can upload them any time from the NGO Panel.'
          );
          return;
        }
        setDocUploading(false);
      }
      navigate('/browse');
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  return (
    <section>
      <h1>Register</h1>
      {inviteCode && <p className="success">{t('joiningViaInvite')}</p>}
      {error && <div className="error">{error}</div>}
      {info && (
        <div className="success">
          {info} <Link to="/login">Log in</Link>
        </div>
      )}
      <form onSubmit={submit}>
        <label>Full name<input value={form.name} onChange={set('name')} autoComplete="name" required /></label>
        <label>Email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
        <label>Mobile (10 digits, e.g. 9812345678)<input value={form.mobile} onChange={set('mobile')} inputMode="tel" autoComplete="tel" placeholder="9812345678" required /></label>
        <label>Password (min 8 characters)<PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" required /></label>
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
            <div>
              <span className="muted">Verification documents (optional — PDF, JPEG or PNG, up to 20 MB each)</span>
              <DocumentStaging staged={stagedDocs} onChange={setStagedDocs} disabled={docUploading || created} />
            </div>
          </>
        )}
        {docUploading && (
          <div style={{ height: 6, background: '#eef3ea', borderRadius: 3, margin: '8px 0' }}>
            <div style={{ height: '100%', width: `${docProgress}%`, background: '#2e7d32', borderRadius: 3 }} />
          </div>
        )}
        <button type="submit" disabled={docUploading}>
          {docUploading ? `Uploading documents… ${docProgress}%` : created ? 'Continue' : 'Create account'}
        </button>
      </form>
    </section>
  );
}
