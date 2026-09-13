import { describe, it, expect } from 'vitest';
import { getEligibleRewards, toggleRewardSelection } from './rewards';

describe('rewards utils', () => {
  describe('getEligibleRewards', () => {
    it('returns empty array if rewards is invalid', () => {
      expect(getEligibleRewards(null, 100)).toEqual([]);
    });

    it('filters enabled rewards that member has enough points for', () => {
      const rewards = [
        { id: '1', enabled: true, cost: 50 },
        { id: '2', enabled: false, cost: 20 },
        { id: '3', enabled: true, cost: 100 },
      ];
      const eligible = getEligibleRewards(rewards, 50);
      expect(eligible.length).toBe(1);
      expect(eligible[0].id).toBe('1');
    });

    it('returns all enabled rewards if points are sufficient', () => {
      const rewards = [
        { id: '1', enabled: true, cost: 50 },
        { id: '2', enabled: true, cost: 80 },
      ];
      const eligible = getEligibleRewards(rewards, 100);
      expect(eligible.length).toBe(2);
    });
  });

  describe('toggleRewardSelection', () => {
    it('toggles discount and clears reward', () => {
      const res = toggleRewardSelection(false, '123', 'discount');
      expect(res).toEqual({ usePoints: true, redeemRewardId: null });

      const res2 = toggleRewardSelection(true, null, 'discount');
      expect(res2).toEqual({ usePoints: false, redeemRewardId: null });
    });

    it('toggles reward and clears discount', () => {
      const res = toggleRewardSelection(true, null, 'reward', '123');
      expect(res).toEqual({ usePoints: false, redeemRewardId: '123' });
    });

    it('clears reward if toggling the same reward', () => {
      const res = toggleRewardSelection(false, '123', 'reward', '123');
      expect(res).toEqual({ usePoints: false, redeemRewardId: null });
    });
    
    it('switches to new reward if different from current', () => {
      const res = toggleRewardSelection(false, '123', 'reward', '456');
      expect(res).toEqual({ usePoints: false, redeemRewardId: '456' });
    });
  });
});
