import { supabase } from '../lib/supabase';
import type { Product } from '../agent/types';

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: 'banana',
    name: 'Bananas',
    category: 'produce',
    price_cents: 120,
    description: 'Fresh bananas, great for quick snacks or breakfast.',
    tags: ['organic'],
    in_stock: true,
  },
  {
    id: 'milk',
    name: 'Whole Milk',
    category: 'dairy',
    price_cents: 280,
    description: 'Classic dairy milk for coffee, cereal, and cooking.',
    tags: ['dairy-free'],
    in_stock: true,
  },
  {
    id: 'bread',
    name: 'Sourdough Bread',
    category: 'bakery',
    price_cents: 420,
    description: 'Slow-risen bread with a crisp crust and soft center.',
    tags: ['vegetarian'],
    in_stock: true,
  },
  {
    id: 'rice',
    name: 'Brown Rice',
    category: 'pantry',
    price_cents: 390,
    description: 'Nutritious pantry staple for bowls, sides, and soups.',
    tags: ['vegan', 'organic'],
    in_stock: true,
  },
  {
    id: 'sparkling-water',
    name: 'Sparkling Water',
    category: 'drinks',
    price_cents: 250,
    description: 'Crisp, bubbly hydration for lunch breaks and dinners.',
    tags: ['low-sugar'],
    in_stock: true,
  },
  {
    id: 'veggie-bites',
    name: 'Veggie Snack Bites',
    category: 'snacks',
    price_cents: 340,
    description: 'Crunchy savory bites with a lighter snack profile.',
    tags: ['vegan'],
    in_stock: false,
  },
];

// Loads the full catalog. The agent searches this list in memory, so it is fetched once per visit.
export async function fetchProducts(): Promise<Product[]> {
  if (!supabase) {
    return FALLBACK_PRODUCTS;
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, description, tags, in_stock')
    .order('name');

  if (error) throw new Error('Could not load the product catalog.');
  if (!Array.isArray(data)) throw new Error('The product catalog returned an unexpected response.');
  return data as Product[];
}
