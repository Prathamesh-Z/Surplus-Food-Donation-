// Node checks for the FAQ content module (client/src/lib/faq.js) —
// the project has no client test runner, so FAQ behaviour is verified
// here against the shipped pure module, like the earlier routing and
// swipe checks. Run: node client/checks/faq.check.mjs
import { FAQ_CATEGORIES, searchFaq } from '../src/lib/faq.js';

let passed = 0;
function check(name, cond) {
  if (!cond) throw new Error(`check failed: ${name}`);
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const all = FAQ_CATEGORIES.flatMap((c) => c.items);

check('four categories in order', JSON.stringify(FAQ_CATEGORIES.map((c) => c.id)) === JSON.stringify(['donors', 'ngos', 'recipients', 'accounts']));
check('18 questions total', all.length === 18);
check('every question and answer is non-empty', all.every((i) => i.q.trim().length > 0 && i.a.trim().length > 0));
check('questions are unique', new Set(all.map((i) => i.q)).size === all.length);
check('donors 5 / ngos 6 / recipients 4 / accounts 3',
  FAQ_CATEGORIES.map((c) => c.items.length).join(',') === '5,6,4,3');

const total = (cats) => cats.reduce((n, c) => n + c.items.length, 0);
check('empty search returns everything', total(searchFaq('')) === 18);
check('blank search returns everything', total(searchFaq('   ')) === 18);
check('search is case-insensitive and matches question text',
  searchFaq('PASSWORD').some((c) => c.id === 'accounts' && c.items.some((i) => i.q.includes('reset my password'))));
check('search matches answer-only text',
  searchFaq('spoiled').some((c) => c.id === 'recipients' && c.items.some((i) => i.q.includes('appears unsafe'))));
check('search finds the document limits answer',
  searchFaq('20 MB').some((c) => c.id === 'ngos' && c.items.some((i) => i.q.includes('document types'))));
check('categories without matches are dropped', searchFaq('password').every((c) => c.id === 'accounts'));
check('no-match search returns an empty list', searchFaq('zzzz-not-present').length === 0);

console.log(`\n${passed}/12 faq checks passed`);
