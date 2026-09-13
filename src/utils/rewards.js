/**
 * Filter rewards that are enabled and the member has enough points for.
 */
export const getEligibleRewards = (rewards, memberPoints) => {
  if (!Array.isArray(rewards)) return [];
  const points = Number(memberPoints) || 0;
  return rewards.filter(r => r.enabled && points >= (Number(r.cost) || 0));
};

/**
 * Handle mutually exclusive selection between using cash discount (usePoints) and a reward.
 * Returns { usePoints, redeemRewardId }
 */
export const toggleRewardSelection = (currentUsePoints, currentRewardId, newSelectionType, newRewardId = null) => {
  if (newSelectionType === 'discount') {
    // Toggle discount. If it becomes true, clear reward.
    const willUsePoints = !currentUsePoints;
    return {
      usePoints: willUsePoints,
      redeemRewardId: null
    };
  }
  
  if (newSelectionType === 'reward') {
    // Toggle reward. If clicking the same reward, turn it off. If different, turn it on. Clear discount.
    const isSameReward = currentRewardId === newRewardId;
    return {
      usePoints: false,
      redeemRewardId: isSameReward ? null : newRewardId
    };
  }
  
  return { usePoints: currentUsePoints, redeemRewardId: currentRewardId };
};
