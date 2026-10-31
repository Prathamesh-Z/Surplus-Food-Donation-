import React, { useEffect, useRef, useState } from 'react';
import { api, formatApiError } from '../lib/api.js';
import { useLang } from '../i18n/LanguageContext.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { PHOTO_ACCEPT, profilePhotoError, uploadProfilePhoto } from '../lib/profilePhoto.js';

/**
 * Profile / account settings (v3.4): account details (read-only) + the
 * saved contact number, editable with the same validation as registration.
 * The number pre-fills the Donor Contact section on the posting form.
 */
export function Profile() {
  const { t } = useLang();
  const { updateUser } = useAuth();
  const [user, setUser] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [photoMsg, setPhotoMsg] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api('/api/auth/me')
      .then((d) => {
        setUser(d.user);
        setName(d.user.name ?? '');
        setMobile(d.user.mobile ?? '');
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    if (!name.trim()) {
      setError(t('nameRequired'));
      return;
    }
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      setError(t('contactInvalid'));
      return;
    }
    try {
      let savedName = user.name;
      if (name.trim() !== user.name) {
        const res = await api('/api/users/me/name', {
          method: 'PATCH',
          body: { name: name.trim() },
        });
        savedName = res.name;
        setName(res.name);
      }
      const res = await api('/api/users/me/contact', {
        method: 'PATCH',
        body: { mobile: mobile.trim() },
      });
      setMobile(res.mobile);
      setMsg(t('profileSaved'));
      setUser((u) => ({ ...u, name: savedName, mobile: res.mobile }));
      const stored = JSON.parse(localStorage.getItem('fws_user') ?? 'null');
      if (stored) {
        stored.name = savedName;
        stored.mobile = res.mobile;
        localStorage.setItem('fws_user', JSON.stringify(stored));
      }
    } catch (err) {
      setError(formatApiError(err));
    }
  }

  // Applies a new profilePhoto value locally AND in the auth context,
  // so the Nav avatar updates immediately — no refresh, no re-login.
  function applyPhoto(profilePhoto) {
    const merged = { ...user, profilePhoto };
    setUser(merged);
    updateUser(merged);
  }

  async function onPhotoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    setPhotoMsg('');
    const reason = profilePhotoError(file);
    if (reason) {
      setPhotoError(`${file.name} — ${reason}`);
      return;
    }
    setPhotoBusy(true);
    try {
      const updated = await uploadProfilePhoto(file);
      applyPhoto(updated.profilePhoto);
      setPhotoMsg(t('photoSaved'));
    } catch (err) {
      setPhotoError(err.message || 'Upload failed');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoError('');
    setPhotoMsg('');
    setPhotoBusy(true);
    try {
      const res = await api('/api/users/me/photo', { method: 'DELETE' });
      applyPhoto(res.user.profilePhoto);
      setPhotoMsg(t('photoSaved'));
    } catch (err) {
      setPhotoError(formatApiError(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  if (!user) return <p className="muted">{error || '…'}</p>;
  return (
    <section>
      <h1>{t('profile')}</h1>
      <h3>{t('accountDetails')}</h3>
      <p>
        <strong>{user.name}</strong> · {user.email} · {user.role}
        {user.ngoProfile ? ` · ${user.ngoProfile.organisationName}` : ''}
      </p>
      <div className="card" style={{ maxWidth: 420 }}>
        <div className="row">
          <Avatar user={user} size={64} />
          <strong>{t('profilePhoto')}</strong>
        </div>
        {photoError && <div className="error">{photoError}</div>}
        {photoMsg && <p className="success">{photoMsg}</p>}
        <input
          ref={photoInputRef}
          type="file"
          accept={PHOTO_ACCEPT}
          style={{ display: 'none' }}
          onChange={onPhotoSelected}
        />
        <div className="adminActions">
          <button type="button" disabled={photoBusy} onClick={() => photoInputRef.current?.click()}>
            {user.profilePhoto ? t('changePhoto') : t('setPhoto')}
          </button>
          {user.profilePhoto && (
            <button type="button" className="secondary" disabled={photoBusy} onClick={removePhoto}>
              {t('removePhoto')}
            </button>
          )}
        </div>
      </div>
      <form onSubmit={save} style={{ maxWidth: 420 }}>
        <label>
          {t('profileName')}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t('contactNumber')}
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            inputMode="numeric"
            placeholder="9812345678"
            required
          />
        </label>
        {msg && <p className="success">{msg}</p>}
        {error && <div className="error">{error}</div>}
        <button type="submit">{t('save')}</button>
      </form>
      {user.inviteCode && (
        <>
          <h3>{t('inviteFriends')}</h3>
          <p style={{ wordBreak: 'break-all' }}>
            {`${window.location.origin}/?invite=${user.inviteCode}`}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                const link = `${window.location.origin}/?invite=${user.inviteCode}`;
                let ok = false;
                try {
                  await navigator.clipboard.writeText(link);
                  ok = true;
                } catch {
                  try {
                    const ta = document.createElement('textarea');
                    ta.value = link;
                    document.body.appendChild(ta);
                    ta.select();
                    ok = document.execCommand('copy');
                    document.body.removeChild(ta);
                  } catch {
                    ok = false;
                  }
                }
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? t('copied') : t('copyLink')}
            </button>
            <a
              className="btn secondary"
              href={`https://wa.me/?text=${encodeURIComponent(`${t('inviteShareText')} ${window.location.origin}/?invite=${user.inviteCode}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('shareOnWhatsApp')}
            </a>
          </div>
        </>
      )}
    </section>
  );
}
