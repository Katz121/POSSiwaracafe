import { describe, expect, it } from 'vitest';
import { buildPublicMenuBundle } from './publicMenu';

describe('public menu rewards settings', () => {
  it.each([true, false])('preserves rewards and switch %s while removing secrets', (pointsRewardsEnabled) => {
    const pointsRewards = [{ id: 'shot', name: 'เพิ่มช็อต', cost: 20, enabled: true }];
    const settings = { pointsRewardsEnabled, pointsRewards, adminPin: 'secret', geminiApiKey: 'secret', startingCash: 100 };
    expect(buildPublicMenuBundle({ settings }).settings).toEqual({ pointsRewardsEnabled, pointsRewards });
    expect(settings.adminPin).toBe('secret');
  });
  it('supports settings predating rewards', () => {
    expect(buildPublicMenuBundle({}).settings).toEqual({});
  });
});
