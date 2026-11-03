export type CsvValue = string | number | boolean | string[] | null;

const FORMULA_START = /^[=+\-@\t\r]/;

function formatCell(value: CsvValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = Array.isArray(value) ? value.join('; ') : value;
  // Stops spreadsheets from running text typed by visitors as a formula.
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(columns: readonly string[], rows: Record<string, CsvValue>[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => formatCell(row[column])).join(','));
  }
  return lines.join('\r\n');
}
