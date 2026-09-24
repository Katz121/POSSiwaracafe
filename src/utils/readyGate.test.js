import { describe, it, expect, vi } from 'vitest';
import { createReadyGate } from './readyGate';

describe('createReadyGate', () => {
  it('fires only after every key has arrived, in any order', () => {
    const onReady = vi.fn();
    const mark = createReadyGate(['categories', 'settings'], onReady);
    mark('categories');
    expect(onReady).not.toHaveBeenCalled();
    mark('categories'); // repeat snapshots of the same listener do not count twice
    expect(onReady).not.toHaveBeenCalled();
    mark('settings');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('fires once even when listeners keep sending snapshots', () => {
    const onReady = vi.fn();
    const mark = createReadyGate(['settings', 'categories'], onReady);
    mark('settings'); mark('categories'); mark('settings'); mark('categories');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('ignores unknown keys', () => {
    const onReady = vi.fn();
    const mark = createReadyGate(['settings'], onReady);
    mark('orders');
    expect(onReady).not.toHaveBeenCalled();
    mark('settings');
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
