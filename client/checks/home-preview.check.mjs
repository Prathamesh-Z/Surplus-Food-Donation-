// Focused source checks for the public Home listings preview and the
// shared ListingCard extraction (PRD v3.30). Plain node, like
// faq.check.mjs / nav-menu.check.mjs — there is no client test runner.
// Run: node client/checks/home-preview.check.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS } from '../src/i18n/strings.js';

const SRC = new URL('../src/', import.meta.url).pathname;
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const home = read('pages/Home.jsx');
const browse = read('pages/Browse.jsx');
const card = read('components/ListingCard.jsx');

let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

// The shared card exists and both pages use it.
check('ListingCard component exists', existsSync(join(SRC, 'components/ListingCard.jsx')));
check('Browse renders ListingCard', browse.includes('<ListingCard'));
check('Browse imports ListingCard', browse.includes("from '../components/ListingCard.jsx'"));
check('Home renders ListingCard', home.includes('<ListingCard'));
check('card keeps the View & Claim detail link', card.includes('to={`/listings/${l.id}`}'));
check('card renders no contact or claim fields', !/contactPhone|donorContact|pickupCode/.test(card));

// The three informational cards are gone from Home and from strings.
for (const key of ['forProviders', 'forProvidersText', 'forClaimers', 'forClaimersText', 'honestImpact', 'honestImpactText']) {
  check(`string removed: ${key}`, !(key in STRINGS.en) && !home.includes(`t('${key}')`));
}

// The hero block is preserved.
check('hero title preserved', home.includes("t('heroTitle')"));
check('hero CTAs preserved', home.includes("t('browseCta')") && home.includes("t('impactCta')"));
check('live stats preserved', home.includes('/api/dashboard/public') && home.includes('portionsAvailableNow'));
check('invite link preserved', home.includes("t('inviteFriends')"));

// The preview uses the public endpoint and available-only selection.
check('preview fetches the public listings endpoint', home.includes("fetch('/api/listings')"));
check('preview filters ACTIVE with portions remaining', home.includes("l.status === 'ACTIVE' && l.portionsRemaining > 0"));
check('preview sorts by soonest deadline', home.includes('new Date(a.collectionDeadline) - new Date(b.collectionDeadline)'));
check('preview caps at six', home.includes('.slice(0, 6)'));
check('empty state uses noListingsYet', home.includes("t('noListingsYet')"));
check('preview links to full Browse', home.includes('to="/browse"'));

// Browse keeps its signed-in extras (your-claim row) after extraction.
check('browse claim row preserved', browse.includes('myClaimFor(l.id)') && browse.includes('cancelMyClaim(mine.id)'));
check('browse radius guard preserved', browse.includes('applyBrowseRadius'));

console.log(`home-preview checks: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
