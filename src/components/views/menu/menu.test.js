import { describe, it, expect } from 'vitest';
import {
  buildMenuStatus, countStockFilters, groupMenu, matchesHighlight, matchesSearch, matchesStockFilter, stockFilterFromParam,
} from './menuModel.js';

const stock = [
  { id: 's1', name: 'นม', unit: 'ml', unitCost: 0.1 },
  { id: 's2', name: 'แก้ว', unit: 'ใบ', unitCost: 2 },
];
const beanModifiers = [{ id: 'b1', name: 'เมล็ดคั่วกลาง', group: 'เมล็ดกาแฟ', stockLinks: [{ stockId: 's1', usage: 1 }] }];
const menu = [
  { id: 'ok', name: 'ลาเต้', price: 60, category: 'กาแฟ', stockLinks: [{ stockId: 's1', usage: 150 }, { stockId: 's2', usage: 1 }] },
  { id: 'none', name: 'โกโก้', price: 55, category: 'ช็อกโกแลต', stockLinks: [] },
  { id: 'dead', name: 'ชาไทย', price: 50, category: 'ชา', stockLinks: [{ stockId: 'gone', usage: 1 }] },
  { id: 'partial', name: 'มอคค่า', price: 65, category: 'กาแฟ', stockLinks: [{ stockId: 's1', usage: 100 }, { stockId: 'gone', usage: 1 }], isFeatured: true },
  { id: 'mod', name: 'อเมริกาโน่', price: 50, category: 'กาแฟ', allowBeanModifier: true, isPinnedBest: true, available: false },
  { id: 'extra', name: 'น้ำเปล่า', nameEn: 'Water', price: 10, category: 'อื่นๆ', additionalCost: 3 },
];

describe('buildMenuStatus', () => {
  const status = buildMenuStatus({ menu, stock, beanModifiers });

  it('uses the stock-audit link statuses for every menu, hidden ones included', () => {
    expect(status.get('ok').status).toBe('ok');
    expect(status.get('none').status).toBe('unlinked');
    expect(status.get('dead').status).toBe('dead');
    expect(status.get('partial').status).toBe('partial');
    expect(status.get('mod').status).toBe('modifier_only'); // available:false still gets a status
  });

  it('counts live and dead links', () => {
    expect(status.get('partial')).toMatchObject({ aliveCount: 1, deadCount: 1 });
    expect(status.get('dead')).toMatchObject({ aliveCount: 0, deadCount: 1 });
  });

  it('keeps the v1 cost/margin formula (live links + additionalCost)', () => {
    expect(status.get('ok').totalCost).toBeCloseTo(17);
    expect(status.get('ok').marginPercent).toBe(72);
    expect(status.get('extra')).toMatchObject({ costed: true, totalCost: 3, marginPercent: 70 });
    expect(status.get('none').costed).toBe(false);
  });
});

describe('filters', () => {
  const status = buildMenuStatus({ menu, stock, beanModifiers });
  const ids = (f) => menu.filter((m) => matchesStockFilter(status.get(m.id), f)).map((m) => m.id);

  it('stock-link chips', () => {
    expect(ids('all')).toHaveLength(menu.length);
    expect(ids('unlinked')).toEqual(['none', 'extra']);
    expect(ids('broken')).toEqual(['dead', 'partial']);
    expect(ids('modifier')).toEqual(['mod']);
    expect(ids('linked')).toEqual(['ok', 'partial']);
    expect(countStockFilters(menu, status)).toEqual({ all: 6, unlinked: 2, broken: 2, modifier: 1, linked: 2 });
  });

  it('route param aliases', () => {
    expect(stockFilterFromParam('broken')).toBe('broken');
    expect(stockFilterFromParam('dead')).toBe('broken');
    expect(stockFilterFromParam('unlinked')).toBe('unlinked');
    expect(stockFilterFromParam('nope')).toBe('all');
    expect(stockFilterFromParam(undefined)).toBe('all');
  });

  it('highlight + search', () => {
    expect(menu.filter((m) => matchesHighlight(m, 'featured')).map((m) => m.id)).toEqual(['partial']);
    expect(menu.filter((m) => matchesHighlight(m, 'pinned')).map((m) => m.id)).toEqual(['mod']);
    expect(menu.filter((m) => matchesSearch(m, 'water')).map((m) => m.id)).toEqual(['extra']);
    expect(menu.filter((m) => matchesSearch(m, 'กาแฟ'))).toHaveLength(3);
  });
});

describe('groupMenu', () => {
  it('follows the shop category order, unknown categories last, sold-out items sink', () => {
    const groups = groupMenu(menu, [{ name: 'ชา' }, { name: 'กาแฟ' }]);
    expect(groups.map((g) => g.name).slice(0, 2)).toEqual(['ชา', 'กาแฟ']);
    const coffee = groups.find((g) => g.name === 'กาแฟ').items.map((i) => i.id);
    expect(coffee[coffee.length - 1]).toBe('mod');
  });
});
