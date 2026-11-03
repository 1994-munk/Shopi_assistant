import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header and one line per row', () => {
    expect(toCsv(['name', 'qty'], [{ name: 'Milk', qty: 2 }])).toBe('name,qty\r\nMilk,2');
  });

  it('quotes commas, quotes and line breaks', () => {
    const csv = toCsv(['text'], [{ text: 'a, "b"\nc' }]);
    expect(csv).toBe('text\r\n"a, ""b""\nc"');
  });

  it('neutralises cells that spreadsheets would read as formulas', () => {
    const csv = toCsv(['text'], [{ text: '=HYPERLINK("x")' }, { text: '+1' }]);
    expect(csv).toBe('text\r\n"\'=HYPERLINK(""x"")"\r\n\'+1');
  });

  it('joins arrays and leaves null cells empty', () => {
    const csv = toCsv(['tags', 'note'], [{ tags: ['vegan', 'gluten-free'], note: null }]);
    expect(csv).toBe('tags,note\r\nvegan; gluten-free,');
  });
});
