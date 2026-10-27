// PRD FR-05 — the 8 food-safety checklist items. A listing may go LIVE only
// when ALL of these are confirmed for that listing. IDs are stored per listing.
export const CHECKLIST_ITEMS = [
  {
    id: 'HYGIENE_PREP',
    text: 'The food was prepared in clean conditions with clean utensils and potable water.',
  },
  {
    id: 'DECLARED_STORAGE',
    text: 'The food has been stored at the condition I declared (covered and, where applicable, refrigerated/hot-held) since preparation.',
  },
  {
    id: 'NOT_PREVIOUSLY_SERVED',
    text: 'The food has not been previously served, plated or partially consumed.',
  },
  {
    id: 'COOKED_TIME_ACCURATE',
    text: 'The cooked/prepared-at time I entered is accurate.',
  },
  {
    id: 'NO_SPOILAGE_SIGNS',
    text: 'The food shows no sign of spoilage (off smell, discolouration, or contamination) at the time of listing.',
  },
  {
    id: 'COVERED_PACKAGING',
    text: 'The food will be handed over in clean, covered containers or packaging.',
  },
  {
    id: 'DEADLINE_FINAL',
    text: 'I understand the collection deadline is the last time this food should be collected, and I will not hand it over after that time.',
  },
  {
    id: 'DONOR_DECLARATION',
    text: 'I accept the surplus-food donor declaration: I am donating this food voluntarily for redistribution, consistent with the FSSAI surplus-food regulations context.',
  },
];

export const CHECKLIST_IDS = CHECKLIST_ITEMS.map((i) => i.id);

export function allChecklistConfirmed(items) {
  if (!Array.isArray(items)) return false;
  return CHECKLIST_IDS.every((id) => items.includes(id));
}
