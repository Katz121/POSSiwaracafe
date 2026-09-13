import { parseInstant } from './pointsLogic.js';

/** จำนวนบิลที่ถือว่าเป็นลูกค้าประจำ — ปรับได้ */
export const REGULAR_THRESHOLD = 5;
/** โชว์ "หายไป N วัน" เมื่อห่างอย่างน้อยกี่วัน */
export const DAYS_AWAY_THRESHOLD = 14;
/** จำกัด query ประวัติออเดอร์หลัง checkout ไม่ให้ช้า */
export const MEMBER_ORDERS_QUERY_LIMIT = 50;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeDaysAway(lastOrderAt, now = new Date()) {
  const last = parseInstant(lastOrderAt);
  if (!last) return null;
  const elapsed = now.getTime() - last.getTime();
  if (!Number.isFinite(elapsed)) return null;
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / MS_PER_DAY);
}

function favoriteItemName(orders) {
  const counts = new Map();
  for (const order of orders) {
    for (const item of order?.items || []) {
      const name = String(item?.name || '').trim();
      if (!name) continue;
      const qty = Number(item?.quantity);
      counts.set(name, (counts.get(name) || 0) + (Number.isFinite(qty) && qty > 0 ? qty : 1));
    }
  }
  let bestName = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestName = name;
      bestCount = count;
    }
  }
  return bestName;
}

function normalizeDaysAway(daysAway) {
  if (daysAway == null || daysAway === '') return null;
  const value = Number(daysAway);
  return Number.isFinite(value) ? value : null;
}

export function buildMemberContext({
  orders,
  daysAway,
  regularThreshold = REGULAR_THRESHOLD,
} = {}) {
  const list = Array.isArray(orders) ? orders : [];
  const threshold = Number(regularThreshold);
  const cutoff = Number.isFinite(threshold) && threshold > 0 ? threshold : REGULAR_THRESHOLD;
  return {
    isRegular: list.length >= cutoff,
    favoriteItem: favoriteItemName(list),
    orderCount: list.length,
    daysAway: normalizeDaysAway(daysAway),
  };
}

export function formatMemberContextLine(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const parts = [];
  if (ctx.isRegular) parts.push('ลูกค้าประจำ');
  const favorite = ctx.favoriteItem == null ? '' : String(ctx.favoriteItem).trim();
  if (favorite) parts.push(`ชอบ ${favorite}`);
  const days = Number(ctx.daysAway);
  if (Number.isFinite(days) && days >= DAYS_AWAY_THRESHOLD) {
    parts.push(`หายไป ${Math.floor(days)} วัน`);
  }
  if (!parts.length) return '';
  return `⭐ ${parts.join(' · ')}`;
}
