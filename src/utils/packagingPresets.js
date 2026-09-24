/**
 * ชุดแก้ว/หลอด (ทางลัดตอนผูกสต็อกเมนู) · ร้านตั้งเองที่ ตั้งค่า → ตัวเลือกเมนู
 * บันทึกที่ config/settings.packagingPresets = [{ id, label, links: [{ stockId, usage }] }]
 * ยังไม่ตั้ง = ค่าเริ่มต้นเดาจากชื่อสต็อก (แก้ว 3 ขนาดของร้าน + หลอด) ให้เห็นก่อนแล้วกดบันทึกยืนยัน
 */
import { activeStock } from './stockMerge.js';

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

// ชื่อที่ร้านใช้จริง (2026-09-24): แก้ว 14 oz · แก้วน้ำพร้อมฝา 16z ขุ่น · แก้ว 16 oz (ใส) · หลอด
const DEFAULT_RULES = [
  { id: 'cup14', label: 'แก้ว 14oz', match: (n) => /แก้ว14oz/.test(n) },
  { id: 'cup16cloudy', label: 'แก้ว 16oz ขุ่น', match: (n) => /แก้ว.*16(oz|z).*ขุ่น/.test(n) },
  { id: 'cup16clear', label: 'แก้ว 16oz ใส', match: (n) => /^แก้ว16oz(ใส)?$/.test(n) },
  { id: 'straw', label: 'หลอด', match: (n) => n === 'หลอด' },
];

export function defaultPackagingPresets(stock = []) {
  const live = activeStock(stock);
  return DEFAULT_RULES.map((r) => {
    const s = live.find((x) => r.match(norm(x.name)));
    return { id: r.id, label: r.label, links: s ? [{ stockId: s.id, usage: 1 }] : [] };
  }).filter((p) => p.links.length);
}

/** ค่าที่ใช้จริง · ตั้งแล้วใช้ของร้าน (ตัดลิงก์ที่ชี้สต็อกหายไป) · ไม่ตั้งใช้ค่าเริ่มต้น */
export function resolvePackagingPresets(setting, stock = []) {
  if (!Array.isArray(setting)) return { presets: defaultPackagingPresets(stock), isDefault: true };
  const ids = new Set(stock.map((s) => s.id));
  const presets = setting
    .map((p) => ({ id: String(p.id || ''), label: String(p.label || '').trim(), links: (p.links || []).filter((l) => ids.has(l?.stockId)).map((l) => ({ stockId: l.stockId, usage: Number(l.usage) || 1 })) }))
    .filter((p) => p.label && p.links.length);
  return { presets, isDefault: false };
}

/**
 * ใส่ชุดลงสูตร · วัตถุดิบที่มีอยู่แล้วไม่ใส่ซ้ำ (กันแก้วนับ 2 ใบ)
 * whole = โหมดสูตรทั้งก้อน · ใส่ perWhole = ชิ้น × usage ให้ต่อชิ้นออกมาเท่า usage
 */
export function applyPackagingPreset(links = [], preset, { whole = false, pieces = 0 } = {}) {
  const have = new Set(links.map((l) => l?.stockId).filter(Boolean));
  const add = (preset?.links || []).filter((l) => !have.has(l.stockId)).map((l) => (whole
    ? { stockId: l.stockId, usage: Number(l.usage) || 1, perWhole: pieces > 0 ? String((Number(l.usage) || 1) * pieces) : '' }
    : { stockId: l.stockId, usage: Number(l.usage) || 1 }));
  return { links: [...links.filter((l) => l?.stockId || l?.usage), ...add], added: add.length };
}
