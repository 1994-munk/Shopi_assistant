import { supabase } from '../lib/supabase';
import { toCsv, type CsvValue } from '../lib/csv';

export interface ExportTableConfig {
  table: 'products' | 'basket_items' | 'turn_events';
  label: string;
  description: string;
  columns: string[];
}

export const EXPORT_TABLES: ExportTableConfig[] = [
  {
    table: 'products',
    label: 'Products',
    description: 'Catalog items, prices and dietary tags',
    columns: ['id', 'name', 'category', 'price_cents', 'description', 'tags', 'in_stock', 'created_at'],
  },
  {
    table: 'basket_items',
    label: 'Basket items',
    description: 'Basket lines for every visitor session',
    columns: ['id', 'session_id', 'product_id', 'quantity', 'created_at', 'updated_at'],
  },
  {
    table: 'turn_events',
    label: 'Turn log',
    description: 'Every chat turn with intent, latency and safety flags',
    columns: [
      'id',
      'session_id',
      'turn_index',
      'user_message',
      'intent',
      'response_text',
      'clarification_asked',
      'safety_flags',
      'latency_ms',
      'created_at',
    ],
  },
];

const PAGE_SIZE = 1000;

async function fetchAllRows(config: ExportTableConfig): Promise<Record<string, CsvValue>[]> {
  if (!supabase) {
    return [];
  }

  const rows: Record<string, CsvValue>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(config.table)
      .select('*')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Could not load ${config.label.toLowerCase()}.`);
    if (!Array.isArray(data)) throw new Error(`${config.label} returned an unexpected response.`);
    rows.push(...(data as Record<string, CsvValue>[]));
    if (data.length < PAGE_SIZE) return rows;
  }
}

export async function downloadTableAsCsv(config: ExportTableConfig): Promise<void> {
  if (!supabase) {
    return;
  }

  const rows = await fetchAllRows(config);
  const csv = toCsv(config.columns, rows);
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `shopi-${config.table}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
