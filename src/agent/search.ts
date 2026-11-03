import type { Category, DietaryTag, Product } from './types';

// Retrieval and ranking over the catalog. A product's name counts for more than its
// description and tags, and every filter (category, dietary, price) must match.

export interface SearchCriteria {
  keywords: string[];
  category: Category | null;
  dietary: DietaryTag[];
  maxPriceCents: number | null;
}

export function searchProducts(products: Product[], criteria: SearchCriteria): Product[] {
  const candidates = products.filter((product) => product.in_stock && matchesFilters(product, criteria));

  if (criteria.keywords.length === 0) {
    return [...candidates].sort((a, b) => a.name.localeCompare(b.name));
  }

  return candidates
    .map((product) => ({ product, score: scoreProduct(product, criteria.keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .map((entry) => entry.product);
}

// Returns every product tied for the best keyword score, so callers can ask a clarifying question on ties.
export function bestMatches(products: Product[], keywords: string[]): Product[] {
  if (keywords.length === 0) return [];

  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, keywords) }))
    .filter((entry) => entry.score > 0);
  if (scored.length === 0) return [];

  const topScore = Math.max(...scored.map((entry) => entry.score));
  return scored.filter((entry) => entry.score === topScore).map((entry) => entry.product);
}

function matchesFilters(product: Product, criteria: SearchCriteria): boolean {
  if (criteria.category && product.category !== criteria.category) return false;
  if (!criteria.dietary.every((tag) => product.tags.includes(tag))) return false;
  if (criteria.maxPriceCents !== null && product.price_cents > criteria.maxPriceCents) return false;
  return true;
}

function scoreProduct(product: Product, keywords: string[]): number {
  const nameWords = new Set(toWords(product.name));
  const detailWords = new Set(toWords(`${product.description} ${product.tags.join(' ')}`));

  let score = 0;
  for (const keyword of keywords) {
    const stemmed = stem(keyword);
    if (nameWords.has(stemmed)) score += 3;
    else if (detailWords.has(stemmed)) score += 1;
  }
  return score;
}

function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
}

// Light plural handling so "avocado" matches "Avocados". Deliberately simple.
function stem(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}
