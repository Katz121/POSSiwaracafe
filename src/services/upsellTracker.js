/**
 * AI Upsell Tracking Service
 * Tracks the effectiveness of AI recommendations
 */

const STORAGE_KEY = 'pos-upsell-stats';

// Initialize or get existing stats
const getStats = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading upsell stats:', e);
  }
  return {
    totalSessions: 0,
    recommendationsShown: 0,
    recommendationsAccepted: 0,
    revenueFromUpsells: 0,
    dailyStats: {},
    itemStats: {} // Track which items are most effective
  };
};

// Save stats
const saveStats = (stats) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Error saving upsell stats:', e);
  }
};

// Get today's date key
const getDateKey = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

// Ensure daily stats exist
const ensureDailyStats = (stats, dateKey) => {
  if (!stats.dailyStats[dateKey]) {
    stats.dailyStats[dateKey] = {
      shown: 0,
      accepted: 0,
      revenue: 0
    };
  }
  return stats;
};

/**
 * Track when recommendations are shown to user
 */
export const trackRecommendationsShown = (recommendedItems = []) => {
  const stats = getStats();
  const dateKey = getDateKey();
  ensureDailyStats(stats, dateKey);

  stats.totalSessions++;
  stats.recommendationsShown += recommendedItems.length;
  stats.dailyStats[dateKey].shown += recommendedItems.length;

  // Track individual items
  recommendedItems.forEach(item => {
    if (!stats.itemStats[item.name]) {
      stats.itemStats[item.name] = { shown: 0, accepted: 0, revenue: 0 };
    }
    stats.itemStats[item.name].shown++;
  });

  saveStats(stats);
};

/**
 * Track when a recommendation is accepted (added to cart)
 */
export const trackRecommendationAccepted = (item) => {
  const stats = getStats();
  const dateKey = getDateKey();
  ensureDailyStats(stats, dateKey);

  const price = Number(item.price) || 0;

  stats.recommendationsAccepted++;
  stats.revenueFromUpsells += price;
  stats.dailyStats[dateKey].accepted++;
  stats.dailyStats[dateKey].revenue += price;

  // Track individual item
  if (!stats.itemStats[item.name]) {
    stats.itemStats[item.name] = { shown: 0, accepted: 0, revenue: 0 };
  }
  stats.itemStats[item.name].accepted++;
  stats.itemStats[item.name].revenue += price;

  saveStats(stats);
};

/**
 * Get current upsell statistics
 */
export const getUpsellStats = () => {
  const stats = getStats();
  const dateKey = getDateKey();

  // Calculate conversion rate
  const conversionRate = stats.recommendationsShown > 0
    ? (stats.recommendationsAccepted / stats.recommendationsShown * 100).toFixed(1)
    : 0;

  // Get today's stats
  const todayStats = stats.dailyStats[dateKey] || { shown: 0, accepted: 0, revenue: 0 };
  const todayConversion = todayStats.shown > 0
    ? (todayStats.accepted / todayStats.shown * 100).toFixed(1)
    : 0;

  // Get top performing items
  const topItems = Object.entries(stats.itemStats)
    .map(([name, data]) => ({
      name,
      ...data,
      conversionRate: data.shown > 0 ? (data.accepted / data.shown * 100).toFixed(1) : 0
    }))
    .sort((a, b) => b.accepted - a.accepted)
    .slice(0, 5);

  // Get last 7 days trend
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    last7Days.push({
      date: key,
      ...stats.dailyStats[key] || { shown: 0, accepted: 0, revenue: 0 }
    });
  }

  return {
    // Overall stats
    totalSessions: stats.totalSessions,
    totalShown: stats.recommendationsShown,
    totalAccepted: stats.recommendationsAccepted,
    totalRevenue: stats.revenueFromUpsells,
    conversionRate,

    // Today
    todayShown: todayStats.shown,
    todayAccepted: todayStats.accepted,
    todayRevenue: todayStats.revenue,
    todayConversion,

    // Insights
    topItems,
    last7Days,

    // Average revenue per accepted recommendation
    avgRevenuePerUpsell: stats.recommendationsAccepted > 0
      ? Math.round(stats.revenueFromUpsells / stats.recommendationsAccepted)
      : 0
  };
};

/**
 * Clear all upsell statistics (for testing/reset)
 */
export const clearUpsellStats = () => {
  localStorage.removeItem(STORAGE_KEY);
};

/**
 * Export stats as JSON (for backup/analysis)
 */
export const exportUpsellStats = () => {
  const stats = getStats();
  const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `upsell-stats-${getDateKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
