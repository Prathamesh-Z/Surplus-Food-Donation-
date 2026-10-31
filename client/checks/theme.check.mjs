// Focused source checks for the v3.32 theme pass: embedded webfonts,
// design tokens, the SVG icon system + brand mark, favicon wiring,
// and the stray-hex sweep. Plain node, like the other client checks.
// Run: node client/checks/theme.check.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT = new URL('../', import.meta.url).pathname;
const SRC = join(CLIENT, 'src');
const read = (p) => readFileSync(p, 'utf8');
const css = read(join(SRC, 'styles.css'));
const fontsCss = read(join(SRC, 'fonts.css'));
const main = read(join(SRC, 'main.jsx'));
const indexHtml = read(join(CLIENT, 'index.html'));
const nav = read(join(SRC, 'components/Nav.jsx'));
const card = read(join(SRC, 'components/ListingCard.jsx'));
const icons = read(join(SRC, 'components/icons.jsx'));

let passed = 0;
const failures = [];
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

// 1. Fonts: embedded data-URI @font-face for both families, imported.
check('Fraunces @font-face embedded', fontsCss.includes("font-family: 'Fraunces'") && fontsCss.includes('url(data:font/woff2;base64,'));
check('Public Sans @font-face embedded', fontsCss.includes("font-family: 'Public Sans'"));
check('font-display swap set', (fontsCss.match(/font-display: swap/g) ?? []).length === 2);
check('main.jsx imports fonts.css before styles.css', main.indexOf("'./fonts.css'") !== -1 && main.indexOf("'./fonts.css'") < main.indexOf("'./styles.css'"));
check('no binary font files left in the tree', !existsSync(join(CLIENT, 'public/fonts')));

// 2. Tokens exist and are applied.
for (const tok of ['--green-900: #14532d', '--bg: #f6faf1', '--amber: #b87908', '--primary:', '--surface:', '--text-muted:', '--border:', '--success:', '--warning:', '--danger:', '--font-display:', '--font-ui:', '--text-xs:', '--text-2xl:', '--space-1:', '--space-6:', '--radius-s:', '--radius-m:', '--radius-l:', '--radius-pill:', '--shadow-card:', '--shadow-raised:']) {
  check(`token present: ${tok}`, css.includes(tok));
}
check('body uses the UI font token', css.includes('font-family: var(--font-ui)'));
check('headings use the display font', css.includes('h1 { font-family: var(--font-display)'));
check('wall numbers use the display font', css.includes('.wall-value { font-family: var(--font-display)'));
check('hero keeps its gradient + amber rule', css.includes('linear-gradient(120deg, var(--green-900), var(--green-700))') && css.includes('.hero h1::after'));

// 3. Stray hexes are gone from theme-bearing code (JSX + CSS).
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jsx?|css)$/.test(name)) yield p;
  }
}
let all = '';
for (const f of walk(SRC)) all += read(f) + '\n';
check('#1565c0 extinct', !all.includes('#1565c0'));
check('#2e7d32 extinct', !all.includes('#2e7d32'));
check('#d9e8d2 only as the --line token value', (all.match(/#d9e8d2/g) ?? []).length === 1 && css.includes('--line: #d9e8d2'));

// 4. Icon system + swaps.
for (const name of ['MapPinIcon', 'ClockIcon', 'MicIcon', 'CameraIcon', 'PencilIcon', 'WalkingIcon', 'BikeIcon', 'NavigationIcon', 'BrandMark']) {
  check(`icons.jsx exports ${name}`, icons.includes(`export function ${name}`));
}
check('icons are stroke currentColor + aria-hidden', icons.includes('stroke="currentColor"') && icons.includes('aria-hidden="true"'));
check('nav brand is the SVG mark, no salad emoji', nav.includes('<BrandMark') && !nav.includes('🥗'));
check('nav location uses pin + pencil icons', nav.includes('<MapPinIcon') && nav.includes('<PencilIcon') && !nav.includes('📍'));
check('listing card uses clock + pin icons, no emoji chrome', card.includes('<ClockIcon') && card.includes('<MapPinIcon') && !card.includes('⏰') && !card.includes('📍'));
check('no-photo placeholder keeps the food emoji (content)', card.includes('🍲'));

// 5. Favicon + theme-color.
check('favicon.svg exists', existsSync(join(CLIENT, 'public/favicon.svg')));
check('favicon is the bowl-and-leaf mark', read(join(CLIENT, 'public/favicon.svg')).includes('#14532d'));
check('index.html links the favicon', indexHtml.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'));
check('index.html sets theme-color to the deep green', indexHtml.includes('<meta name="theme-color" content="#14532d" />'));

console.log(`theme checks: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
