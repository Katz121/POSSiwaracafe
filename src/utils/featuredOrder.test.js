import { describe, expect, it } from 'vitest';
import { sortByFeaturedOrder, moveItem, featuredOrderUpdates } from './featuredOrder';

describe('sortByFeaturedOrder', () => {
  it('sorts by featuredOrder and keeps unset items last in their original order', () => {
    const items = [
      { id: 'a' },
      { id: 'b', featuredOrder: 2 },
      { id: 'c' },
      { id: 'd', featuredOrder: 1 },
    ];
    expect(sortByFeaturedOrder(items).map((i) => i.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('does not mutate the input', () => {
    const items = [{ id: 'a', featuredOrder: 2 }, { id: 'b', featuredOrder: 1 }];
    sortByFeaturedOrder(items);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('moveItem', () => {
  it('moves an item up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('ignores out-of-range moves', () => {
    const items = ['a', 'b'];
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 1, 2)).toBe(items);
  });
});

describe('featuredOrderUpdates', () => {
  it('numbers items 1..n and only returns changed ones', () => {
    const ordered = [{ id: 'x', featuredOrder: 1 }, { id: 'y' }, { id: 'z', featuredOrder: 2 }];
    expect(featuredOrderUpdates(ordered)).toEqual([
      { id: 'y', featuredOrder: 2 },
      { id: 'z', featuredOrder: 3 },
    ]);
  });
});
