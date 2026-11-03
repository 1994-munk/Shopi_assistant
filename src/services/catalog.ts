import { supabase } from '../lib/supabase';
import type { Product } from '../agent/types';

// Loads the full catalog. The agent searches this list in memory, so it is fetched once per visit.
export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, price_cents, description, tags, in_stock')
    .order('name');

  if (error) throw new Error('Could not load the product catalog.');
  if (!Array.isArray(data)) throw new Error('The product catalog returned an unexpected response.');
  return data as Product[];
}
