// FAQ content + search for the /faq page. Every answer is grounded in
// the app's actual behaviour (registration, verification, listing,
// claiming, profile and privacy flows as implemented) — no invented
// features, timeframes, or support channels. Pure module: the page
// renders from this data and checks can exercise the search directly.
export const FAQ_CATEGORIES = [
  {
    id: 'donors',
    title: 'For food donors',
    items: [
      {
        q: 'How do I donate surplus food?',
        a: 'Create a free account as a Food provider, then choose "Post surplus food". Fill in what the food is, how many portions, the pickup address and a deadline within the next 24 hours, and confirm the food-safety checklist. Your listing appears on the Browse page straight away, and claimers and NGOs can claim portions of it.',
      },
      {
        q: 'What information should I include in a food listing?',
        a: 'The food\'s name and details (including how it has been stored), its category, whether it is vegetarian, non-vegetarian or vegan, the number of portions (or bulk servings), the pickup address, and the deadline by which it must be collected. A photo helps claimers recognise the food, and you can optionally show your contact number on the listing.',
      },
      {
        q: 'Can I edit or remove a listing after publishing?',
        a: 'You can edit a listing while it is still a draft. Once published, you can cancel it at any time from My Listings — cancelling also cancels any claims on it and notifies the claimers. Listings that pass their deadline expire automatically.',
      },
      {
        q: 'How do NGOs discover and claim available food?',
        a: 'Claimers and NGOs use the Browse page, which shows available listings with the time remaining and portions left; for claimers and NGOs it shows listings within 5 km of their saved location. They claim the number of portions they can collect, and you are notified as soon as a claim is placed.',
      },
      {
        q: 'What happens after an NGO claims my listing?',
        a: 'You receive a notification showing the claimed portions, and the claimer receives a pickup code. When they arrive — they can tap "On the way" in the app so you know they are coming — ask them for the code and enter it on the claim to confirm collection. The portions are then recorded as collected, and an NGO can log how the food was redistributed.',
      },
    ],
  },
  {
    id: 'ngos',
    title: 'For NGOs',
    items: [
      {
        q: 'How do I register as an NGO?',
        a: 'On the Register page choose "NGO / organisation" and add your organisation name and registration detail. You can attach verification documents during registration or later from the NGO Panel. Your account works straight away — you do not have to wait for verification before claiming food.',
      },
      {
        q: 'Why do I need to upload verification documents?',
        a: 'So an administrator can confirm your organisation is genuine. Verified NGOs carry a "Verified NGO" label on their listings and claims, which helps donors trust who is collecting their food.',
      },
      {
        q: 'Which document types are accepted, and what is the file size limit?',
        a: 'PDF, JPEG and PNG files, up to 20 MB per file. You can select several files at once. A registration certificate or similar supporting document is ideal.',
      },
      {
        q: 'How long does NGO verification take?',
        a: 'There is no fixed timeframe — verification is a manual review by an administrator. You will receive a notification with the outcome, and the decision (including any reason given) is also shown in your NGO Panel. You can claim and redistribute food while you wait.',
      },
      {
        q: 'What does it mean if my NGO remains unverified?',
        a: 'You can still claim food and log redistributions — your listings and claims simply do not carry the Verified NGO label yet. If an administrator reviewed your documents and kept your NGO unverified, the reason is shown in your NGO Panel so you know what to address.',
      },
      {
        q: 'How can I update my verification documents?',
        a: 'In the NGO Panel, the Verification documents section lists everything you have uploaded. You can remove a document or upload new ones at any time — uploading a new document automatically asks for a fresh review.',
      },
    ],
  },
  {
    id: 'recipients',
    title: 'Recipients & food safety',
    items: [
      {
        q: 'Who can claim a food donation?',
        a: 'Anyone with a Claimer account, and registered NGOs. Browsing is public, but you need to sign in to claim. Claims are made per portion, so you can take some of a listing rather than all of it.',
      },
      {
        q: 'How do I know whether a listing is still available?',
        a: 'The Browse page shows each listing\'s portions remaining and time left, and refreshes automatically. Fully claimed listings are marked "Fully claimed", and listings past their deadline are removed. A listing\'s detail page always shows the exact portions remaining.',
      },
      {
        q: 'What should I check before accepting donated food?',
        a: 'Check the deadline and time remaining, how the food has been stored (described in the listing), and that the packaging is intact when you collect it. Every donor must confirm a food-safety checklist before publishing — covering hygienic preparation, an accurate cooking time, no signs of spoilage, and covered packaging. If something looks or smells off when you collect it, do not accept it.',
      },
      {
        q: 'What should I do if food appears unsafe or a listing is inaccurate?',
        a: 'Do not accept or eat food that appears spoiled. If you have claimed it, you can cancel the claim from My Claims; cancelling at least 30 minutes before the deadline returns the portions to the listing. Listings are moderated by administrators, who can remove listings that break the rules.',
      },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts & privacy',
    items: [
      {
        q: 'How do I update my profile information?',
        a: 'Open Profile from the menu. You can edit your name and the mobile number people reach you on, then save — the update applies wherever your name or number appears in the app.',
      },
      {
        q: 'How do I reset my password?',
        a: 'On the Login page choose "Forgot password", enter your account email, and follow the reset link sent to you. The link can be used once and expires after 30 minutes; requesting a new link cancels the previous one.',
      },
      {
        q: 'Who can see my contact details and donation information?',
        a: 'Your phone number is never public. A listing shows the donor\'s number only when the donor switches on "show contact" for that listing, and then only to signed-in users viewing the listing and to claimers with a confirmed claim — anonymous visitors never see phone numbers. NGO verification documents are private: only the NGO itself and administrators reviewing verification can access them.',
      },
    ],
  },
];

// Case-insensitive substring search over question AND answer text.
// An empty query returns every category untouched; a query returns
// only categories that still contain a matching question.
export function searchFaq(query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return FAQ_CATEGORIES;
  return FAQ_CATEGORIES.map((category) => ({
    ...category,
    items: category.items.filter((item) => `${item.q} ${item.a}`.toLowerCase().includes(q)),
  })).filter((category) => category.items.length > 0);
}
