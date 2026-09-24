import { describe, it, expect } from 'vitest';
import {
  normalizeStockSuggestions, applyStockSuggestions, selectedSuggestionCost, buildStockSuggestPrompt, relatedRecipes,
} from './stockSuggest';

const stock = [
  { id: 'tea', name: 'ผงชาไทย', unit: 'กรัม', unitCost: 0.5 },
  { id: 'milk', name: 'นมข้นจืด', unit: 'มล.', unitCost: 0.06 },
  { id: 'cup', name: 'แก้ว 16 oz', unit: 'ใบ', unitCost: 2 },
  { id: 'old', name: 'ผงชาไทยเก่า', unit: 'กรัม', unitCost: 0.4, mergedInto: 'tea' },
];

describe('normalizeStockSuggestions', () => {
  const data = {
    recipe: [{ ingredient: 'ผงชาไทย', amount: '20 กรัม' }, 'น้ำแข็ง'],
    links: [
      { stockId: 'tea', usage: '20', ingredient: 'ผงชาไทย', reason: 'สูตรมาตรฐาน 20 กรัมต่อแก้ว', confidence: 'HIGH' },
      { stockId: 'milk', usage: 45, ingredient: 'นมข้นจืด', reason: 'ประมาณ', confidence: 'medium' },
      { stockId: 'cup', usage: 1, ingredient: 'แก้ว', reason: 'แก้วปั่น', confidence: 'low' },
      { stockId: 'tea', usage: 5, reason: 'ซ้ำ' },
      { stockId: 'ghost', usage: 1 },
      { stockId: 'old', usage: 3 },
      { stockId: 'milk', usage: 0 },
    ],
    missing: ['วิปครีม', { ingredient: 'ไซรัป' }, ''],
    notes: 'ร้านไม่มีวิปครีม',
  };

  it('keeps only live stock with positive usage, dedupes, and counts dropped lines', () => {
    const r = normalizeStockSuggestions(data, { stock, existingLinks: [] });
    expect(r.lines.map((l) => l.stockId)).toEqual(['tea', 'milk', 'cup']);
    expect(r.dropped).toBe(4);
    expect(r.lines[0]).toMatchObject({ usage: 20, confidence: 'high', unit: 'กรัม', cost: 10, checked: true });
    expect(r.missing).toEqual(['วิปครีม', 'ไซรัป']);
    expect(r.recipe).toEqual([{ ingredient: 'ผงชาไทย', amount: '20 กรัม' }, { ingredient: 'น้ำแข็ง', amount: '' }]);
    expect(r.notes).toBe('ร้านไม่มีวิปครีม');
  });

  it('pre-checks high/medium, leaves low unchecked, and marks already-linked stock', () => {
    const r = normalizeStockSuggestions(data, { stock, existingLinks: [{ stockId: 'milk', usage: 40 }] });
    const by = Object.fromEntries(r.lines.map((l) => [l.stockId, l]));
    expect(by.tea.checked).toBe(true);
    expect(by.milk).toMatchObject({ alreadyLinked: true, checked: false });
    expect(by.cup.checked).toBe(false);
  });

  it('repairs a stock name used in place of an id, and defaults unknown confidence to low', () => {
    const r = normalizeStockSuggestions({ links: [{ stockId: 'ผงชาไทย', usage: 18, confidence: 'sure' }] }, { stock });
    expect(r.lines[0]).toMatchObject({ stockId: 'tea', confidence: 'low', checked: false });
  });

  it('accepts a bare array and rejects unusable shapes', () => {
    expect(normalizeStockSuggestions([{ stockId: 'cup', usage: 1, confidence: 'high' }], { stock }).lines).toHaveLength(1);
    expect(normalizeStockSuggestions({ foo: 1 }, { stock })).toBeNull();
    expect(normalizeStockSuggestions(null, { stock })).toBeNull();
  });
});

describe('applyStockSuggestions', () => {
  const lines = [
    { stockId: 'tea', usage: 20, checked: true },
    { stockId: 'cup', usage: 1, checked: false },
    { stockId: 'milk', usage: 45, checked: true, alreadyLinked: true },
  ];

  it('puts checked lines at the top and keeps existing rows', () => {
    const { links, added } = applyStockSuggestions([{ stockId: 'milk', usage: 40 }], lines);
    expect(added).toBe(1);
    expect(links).toEqual([{ stockId: 'tea', usage: 20 }, { stockId: 'milk', usage: 40 }]);
  });

  it('multiplies per-piece usage into perWhole in whole-cake mode', () => {
    const { links } = applyStockSuggestions([], [{ stockId: 'tea', usage: 12.5, checked: true }], { whole: true, pieces: 8 });
    expect(links).toEqual([{ stockId: 'tea', usage: 12.5, perWhole: '100' }]);
  });

  it('sums the cost of checked, not-yet-linked lines', () => {
    expect(selectedSuggestionCost([
      { checked: true, cost: 10 }, { checked: false, cost: 5 }, { checked: true, alreadyLinked: true, cost: 3 },
    ])).toBe(10);
  });
});

describe('buildStockSuggestPrompt', () => {
  it('lists only live stock with unit cost, existing links, packaging presets and related recipes', () => {
    const stockById = new Map(stock.map((s) => [s.id, s]));
    const related = relatedRecipes(
      { id: 'm1', name: 'ชาไทยปั่น', category: 'Tea' },
      [{ id: 'm2', name: 'ชาไทย', category: 'Tea', stockLinks: [{ stockId: 'tea', usage: 15 }] },
        { id: 'm3', name: 'โกโก้', category: 'Tea', stockLinks: [{ stockId: 'tea', usage: 1 }] }],
      stockById,
    );
    expect(related).toEqual([{ name: 'ชาไทย', lines: ['ผงชาไทย 15 กรัม'] }]);
    const prompt = buildStockSuggestPrompt({
      menuItem: { name: 'ชาไทยปั่น', category: 'Tea' },
      stock,
      existingLinks: [{ stockId: 'milk', usage: 40 }],
      packagingPresets: [{ id: 'c', label: 'แก้ว 16oz', links: [{ stockId: 'cup', usage: 1 }] }],
      related,
    });
    expect(prompt).toContain('tea|ผงชาไทย|กรัม|0.5');
    expect(prompt).not.toContain('old|');
    expect(prompt).toContain('- นมข้นจืด 40 มล.');
    expect(prompt).toContain('แก้ว 16oz: แก้ว 16 oz (id cup) 1 ใบ');
    expect(prompt).toContain('- ชาไทย: ผงชาไทย 15 กรัม');
    expect(prompt).toContain('"confidence":"high|medium|low"');
  });
});
