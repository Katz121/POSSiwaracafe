/**
 * AI Smart Alerts Service
 * Analyzes shop data and generates intelligent alerts
 */

// Alert types
export const ALERT_TYPES = {
  LOW_STOCK: 'low_stock',
  SALES_DROP: 'sales_drop',
  HIGH_EXPENSE: 'high_expense',
  REVENUE_MILESTONE: 'revenue_milestone',
  PEAK_HOUR: 'peak_hour',
  WASTE_WARNING: 'waste_warning'
};

// Alert severity
export const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
  SUCCESS: 'success'
};

/**
 * Generate smart alerts based on current shop data
 */
export const generateSmartAlerts = (data) => {
  const {
    orders = [],
    expenses = [],
    stock = [],
    members = [],
    today,
    currentMonth
  } = data;

  const alerts = [];

  // Helper to get order date
  const getOrderDate = (order) => {
    if (order.date) return String(order.date);
    if (order.createdAt?.seconds) {
      const d = new Date(order.createdAt.seconds * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().split('T')[0];
    }
    return '';
  };

  // 1. Low Stock Alerts
  const lowStockItems = stock.filter(s => {
    const qty = Number(s.quantity) || 0;
    const minQty = Number(s.minQuantity) || 5;
    return qty <= minQty;
  });

  if (lowStockItems.length > 0) {
    const criticalItems = lowStockItems.filter(s => Number(s.quantity) === 0);
    const warningItems = lowStockItems.filter(s => Number(s.quantity) > 0);

    if (criticalItems.length > 0) {
      alerts.push({
        id: 'stock_critical',
        type: ALERT_TYPES.LOW_STOCK,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'สต็อกหมด!',
        message: `${criticalItems.map(s => s.name).join(', ')} หมดแล้ว`,
        count: criticalItems.length,
        action: { label: 'ดูสต็อก', view: 'stock' },
        items: criticalItems
      });
    }

    if (warningItems.length > 0) {
      alerts.push({
        id: 'stock_low',
        type: ALERT_TYPES.LOW_STOCK,
        severity: ALERT_SEVERITY.WARNING,
        title: 'สต็อกใกล้หมด',
        message: `${warningItems.length} รายการต้องสั่งเพิ่ม`,
        count: warningItems.length,
        action: { label: 'ดูสต็อก', view: 'stock' },
        items: warningItems
      });
    }
  }

  // 2. Sales Performance Alert (compare today vs average)
  const completedOrders = orders.filter(o => o.status === 'completed');
  const todayOrders = completedOrders.filter(o => getOrderDate(o) === today);
  const todayRevenue = todayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

  // Calculate 7-day average
  const last7Days = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7Days.push(dateStr);
  }

  const last7DaysOrders = completedOrders.filter(o => last7Days.includes(getOrderDate(o)));
  const avgDailyRevenue = last7DaysOrders.length > 0
    ? last7DaysOrders.reduce((s, o) => s + (Number(o.total) || 0), 0) / 7
    : 0;

  if (avgDailyRevenue > 0) {
    const revenueChange = ((todayRevenue - avgDailyRevenue) / avgDailyRevenue) * 100;

    if (revenueChange <= -30) {
      alerts.push({
        id: 'sales_drop',
        type: ALERT_TYPES.SALES_DROP,
        severity: ALERT_SEVERITY.WARNING,
        title: 'ยอดขายวันนี้ต่ำ',
        message: `ยอดขาย ฿${todayRevenue.toLocaleString()} ต่ำกว่าค่าเฉลี่ย ${Math.abs(Math.round(revenueChange))}%`,
        data: { todayRevenue, avgDailyRevenue, change: revenueChange },
        action: { label: 'ดูรายละเอียด', view: 'dashboard' }
      });
    } else if (revenueChange >= 50) {
      alerts.push({
        id: 'sales_surge',
        type: ALERT_TYPES.REVENUE_MILESTONE,
        severity: ALERT_SEVERITY.SUCCESS,
        title: 'ยอดขายวันนี้ดีมาก!',
        message: `ยอดขาย ฿${todayRevenue.toLocaleString()} สูงกว่าค่าเฉลี่ย ${Math.round(revenueChange)}%`,
        data: { todayRevenue, avgDailyRevenue, change: revenueChange },
        action: { label: 'ดูรายละเอียด', view: 'dashboard' }
      });
    }
  }

  // 3. High Expense Alert
  const todayExpenses = expenses.filter(e => e.date === today);
  const todayExpenseTotal = todayExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Get monthly average daily expense
  const monthExpenses = expenses.filter(e => (e.date || '').startsWith(currentMonth));
  const avgDailyExpense = monthExpenses.length > 0
    ? monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) / 30
    : 0;

  if (avgDailyExpense > 0 && todayExpenseTotal > avgDailyExpense * 2) {
    alerts.push({
      id: 'high_expense',
      type: ALERT_TYPES.HIGH_EXPENSE,
      severity: ALERT_SEVERITY.WARNING,
      title: 'รายจ่ายวันนี้สูง',
      message: `รายจ่าย ฿${todayExpenseTotal.toLocaleString()} สูงกว่าปกติ ${Math.round((todayExpenseTotal / avgDailyExpense - 1) * 100)}%`,
      data: { todayExpenseTotal, avgDailyExpense },
      action: { label: 'ดูรายจ่าย', view: 'expenses' }
    });
  }

  // 4. Waste Warning
  const wasteExpenses = expenses.filter(e =>
    (e.date || '').startsWith(currentMonth) &&
    (String(e.category).toLowerCase().includes('waste') ||
      String(e.title).includes('ทิ้ง') ||
      String(e.title).includes('เสีย'))
  );
  const totalWaste = wasteExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthRevenue = completedOrders
    .filter(o => (getOrderDate(o) || '').startsWith(currentMonth))
    .reduce((s, o) => s + (Number(o.total) || 0), 0);

  if (monthRevenue > 0 && totalWaste / monthRevenue > 0.05) {
    alerts.push({
      id: 'waste_high',
      type: ALERT_TYPES.WASTE_WARNING,
      severity: ALERT_SEVERITY.WARNING,
      title: 'ของเสียสูง',
      message: `ต้นทุนของเสียเดือนนี้ ฿${totalWaste.toLocaleString()} (${Math.round(totalWaste / monthRevenue * 100)}% ของรายได้)`,
      data: { totalWaste, monthRevenue },
      action: { label: 'ดูรายจ่าย', view: 'expenses' }
    });
  }

  // 5. Peak Hour Alert (if current hour is approaching peak)
  const now = new Date();
  const currentHour = now.getHours();

  // Calculate peak hours from order data
  const hourlyOrders = {};
  completedOrders.forEach(o => {
    if (o.createdAt?.seconds) {
      const hour = new Date(o.createdAt.seconds * 1000).getHours();
      hourlyOrders[hour] = (hourlyOrders[hour] || 0) + 1;
    }
  });

  const peakHour = Object.entries(hourlyOrders)
    .sort((a, b) => b[1] - a[1])[0];

  if (peakHour && Math.abs(Number(peakHour[0]) - currentHour) === 1) {
    alerts.push({
      id: 'peak_hour',
      type: ALERT_TYPES.PEAK_HOUR,
      severity: ALERT_SEVERITY.INFO,
      title: 'ใกล้ช่วง Rush Hour',
      message: `ช่วง ${peakHour[0]}:00-${Number(peakHour[0]) + 1}:00 น. มักมีลูกค้าเยอะ`,
      data: { peakHour: Number(peakHour[0]), orderCount: peakHour[1] }
    });
  }

  // 6. New Member Alert
  const todayMembers = members.filter(m => {
    if (!m.createdAt) return false;
    const date = m.createdAt.seconds
      ? new Date(m.createdAt.seconds * 1000)
      : new Date(m.createdAt);
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0] === today;
  });

  if (todayMembers.length > 0) {
    alerts.push({
      id: 'new_members',
      type: ALERT_TYPES.REVENUE_MILESTONE,
      severity: ALERT_SEVERITY.SUCCESS,
      title: 'สมาชิกใหม่วันนี้',
      message: `มีสมาชิกสมัครใหม่ ${todayMembers.length} คน`,
      count: todayMembers.length,
      action: { label: 'ดูสมาชิก', view: 'members_manage' }
    });
  }

  // Sort by severity
  const severityOrder = {
    [ALERT_SEVERITY.CRITICAL]: 0,
    [ALERT_SEVERITY.WARNING]: 1,
    [ALERT_SEVERITY.INFO]: 2,
    [ALERT_SEVERITY.SUCCESS]: 3
  };

  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
};

/**
 * Get alert icon based on type
 */
export const getAlertIcon = (type) => {
  switch (type) {
    case ALERT_TYPES.LOW_STOCK: return 'Package';
    case ALERT_TYPES.SALES_DROP: return 'TrendingDown';
    case ALERT_TYPES.HIGH_EXPENSE: return 'DollarSign';
    case ALERT_TYPES.REVENUE_MILESTONE: return 'Trophy';
    case ALERT_TYPES.PEAK_HOUR: return 'Clock';
    case ALERT_TYPES.WASTE_WARNING: return 'Trash2';
    default: return 'Bell';
  }
};

/**
 * Get alert color based on severity
 */
export const getAlertColor = (severity) => {
  switch (severity) {
    case ALERT_SEVERITY.CRITICAL: return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', icon: 'text-red-500' };
    case ALERT_SEVERITY.WARNING: return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500' };
    case ALERT_SEVERITY.SUCCESS: return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-500' };
    case ALERT_SEVERITY.INFO:
    default: return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-500' };
  }
};
