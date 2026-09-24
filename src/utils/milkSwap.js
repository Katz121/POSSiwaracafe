/**
 * นมโอ๊ต: ตัดสต็อกแทนนมวัว
 *
 * เมนูที่เลือกนมได้ (ลาเต้/latte · `supportsMilkChoice`) ผูกสูตรกับนมวัว (นมจืด/นมสด/นมตีฟอง)
 * ลูกค้าเลือกนมโอ๊ตแล้ว (`item.milkType === 'oat'`) บิลยังพกสูตรนมวัวมา ทั้งจาก POS และ
 * QR (Cloud Function ประกอบ stockLinks เองฝั่งเซิร์ฟเวอร์) · จึงสลับตอน "ตัดสต็อก" แทน
 * ปริมาณเท่าเดิม แค่เปลี่ยนตัวที่ถูกตัด
 *
 * ตั้งค่าที่ `config/settings.milkSwap = { oat: { from: [stockId...], to: stockId } }`
 * ถ้ายังไม่ตั้ง ใช้ค่าเริ่มต้นจากชื่อสต็อก (`defaultMilkSwap`)
 *
 * ทั้งไฟล์เป็นฟังก์ชันบริสุทธิ์ ไม่แตะ Firestore · เทสต์ใน milkSwap.test.js
 */

import { isArchivedStock, resolveStockId } from './stockMerge.js';

/** ชื่อสต็อกนมวัวที่สลับออกโดยค่าเริ่มต้น */
export const DEFAULT_COW_MILK_PATTERN = /^(นมจืด|นมสด|นมตีฟอง)$/;
/** ชื่อสต็อกนมโอ๊ตที่ตัดแทนโดยค่าเริ่มต้น */
export const DEFAULT_OAT_MILK_NAME = 'นมโอ๊ต';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const cleanName = (s) => String(s?.name || '').trim();

/**
 * ค่าเริ่มต้นจากชื่อสต็อก · ข้ามตัวที่ถูกรวม/เก็บเข้ากรุ
 * @returns {{ oat: { from: string[], to: string|null } }}
 */
export function defaultMilkSwap(stock = []) {
  const live = (Array.isArray(stock) ? stock : []).filter((s) => s?.id && !isArchivedStock(s));
  const from = live.filter((s) => DEFAULT_COW_MILK_PATTERN.test(cleanName(s))).map((s) => s.id);
  const oat = live.find((s) => cleanName(s) === DEFAULT_OAT_MILK_NAME);
  return { oat: { from, to: oat?.id || null } };
}

/**
 * ค่าที่บันทึกไว้ใช้ได้ไหม (`oat.to` เป็นสตริง และ `oat.from` เป็นอาเรย์)
 * `to: ''` = เจ้าของร้านปิดการสลับเอง ไม่ย้อนไปใช้ค่าเริ่มต้น
 */
export const isMilkSwapSet = (setting) => Boolean(
  setting?.oat && typeof setting.oat.to === 'string' && Array.isArray(setting.oat.from),
);

/**
 * ค่าที่ใช้จริง · ตั้งไว้แล้วใช้ตามนั้น ไม่งั้นใช้ค่าเริ่มต้น
 * @returns {{ oat: { from: string[], to: string|null }, isDefault: boolean }}
 */
export function resolveMilkSwap(setting, stock = []) {
  if (isMilkSwapSet(setting)) {
    const from = setting.oat.from.filter((id) => typeof id === 'string' && id && id !== setting.oat.to);
    return { oat: { from, to: setting.oat.to || null }, isDefault: false };
  }
  return { ...defaultMilkSwap(stock), isDefault: true };
}

/**
 * สูตรที่ควรตัดจริงของรายการหนึ่ง
 * ลูกค้าเลือกนมโอ๊ต → ลิงก์ที่ชี้นมวัว (`from`) เปลี่ยนเป็น `to` ปริมาณเท่าเดิม
 * ถ้าสูตรมี `to` อยู่แล้วบวกรวมกัน · กรณีอื่นคืนสูตรเดิม (อาเรย์ตัวเดิม)
 *
 * @param {object} item รายการในบิล
 * @param {object} milkSwap ค่าที่ใช้จริง (`resolveMilkSwap`)
 * @param {Map} [stockById] ส่งมาเพื่อจับลิงก์ที่ชี้สต็อกที่ถูกรวมเข้ากับนมวัวด้วย
 * @returns {Array}
 */
export function applyMilkSwap(item, milkSwap, stockById) {
  const links = Array.isArray(item?.stockLinks) ? item.stockLinks : [];
  const to = milkSwap?.oat?.to;
  const fromIds = Array.isArray(milkSwap?.oat?.from) ? milkSwap.oat.from : [];
  if (item?.milkType !== 'oat' || !to || !fromIds.length || !links.length) return links;

  const resolve = (id) => (stockById ? resolveStockId(id, stockById) : id);
  const from = new Set(fromIds.flatMap((id) => [id, resolve(id)]));
  const isFrom = (id) => Boolean(id) && (from.has(id) || from.has(resolve(id))) && resolve(id) !== resolve(to);
  if (!links.some((l) => isFrom(l?.stockId))) return links;

  const out = [];
  let target = null;
  links.forEach((link) => {
    const swapped = isFrom(link?.stockId);
    const isTo = swapped || (link?.stockId && resolve(link.stockId) === resolve(to));
    if (!isTo) {
      out.push(link);
      return;
    }
    if (target) {
      target.usage = num(target.usage) + num(link.usage);
      return;
    }
    target = { ...link, stockId: swapped ? to : link.stockId, usage: num(link.usage) };
    out.push(target);
  });
  return out;
}
