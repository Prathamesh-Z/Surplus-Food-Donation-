import React, { useState } from 'react';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatApiError } from '../lib/api.js';
import { DocumentStaging } from '../components/DocumentStaging.jsx';
import { uploadDocuments } from '../lib/documents.js';
import { PHOTO_ACCEPT, profilePhotoError, uploadProfilePhoto } from '../lib/profilePhoto.js';
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
  const { login: setAuth, updateUser } = useAuth();
  const { t } = useLang();
  const [inviteCode] = useState(readInviteCode);
  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    accountType: 'USER',
    organisationName: '',
    registrationDetail: '',
  });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // NGO verification documents staged on the form (optional). They are
  // uploaded AFTER the account is created and signed in, through the
  // same endpoint/helper the NGO Panel uses — no second upload system.
  const [stagedDocs, setStagedDocs] = useState([]);
  // Optional profile photo, staged the same way: uploaded after the
  // account exists and is signed in; skipping (or never choosing)
  // registers exactly as before.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoSkipped, setPhotoSkipped] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
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
      if (form.accountType === 'NGO' && stagedDocs.length > 0) {
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
      // Attach the staged profile photo, if any. Same failure contract
      // as the documents: the account stands; the photo can be added
      // later from the Profile page.
      if (photoFile) {
        setPhotoUploading(true);
        try {
          const updated = await uploadProfilePhoto(photoFile);
          updateUser({ ...login.user, profilePhoto: updated.profilePhoto });
        } catch (err) {
          setPhotoUploading(false);
          setCreated(true);
          setError(
            `Your account was created, but the profile photo could not be uploaded (${err.message}). ` +
              'Press Continue to proceed — you can add it any time from your Profile.'
          );
          return;
        }
        setPhotoUploading(false);
      }
      navigate('/browse');
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  return (
    <section>
      <h1>{form.accountType === 'NGO' ? 'Register as NGO / Organisation' : 'Register as User'}</h1>
      {inviteCode && <p className="success">{t('joiningViaInvite')}</p>}
      {error && <div className="error">{error}</div>}
      {info && (
        <div className="success">
          {info} <Link to="/login">Log in</Link>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="segmented" role="group" aria-label="Register as" style={{ marginBottom: 12 }}>
          <button
            type="button"
            aria-pressed={form.accountType === 'USER'}
            onClick={() => setForm({ ...form, accountType: 'USER' })}
          >
            User
          </button>
          <button
            type="button"
            aria-pressed={form.accountType === 'NGO'}
            onClick={() => setForm({ ...form, accountType: 'NGO' })}
          >
            NGO / Organisation
          </button>
        </div>
        <p className="muted">
          {form.accountType === 'NGO'
            ? 'NGO accounts are verified by an administrator; you can claim and redistribute food while unverified.'
            : 'A User account can both claim food and donate surplus food — switch between Claimer and Donor any time after signing in.'}
        </p>
        <label>Full name<input value={form.name} onChange={set('name')} autoComplete="name" required /></label>
        <label>Email<input type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
        <label>Mobile (10 digits, e.g. 9812345678)<input value={form.mobile} onChange={set('mobile')} inputMode="tel" autoComplete="tel" placeholder="9812345678" required /></label>
        <label>Password (min 8 characters)<PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" required /></label>
        <div>
          <span className="muted">Profile photo (optional — JPEG, PNG or WebP, up to 5 MB)</span>
          {!photoSkipped && !photoFile && (
            <div className="row">
              <input
                type="file"
                accept={PHOTO_ACCEPT}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  if (!f) return;
                  const reason = profilePhotoError(f);
                  if (reason) {
                    setPhotoError(`${f.name} — ${reason}`);
                    return;
                  }
                  setPhotoError('');
                  setPhotoFile(f);
                  setPhotoPreview(URL.createObjectURL(f));
                }}
              />
              <button type="button" className="secondary" onClick={() => setPhotoSkipped(true)}>Skip</button>
            </div>
          )}
          {photoSkipped && <p className="muted">No photo — you can add one later from your Profile.</p>}
          {photoFile && (
            <div className="row">
              <img
                src={photoPreview}
                alt="Your selected profile photo"
                style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
              />
              <span>{photoFile.name}</span>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreview('');
                }}
              >
                Remove
              </button>
            </div>
          )}
          {photoError && <div className="error">{photoError}</div>}
        </div>
        {form.accountType === 'NGO' && (
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
            <div style={{ height: '100%', width: `${docProgress}%`, background: 'var(--green-700)', borderRadius: 3 }} />
          </div>
        )}
        <button type="submit" disabled={docUploading || photoUploading}>
          {docUploading
            ? `Uploading documents… ${docProgress}%`
            : photoUploading
              ? 'Uploading photo…'
              : created
                ? 'Continue'
                : 'Create account'}
        </button>
      </form>
    </section>
  );
}
