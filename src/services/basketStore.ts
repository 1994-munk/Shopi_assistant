import { supabase } from '../lib/supabase';
import type { BasketLine } from '../agent/types';

interface BasketRow {
  product_id: string;
  quantity: number;
}

export async function loadBasket(sessionId: string): Promise<BasketLine[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('basket_items')
    .select('product_id, quantity')
    .eq('session_id', sessionId);

  if (error) throw new Error('Could not load your basket.');
  return ((data ?? []) as BasketRow[]).map((row) => ({ productId: row.product_id, quantity: row.quantity }));
}

// Writes only what changed between two basket states, so an unchanged basket costs no requests.
export async function saveBasket(sessionId: string, previous: BasketLine[], next: BasketLine[]): Promise<void> {
  if (!supabase) {
    return;
  }

  const removedIds = previous
    .filter((line) => !next.some((candidate) => candidate.productId === line.productId))
    .map((line) => line.productId);

  const changed = next.filter(
    (line) => previous.find((candidate) => candidate.productId === line.productId)?.quantity !== line.quantity,
  );

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from('basket_items')
      .delete()
      .eq('session_id', sessionId)
      .in('product_id', removedIds);
    if (error) throw new Error('Could not save your basket. Please try again.');
  }

  if (changed.length > 0) {
    const { error } = await supabase.from('basket_items').upsert(
      changed.map((line) => ({
        session_id: sessionId,
        product_id: line.productId,
        quantity: line.quantity,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'session_id,product_id' },
    );
    if (error) throw new Error('Could not save your basket. Please try again.');
  }
}
