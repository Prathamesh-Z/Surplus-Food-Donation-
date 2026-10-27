import React, { createContext, useContext, useEffect, useState } from 'react';
import { STRINGS } from './strings.js';
import { api, getAccessToken } from '../lib/api.js';

const LangContext = createContext({ lang: 'en', setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('fws_lang') ?? 'en');

  function setLang(next) {
    setLangState(next);
    localStorage.setItem('fws_lang', next);
    // Persist server-side too when signed in (users.languagePref), PRD FR-19.
    if (getAccessToken()) {
      api('/api/users/me/language', { method: 'PATCH', body: { language: next === 'mr' ? 'MR' : 'EN' } }).catch(() => {});
    }
  }

  useEffect(() => {
    if (getAccessToken()) {
      api('/api/auth/me')
        .then((d) => {
          const pref = d.user.languagePref === 'MR' ? 'mr' : 'en';
          setLangState(pref);
          localStorage.setItem('fws_lang', pref);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = (key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
