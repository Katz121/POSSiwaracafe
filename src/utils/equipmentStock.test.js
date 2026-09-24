import { describe, it, expect } from 'vitest';
import { isInventoryCategory } from './stockIntake.js';
import { DEFAULT_INVENTORY_CATEGORIES } from './profitability.js';
import { stockStatus } from '../components/views/inventory/stockStatus.js';
import { generateSmartAlerts } from '../services/alertService.js';

describe('อุปกรณ์และของใช้ ไม่ใช่ของเข้าคลัง', () => {
  it('ซื้อแล้วไม่เข้าสต็อก และนับเป็นรายจ่ายของงวด', () => {
    expect(isInventoryCategory('อุปกรณ์และของใช้')).toBe(false);
    expect(isInventoryCategory('บรรจุภัณฑ์')).toBe(true);
    expect(DEFAULT_INVENTORY_CATEGORIES).not.toContain('อุปกรณ์และของใช้');
  });
  it('ไม่เตือนใกล้หมด', () => {
    const item = { id: 'a', name: 'กระปุกสแตนเลส', category: 'อุปกรณ์และของใช้', quantity: 1, minQuantity: 5 };
    expect(stockStatus(item).key).toBe('equipment');
    const alerts = generateSmartAlerts({ stock: [item], orders: [], expenses: [], today: '2026-09-24', currentMonth: '2026-09' });
    expect(alerts.some((a) => a.id === 'stock_low' || a.id === 'stock_critical')).toBe(false);
  });
});
