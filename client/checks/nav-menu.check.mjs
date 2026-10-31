// Focused source checks for the navbar / bell / avatar-menu / FAQ FAB
// rework and the UI copy cleanup (PRD v3.29). There is no client test
// runner in this project, so — like faq.check.mjs — these run under
// plain node and assert the shipped source facts the spec pins down.
// Run: node client/checks/nav-menu.check.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS } from '../src/i18n/strings.js';

const SRC = new URL('../src/', import.meta.url).pathname;
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const nav = read('components/Nav.jsx');
const css = read('styles.css');
const faq = read('pages/Faq.jsx');
const fab = read('components/FaqFab.jsx');
const app = read('App.jsx');

let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

// 1. The three exact copy lines are gone from every client source file.
const REMOVED_LINES = [
  'Demo build for Hackathon 2K26 (Team HA040). Demo data in this system is synthetic and labelled as such.',
  'Every number is computed live from the records in this system. Nothing here is an estimate.',
  'Every number below is computed from the records stored in this system',
];
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jsx?|css)$/.test(name)) yield p;
  }
}
let allSrc = '';
for (const f of walk(SRC)) allSrc += readFileSync(f, 'utf8') + '\n';
for (const line of REMOVED_LINES) check(`copy removed: ${line.slice(0, 40)}…`, !allSrc.includes(line));
check('wallSubtitle key removed', !('wallSubtitle' in STRINGS.en));
check('impactIntro key removed', !('impactIntro' in STRINGS.en));

// 2. Bell: in the header, before the avatar button, badge only when > 0,
//    accessible label carries the unread count; no Notifications or FAQ
//    link remains inside the avatar menu panel.
const bellIdx = nav.indexOf('className="bellBtn"');
const avatarIdx = nav.indexOf('className="avatarBtn"');
check('bell exists in header', bellIdx !== -1);
check('bell sits left of the avatar', bellIdx !== -1 && avatarIdx !== -1 && bellIdx < avatarIdx);
check('bell links to /notifications', /to="\/notifications"/.test(nav));
check('badge rendered only when unreadCount > 0', nav.includes('unreadCount > 0 && <span className="bellBadge">'));
check('bell aria-label composes notifications + unread count', nav.includes("`${t('notifications')}, ${unreadCount} ${t('unread')}`"));
const panel = nav.slice(nav.indexOf('<nav'));
check('no notifications link in the avatar menu', !panel.includes('/notifications'));
check('no faq link in the avatar menu', !panel.includes('/faq'));

// 3. Menu sequence: Profile < role item < Browse < Post, toggle in an
//    indented block, auth actions + language in a menu row.
const iProfile = panel.indexOf('to="/profile"');
const iRole = Math.min(
  ...['to="/my-listings"', 'to="/my-claims"'].map((s) => panel.indexOf(s)).filter((i) => i !== -1)
);
const iBrowse = panel.indexOf('to="/browse"');
const iPost = panel.indexOf('to="/listings/new"');
check(
  'menu order profile < role < browse < post',
  iProfile !== -1 && iRole > iProfile && iBrowse > iRole && iPost > iBrowse
);
check('role toggle indented below the links', panel.includes('className="menuIndent"'));
check('auth + language row present', panel.includes('className="menuRow"') && panel.includes('languageButton'));
check('toggle still USER-role gated', panel.includes("user?.role === 'CLAIMER' || user?.role === 'PROVIDER'"));

// 4. Brand: icon-only with an accessible name.
check('brand carries aria-label appName', nav.includes('aria-label={t(\'appName\')}'));
check('brand shows no visible app-name text', !nav.includes('🥗 {t(\'appName\')}'));

// 5. FAQ FAB + Back.
check('FAB mounted in App', app.includes('<FaqFab />'));
check('FAB hides on /faq itself', fab.includes("pathname === '/faq'"));
check('FAB label is localized faqNav', fab.includes("aria-label={t('faqNav')}"));
check('FAB styles are safe-area aware', css.includes('env(safe-area-inset-bottom)') && css.includes('.faqFab'));
check('FAQ page has a history Back with home fallback', faq.includes('navigate(-1)') && faq.includes("navigate('/')"));

// 6. Browse label + i18n parity.
check('browse label reads Browse food', STRINGS.en.browse === 'Browse food');
const counts = Object.values(STRINGS).map((v) => Object.keys(v).length);
check('i18n parity across locales', counts.every((c) => c === counts[0]));

console.log(`nav-menu checks: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
