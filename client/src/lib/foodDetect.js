// On-device food detection for the "Post surplus food" form.
// Uses TensorFlow.js + MobileNet (ImageNet) running ENTIRELY in the browser.
// Model weights are served from this app itself (/models/mobilenet/), so the
// demo works offline. The classifier only SUGGESTS a name/category — the
// provider reviews and edits everything before publishing. Nothing is
// uploaded to any AI service.
let modelPromise = null;

const FOOD_LABELS = {
  cheeseburger: ['Cheeseburger', 'COOKED_MEALS'],
  hotdog: ['Hot Dog', 'COOKED_MEALS'],
  'hot dog': ['Hot Dog', 'COOKED_MEALS'],
  pizza: ['Pizza', 'COOKED_MEALS'],
  burrito: ['Burrito / Wrap', 'COOKED_MEALS'],
  'meat loaf': ['Meat Loaf', 'COOKED_MEALS'],
  potpie: ['Pot Pie', 'COOKED_MEALS'],
  carbonara: ['Pasta Carbonara', 'COOKED_MEALS'],
  'mashed potato': ['Mashed Potato', 'COOKED_MEALS'],
  consomme: ['Soup', 'COOKED_MEALS'],
  'french onion soup': ['Onion Soup', 'COOKED_MEALS'],
  guacamole: ['Guacamole', 'COOKED_MEALS'],
  trifle: ['Trifle / Dessert', 'BAKERY'],
  'ice cream': ['Ice Cream', 'DAIRY'],
  'ice lolly': ['Ice Lolly', 'DAIRY'],
  bagel: ['Bagel', 'BAKERY'],
  pretzel: ['Pretzel', 'BAKERY'],
  dough: ['Dough / Bread', 'BAKERY'],
  banana: ['Bananas', 'RAW_PRODUCE'],
  strawberry: ['Strawberries', 'RAW_PRODUCE'],
  orange: ['Oranges', 'RAW_PRODUCE'],
  lemon: ['Lemons', 'RAW_PRODUCE'],
  pineapple: ['Pineapple', 'RAW_PRODUCE'],
  jackfruit: ['Jackfruit', 'RAW_PRODUCE'],
  'custard apple': ['Custard Apple', 'RAW_PRODUCE'],
  pomegranate: ['Pomegranate', 'RAW_PRODUCE'],
  cauliflower: ['Cauliflower', 'RAW_PRODUCE'],
  broccoli: ['Broccoli', 'RAW_PRODUCE'],
  cucumber: ['Cucumber', 'RAW_PRODUCE'],
  mushroom: ['Mushrooms', 'RAW_PRODUCE'],
  agaric: ['Mushrooms', 'RAW_PRODUCE'],
  zucchini: ['Zucchini', 'RAW_PRODUCE'],
  'bell pepper': ['Bell Peppers', 'RAW_PRODUCE'],
  'head cabbage': ['Cabbage', 'RAW_PRODUCE'],
  artichoke: ['Artichoke', 'RAW_PRODUCE'],
  'acorn squash': ['Squash', 'RAW_PRODUCE'],
  'butternut squash': ['Butternut Squash', 'RAW_PRODUCE'],
  'spaghetti squash': ['Spaghetti Squash', 'RAW_PRODUCE'],
  corn: ['Corn', 'RAW_PRODUCE'],
  'ear, spike, capitulum': ['Corn', 'RAW_PRODUCE'],
  espresso: ['Espresso / Coffee', 'BEVERAGES'],
  'red wine': ['Red Wine (sealed)', 'BEVERAGES'],
  cup: ['Cup of Beverage', 'BEVERAGES'],
  pitcher: ['Pitcher of Beverage', 'BEVERAGES'],
  'soup bowl': ['Bowl of Soup', 'COOKED_MEALS'],
  plate: ['Plated Meal', 'COOKED_MEALS'],
};

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const mobilenet = await import('@tensorflow-models/mobilenet');
      await import('@tensorflow/tfjs');
      try {
        return await mobilenet.load({ version: 2, alpha: 1.0, modelUrl: '/models/mobilenet/model.json' });
      } catch {
        // Fall back to the library default (CDN) if local weights are missing.
        return await mobilenet.load({ version: 2, alpha: 1.0 });
      }
    })();
  }
  return modelPromise;
}

// img: an HTMLImageElement that has finished loading.
// Returns { name, category, confidence, rawLabel } for the best food match
// among the top predictions, or null when nothing food-like is confident.
export async function detectFood(img) {
  const model = await loadModel();
  const predictions = await model.classify(img, 5);
  for (const pred of predictions) {
    const candidates = pred.className.toLowerCase().split(',').map((s) => s.trim());
    for (const cand of candidates) {
      if (FOOD_LABELS[cand]) {
        const [name, category] = FOOD_LABELS[cand];
        return { name, category, confidence: pred.probability, rawLabel: pred.className };
      }
    }
  }
  return null;
}
