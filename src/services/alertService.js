/**
 * AI Smart Alerts Service
 * Analyzes shop data and generates intelligent alerts
 */
import { getOrderDate } from '../utils/calculations';
import { isEquipmentStock } from '../config/constants';
import { auditMenuLinks, auditDay } from '../utils/stockAudit';
import { isArchivedStock } from '../utils/stockMerge';

// Alert types
export const ALERT_TYPES = {
  LOW_STOCK: 'low_stock',
  SALES_DROP: 'sales_drop',
  HIGH_EXPENSE: 'high_expense',
  REVENUE_MILESTONE: 'revenue_milestone',
  PEAK_HOUR: 'peak_hour',
  WASTE_WARNING: 'waste_warning',
  STOCK_LINK: 'stock_link',
  STOCK_AUDIT: 'stock_audit'
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
    menu = [],
    beanModifiers = [],
    today,
    currentMonth,
    milkSwap,
  } = data;

  const alerts = [];

  // getOrderDate imported from utils/calculations

  // 1. Low Stock Alerts
  // สต็อกที่ถูกรวมไปแล้ว (ยอด 0) ไม่ใช่ของหมด · ยังส่งมาทั้งหมดเพื่อให้ตรวจบิลเก่าเดินตาม mergedInto ได้
  // ของใช้/อุปกรณ์ใช้ซ้ำได้ ไม่เตือนใกล้หมด
  const lowStockItems = stock.filter(s => !isArchivedStock(s) && !isEquipmentStock(s)).filter(s => {
    const qty = Number(s.quantity) || 0;
    const minQty = Number(s.minQuantity) || 5;
    return qty <= minQty;
  });

  if (lowStockItems.length > 0) {
    // ติดลบนับเป็น "หมด" ด้วย · เดิมเทียบ === 0 สต็อกติดลบจึงตกทั้งสองกลุ่มแล้วไม่เตือนเลย
    const criticalItems = lowStockItems.filter(s => Number(s.quantity) <= 0);
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

  // 1b. เมนูที่เปิดขายแต่ตัดสต็อกไม่ได้ (ไม่ผูก / ผูกกับสต็อกที่ถูกลบ)
  if (menu.length && stock.length) {
    const links = auditMenuLinks({ menu, stock, beanModifiers });
    const unlinked = links.items.filter(i => i.status === 'unlinked');
    const broken = links.items.filter(i => i.status === 'dead' || i.status === 'partial');
    if (unlinked.length) {
      alerts.push({
        id: 'menu_unlinked',
        type: ALERT_TYPES.STOCK_LINK,
        severity: ALERT_SEVERITY.WARNING,
        title: 'เมนูยังไม่ผูกสต็อก',
        message: `${unlinked.length} เมนูที่เปิดขาย ขายแล้วสต็อกไม่ลด: ${unlinked.slice(0, 4).map(i => i.name).join(', ')}${unlinked.length > 4 ? '…' : ''}`,
        count: unlinked.length,
        action: { label: 'ตรวจสต็อก', view: 'stock_audit' },
        items: unlinked
      });
    }
    if (broken.length || links.modifiers.length) {
      alerts.push({
        id: 'menu_dead_link',
        type: ALERT_TYPES.STOCK_LINK,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'สูตรชี้ไปสต็อกที่ถูกลบ',
        message: `${broken.length} เมนู${links.modifiers.length ? ` + ${links.modifiers.length} ตัวเลือก` : ''} ตัดสต็อกไม่ครบ ต้องผูกใหม่`,
        count: broken.length + links.modifiers.length,
        action: { label: 'ตรวจสต็อก', view: 'stock_audit' },
        items: broken
      });
    }
  }

  // 1c. วันนี้มีบิลที่ตัดสต็อกไม่ครบหรือไม่ตรงสูตร
  if (orders.length && stock.length && today) {
    const { summary } = auditDay({ orders, stock, menu, date: today, milkSwap });
    if (summary.billsMissed || summary.billsMismatch) {
      alerts.push({
        id: 'stock_audit_today',
        type: ALERT_TYPES.STOCK_AUDIT,
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'วันนี้ตัดสต็อกผิด',
        message: `${summary.billsMissed + summary.billsMismatch} บิลตัดสต็อกไม่ครบหรือไม่ตรงสูตร`,
        count: summary.billsMissed + summary.billsMismatch,
        action: { label: 'ดูรายละเอียด', view: 'stock_audit' },
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
  const daysWithData = new Set(last7DaysOrders.map(o => getOrderDate(o))).size;
  const avgDailyRevenue = daysWithData > 0
    ? last7DaysOrders.reduce((s, o) => s + (Number(o.total) || 0), 0) / daysWithData
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

  // Get monthly average daily expense — divide by the number of days that
  // actually have expense records, not a hardcoded 30. Using days-with-activity
  // keeps the average meaningful for short months (Feb) and early in the month.
  const monthExpenses = expenses.filter(e => (e.date || '').startsWith(currentMonth));
  const activeDays = new Set(monthExpenses.map(e => e.date)).size;
  const avgDailyExpense = activeDays > 0
    ? monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) / activeDays
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
    case ALERT_SEVERITY.CRITICAL: return { bg: 'bg-[var(--state-danger-soft)]', border: 'border-[var(--state-danger)]', text: 'text-[var(--state-danger)]', icon: 'text-[var(--state-danger)]' };
    case ALERT_SEVERITY.WARNING: return { bg: 'bg-[var(--state-warn-soft)]', border: 'border-[var(--state-warn)]', text: 'text-[var(--state-warn)]', icon: 'text-[var(--state-warn)]' };
    case ALERT_SEVERITY.SUCCESS: return { bg: 'bg-[var(--state-ok-soft)]', border: 'border-[var(--state-ok)]', text: 'text-[var(--state-ok)]', icon: 'text-[var(--state-ok)]' };
    case ALERT_SEVERITY.INFO:
    default: return { bg: 'bg-[var(--state-info-soft)]', border: 'border-[var(--state-info)]', text: 'text-[var(--state-info)]', icon: 'text-[var(--state-info)]' };
  }
};
