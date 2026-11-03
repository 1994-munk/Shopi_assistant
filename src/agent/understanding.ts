import { CATEGORIES, type Category, type DietaryTag, type UserIntent } from './types';

// Language understanding: turns one shopper message into structured slots.
// This is deterministic and runs in the browser, so it costs nothing per request.
// It is the swap point where a fine-tuned open-weight model can later plug in.

export interface Understanding {
  intent: UserIntent;
  keywords: string[];
  category: Category | null;
  dietary: DietaryTag[];
  maxPriceCents: number | null;
  quantity: number;
  refersToLastResult: boolean;
}

const DIETARY_RULES: ReadonlyArray<{ pattern: RegExp; tag: DietaryTag }> = [
  { pattern: /\bgluten[\s-]?free\b/g, tag: 'gluten-free' },
  { pattern: /\bdairy[\s-]?free\b/g, tag: 'dairy-free' },
  { pattern: /\blow[\s-]?sugar\b|\bsugar[\s-]?free\b/g, tag: 'low-sugar' },
  { pattern: /\bvegan\b/g, tag: 'vegan' },
  { pattern: /\bvegetarian\b/g, tag: 'vegetarian' },
  { pattern: /\borganic\b/g, tag: 'organic' },
];

// Words people use for a category. Matching one of these sets the category filter.
const CATEGORY_WORDS: Record<Category, string[]> = {
  produce: ['produce', 'fruit', 'fruits', 'vegetable', 'vegetables', 'veggies', 'greens'],
  dairy: ['dairy', 'cheese', 'yogurt', 'yoghurt', 'cream'],
  bakery: ['bakery', 'bread', 'croissant', 'croissants', 'cookie', 'cookies', 'loaf', 'pastry'],
  pantry: ['pantry', 'grocery', 'rice', 'pasta', 'oats', 'oil', 'spaghetti', 'peanut', 'chickpeas'],
  drinks: ['drinks', 'drink', 'beverage', 'beverages', 'water', 'coffee', 'tea', 'juice'],
  frozen: ['frozen', 'burger', 'burgers'],
  snacks: ['snacks', 'snack', 'chocolate', 'nuts', 'treats'],
};

// Filler words that carry no product meaning, so they are dropped from keywords.
const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'some', 'any', 'for', 'to', 'my', 'me', 'i', 'im', 'ill', 'want', 'need', 'needs',
  'show', 'find', 'search', 'looking', 'recommend', 'suggest', 'please', 'can', 'could', 'you', 'would',
  'like', 'it', 'that', 'this', 'and', 'with', 'in', 'on', 'from', 'is', 'what', 'whats', 'something',
  'items', 'item', 'products', 'product', 'options', 'option', 'basket', 'cart', 'add', 'put', 'get',
  'buy', 'grab', 'take', 'include', 'remove', 'delete', 'drop', 'out', 'clear', 'empty', 'reset',
  'checkout', 'pay', 'order', 'help', 'how', 'do', 'under', 'below', 'over', 'less', 'than', 'up',
  'max', 'maximum', 'more', 'cheaper', 'price', 'dollars', 'dollar', 'there', 'have', 'got', 'shop',
  'shopping', 'list', 'now', 'about', 'x', 'of', 'free', 'kg', 'g', 'ml', 'l', 'litre', 'liter',
  'pack', 'packs', 'bag', 'bags', 'or', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'bit', 'few', 'lot',
]);

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const INTENT_RULES: ReadonlyArray<[UserIntent, RegExp]> = [
  ['checkout', /\b(checkout|check out|pay|place (my )?order)\b/],
  ['clear_basket', /\b(empty|clear|reset)\b.*\b(basket|cart)\b|\b(basket|cart)\b.*\b(empty|clear|reset)\b/],
  ['remove_from_basket', /\b(remove|delete|take out|get rid of|drop)\b/],
  ['add_to_basket', /\b(add|put|buy|get|grab|include|take)\b/],
  ['show_basket', /\b(basket|cart|total)\b|\bwhat'?s in\b/],
  ['help', /\b(help|what can you do|how does this work)\b/],
];

const PRICE_CAP_PATTERNS = [
  /\b(?:under|below|less than|cheaper than|max(?:imum)?|up to|no more than|at most)\s*\$?\s*(\d+(?:\.\d{1,2})?)/,
  /\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:or less|or under)\b/,
];

const QUANTITY_TOKEN = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)';
const QUANTITY_PATTERNS = [
  new RegExp(`\\b(?:add|get|buy|grab|put|take)\\s+${QUANTITY_TOKEN}\\b`),
  new RegExp(`\\b${QUANTITY_TOKEN}\\s*(?:x\\b|of\\b|bottles?\\b|cartons?\\b|tins?\\b|loaves\\b|loaf\\b|bags?\\b)`),
];

const REFERENCE_PATTERN = /\b(it|that|this|the first|first one|the one)\b/;

export function understand(raw: string): Understanding {
  const lower = raw.toLowerCase();
  let working = lower;

  const quantity = extractQuantity(lower);

  const priceCap = extractPriceCap(lower);
  if (priceCap) working = working.replace(priceCap.text, ' ');

  const dietary: DietaryTag[] = [];
  for (const rule of DIETARY_RULES) {
    if (working.match(rule.pattern)) {
      dietary.push(rule.tag);
      working = working.replace(rule.pattern, ' ');
    }
  }

  let tokens = working.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  let category: Category | null = null;
  for (const candidate of CATEGORIES) {
    const words = CATEGORY_WORDS[candidate];
    if (tokens.some((token) => words.includes(token))) {
      category = candidate;
      tokens = tokens.filter((token) => !words.includes(token));
      break;
    }
  }

  const keywords = tokens.filter(
    (token) => !FILLER_WORDS.has(token) && !/^\d+$/.test(token),
  );

  return {
    intent: detectIntent(lower, keywords.length > 0 || category !== null || dietary.length > 0 || priceCap !== null),
    keywords,
    category,
    dietary,
    maxPriceCents: priceCap ? priceCap.cents : null,
    quantity,
    refersToLastResult: REFERENCE_PATTERN.test(lower),
  };
}

function detectIntent(lower: string, hasSearchSignal: boolean): UserIntent {
  for (const [intent, pattern] of INTENT_RULES) {
    if (pattern.test(lower)) return intent;
  }
  return hasSearchSignal ? 'search' : 'unclear';
}

function extractPriceCap(lower: string): { cents: number; text: string } | null {
  for (const pattern of PRICE_CAP_PATTERNS) {
    const match = pattern.exec(lower);
    if (match) return { cents: Math.round(parseFloat(match[1]) * 100), text: match[0] };
  }
  return null;
}

function extractQuantity(lower: string): number {
  for (const pattern of QUANTITY_PATTERNS) {
    const match = pattern.exec(lower);
    if (match) return toNumber(match[1]);
  }
  return 1;
}

function toNumber(token: string): number {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return NUMBER_WORDS.indexOf(token) + 1;
}
