/**
 * รวมวัตถุดิบที่ซ้ำกัน + แก้หน่วยที่สะกดผิด
 *
 * ข้อมูลจริง 2026-09-24 มีสต็อกตัวเดียวกันที่ถูกสร้างซ้ำคนละชื่อ (ไข่ไก่/ไขไก่,
 * น้ำตาลเบเกอรี่/น้ำตาลทรายเบเกอรี่, วิปครีม กล่องเหลือง/วิปปิ้งครีม กล่องเหลือง)
 * ผลคือของเข้าไปลงตัวหนึ่ง แต่เมนูตัดอีกตัว · ตัวหนึ่งติดลบ อีกตัวค้างไม่ขยับ
 *
 * **หลักการรวม**
 * 1. ไม่ลบเอกสารที่ถูกรวม · ตั้ง `mergedInto` + `archived` + ยอด 0 ไว้แทน
 *    บิลเก่าพก stockId เดิมติดตัว (item.stockLinks) ถ้าลบทิ้ง บิลเก่าจะกลายเป็น
 *    "ลิงก์เสีย" ในหน้าตรวจ และกำไรต่อเมนูย้อนหลังหาต้นทุนไม่เจอ
 *    เอกสารเดิมจึงยังเก็บ unitCost ของมันไว้ให้ประวัติคิดต้นทุนได้เหมือนเดิม
 * 2. ทุกที่ที่อ่าน stockId ต้องเดินตาม `mergedInto` จนสุดสาย (`resolveStockId`)
 *    ก่อนตัดสต็อก · บิลที่ค้างอยู่ตอนรวมจะไปตัดตัวที่เก็บไว้ ไม่ใช่ตัวที่เก็บเข้ากรุ
 * 3. ต้นทุนต่อหน่วยใหม่ = ถัวเฉลี่ยถ่วงน้ำหนักด้วยยอดคงเหลือ กติกาเดียวกับ
 *    การรับของเข้า (`weightedAverageUnitCost` ใน stockIntake.js) ดู `mergedUnitCost`
 *
 * ทั้งไฟล์เป็นฟังก์ชันบริสุทธิ์ ไม่แตะ Firestore · เทสต์ใน stockMerge.test.js
 */

import { mergeStockLinks } from './stockLinks.js';
import { normalizeUnit, roundUnitCost, weightedAverageUnitCost } from './stockIntake.js';

export { normalizeUnit };

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** ปัดปริมาณ 6 ตำแหน่ง กันเลขลอย 0.30000000000000004 ตอนรวม usage */
export const roundQty6 = (value) => Math.round(num(value) * 1e6) / 1e6;

/** สต็อกที่ถูกรวมไปแล้ว หรือถูกเก็บเข้ากรุ · ไม่แสดงในรายการ/ตัวเลือก */
export const isArchivedStock = (item) => Boolean(item?.archived || item?.mergedInto);
export const activeStock = (stock = []) => stock.filter((s) => !isArchivedStock(s));

/**
 * เดินตาม `mergedInto` จนสุดสาย · A→B→C คืน C
 * กันวน (A→B→A) ด้วยการจำที่เคยผ่าน · เจอวนแล้วหยุดที่ตัวสุดท้ายก่อนวน
 * สายที่ชี้ไปเอกสารที่ไม่มีอยู่ คืน id ปลายทางนั้น (ผู้เรียกจะเห็นว่าหาไม่เจอ = ลิงก์เสีย)
 *
 * @param {string} id
 * @param {Map<string, object>} stockById
 */
export function resolveStockId(id, stockById) {
  if (!id || !stockById) return id;
  let current = id;
  const seen = new Set([current]);
  for (;;) {
    const next = stockById.get(current)?.mergedInto;
    if (!next || seen.has(next)) return current;
    seen.add(next);
    current = next;
  }
}

// ── ชื่อซ้ำ ──────────────────────────────────────────────────────────────────

/** ตัดช่องว่าง วงเล็บ จุด ขีด และตัวพิมพ์ · "วิปครีม (กล่องเหลือง)" → "วิปครีมกล่องเหลือง" */
export function normalizeStockName(name) {
  return String(name || '')
    .toLocaleLowerCase('th')
    .replace(/[\s()[\]{}.,\-_/]+/g, '');
}

/** ระยะแก้ไข (Levenshtein) นับทีละ code unit · สระ/วรรณยุกต์ไทยนับเป็นหนึ่งตัว */
export function editDistance(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[t.length];
}

/**
 * ชื่อสั้นได้จากชื่อยาวโดยแทรกคำหนึ่งช่วง "ตรงกลาง" ไหม
 * "วิปครีม" ↔ "วิปปิ้งครีม" (แทรก "ปิ้ง") · "น้ำตาลเบเกอรี่" ↔ "น้ำตาลทรายเบเกอรี่" (แทรก "ทราย")
 * ต่อท้าย/นำหน้าไม่นับ เพราะส่วนใหญ่เป็นของคนละตัว ("น้ำตาลทราย" ↔ "น้ำตาลทรายแดง")
 */
function middleInsertion(short, long, maxInsert = 5) {
  const extra = long.length - short.length;
  if (extra <= 0 || extra > maxInsert) return false;
  let p = 0;
  while (p < short.length && short[p] === long[p]) p += 1;
  if (p < 2) return false;
  const tail = short.slice(p);
  return tail.length >= 2 && long.endsWith(tail);
}

const digitsOf = (norm) => (norm.match(/\d+(?:[./]\d+)?/g) || []).join(',');

/** หน่วยเทียบกันได้ไหม · "กรัท" ≡ "กรัม" */
export const sameUnit = (a, b) => normalizeUnit(a) === normalizeUnit(b);

/**
 * คู่สต็อกที่น่าจะเป็นของชิ้นเดียวกัน
 * strong = พิมพ์ผิดเล็กน้อย (ไข่/ไข · ระยะแก้ไข ≤ 1 ชื่อสั้น, ≤ 2 ชื่อยาว) หรือแทรกคำกลางชื่อ (วิป/วิปปิ้ง)
 * weak   = ชื่อหนึ่งอยู่ในอีกชื่อ (น้ำตาลทราย ⊂ น้ำตาลทรายแดง) · มักเป็นของคนละตัว ให้คนตัดสิน
 * ข้าม   = ตัวเลขในชื่อต่างกัน (กล่อง 1 ปอนด์ / 2 ปอนด์) · คนละขนาด
 * หน่วยต้องเทียบกันได้ และต้องเป็นชนิดเดียวกัน (วัตถุดิบ/ของเตรียม)
 *
 * @returns {Array<{ key, ids:[string,string], names:[string,string], unit, strength:'strong'|'weak', reason }>}
 */
export function suggestDuplicates(stock = []) {
  const items = activeStock(stock)
    .map((s) => ({ s, norm: normalizeStockName(s.name), unit: normalizeUnit(s.unit), kind: s.kind === 'prep' ? 'prep' : 'raw' }))
    .filter((x) => x.norm.length >= 2);
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.unit !== b.unit || a.kind !== b.kind) continue;
      const [short, long] = a.norm.length <= b.norm.length ? [a.norm, b.norm] : [b.norm, a.norm];
      // ตัวเลขต่างกัน = คนละขนาด (กล่องเค้ก 1 ปอนด์ / 2 ปอนด์, แก้ว 14/16 oz) ไม่ใช่พิมพ์ผิด
      const digitsA = digitsOf(a.norm);
      const digitsB = digitsOf(b.norm);
      if (digitsA && digitsB && digitsA !== digitsB) continue;
      let strength = null;
      let reason = '';
      if (short === long) { strength = 'strong'; reason = 'ชื่อเหมือนกัน'; }
      // ต่อท้าย/นำหน้า มักเป็นคนละอย่าง (น้ำตาลทราย ⊂ น้ำตาลทรายแดง) · ให้คนตัดสิน
      else if (long.includes(short)) { strength = 'weak'; reason = 'ชื่อหนึ่งอยู่ในอีกชื่อ'; }
      // ชื่อสั้นยอมพิมพ์ผิดได้ 1 ตัว (นมจืด/เนยจืด ต่าง 2 = คนละของ) · ชื่อยาวยอม 2
      else if (short.length >= 4 && editDistance(short, long) <= (short.length >= 6 ? 2 : 1)) { strength = 'strong'; reason = 'สะกดต่างกันนิดเดียว'; }
      else if (middleInsertion(short, long)) { strength = 'strong'; reason = 'ชื่อต่างกันแค่คำกลาง'; }
      if (!strength) continue;
      if (strength === 'strong' && digitsA !== digitsB) { strength = 'weak'; }
      // ตัวที่ขายผ่านบ่อยกว่า/มียอดมากกว่ามาก่อน · หน้าจอเลือกให้เป็นตัวที่เก็บไว้
      const pair = [a.s, b.s].sort((x, y) => num(y.quantity) - num(x.quantity));
      out.push({
        key: pair.map((p) => p.id).sort().join('|'),
        ids: pair.map((p) => p.id),
        names: pair.map((p) => String(p.name || '')),
        unit: a.unit,
        strength,
        reason,
      });
    }
  }
  const rank = { strong: 0, weak: 1 };
  return out.sort((x, y) => rank[x.strength] - rank[y.strength] || x.names[0].localeCompare(y.names[0], 'th'));
}

// ── วางแผนการรวม ─────────────────────────────────────────────────────────────

/**
 * ต้นทุนต่อหน่วยหลังรวม = ถัวเฉลี่ยถ่วงน้ำหนักด้วยยอดคงเหลือ
 *
 * ข้ามแถวที่ **ยอดคงเหลือ ≤ 0** หรือ **ต้นทุน ≤ 0** เพราะ:
 * - ยอดติดลบ = ขายตัดไปก่อนที่จะลงของเข้า ไม่มีของจริงอยู่ให้ถ่วงน้ำหนัก
 *   ถ้าเอามาคูณจะได้น้ำหนักติดลบ ต้นทุนเพี้ยนได้ทุกทิศ
 * - ต้นทุน 0/ไม่มี = ไม่รู้ต้นทุน ไม่ใช่ได้มาฟรี · ถ้าเฉลี่ยเข้าไปจะดึงต้นทุนลง
 *   ทำให้กำไรต่อเมนูดูดีเกินจริง
 * กติกาเดียวกับ weightedAverageUnitCost (ของเดิมติดลบ/ไม่มีต้นทุน → ใช้ของใหม่)
 * ถ้าไม่มีแถวไหนใช้ได้เลย ใช้ต้นทุนของตัวที่เก็บไว้ (หรือตัวแรกที่มีต้นทุน) · ไม่มีเลยได้ 0
 */
export function mergedUnitCost(items = []) {
  let accQty = 0;
  let accCost = 0;
  items.forEach((it) => {
    const q = num(it?.quantity);
    const c = num(it?.unitCost);
    if (q <= 0 || c <= 0) return;
    accCost = accQty > 0 ? weightedAverageUnitCost({ onHandQty: accQty, onHandUnitCost: accCost, inQty: q, inUnitCost: c }) : roundUnitCost(c);
    accQty += q;
  });
  if (accQty > 0) return accCost;
  const firstCosted = items.find((it) => num(it?.unitCost) > 0);
  return firstCosted ? roundUnitCost(num(firstCosted.unitCost)) : 0;
}

/** เปลี่ยน stockId ในสูตรเมนู/ตัวเลือก แล้วรวมแถวที่กลายเป็นตัวเดียวกัน (บวก usage) */
function rewriteLinks(links, idMap) {
  const list = Array.isArray(links) ? links : [];
  if (!list.some((l) => l?.stockId && idMap.has(l.stockId))) return null;
  const moved = list.map((l) => (l?.stockId && idMap.has(l.stockId) ? { ...l, stockId: idMap.get(l.stockId) } : l));
  return mergeStockLinks(moved).map((l) => ({ ...l, usage: roundQty6(l.usage) }));
}

/** เหมือน rewriteLinks แต่สำหรับสูตรของเตรียม ({ stockId, qty }) */
function rewriteIngredients(ingredients, idMap) {
  const list = Array.isArray(ingredients) ? ingredients : [];
  if (!list.some((l) => l?.stockId && idMap.has(l.stockId))) return null;
  const byId = new Map();
  list.forEach((l) => {
    if (!l?.stockId) return;
    const id = idMap.get(l.stockId) || l.stockId;
    const prev = byId.get(id);
    byId.set(id, prev ? { ...prev, qty: roundQty6(num(prev.qty) + num(l.qty)) } : { ...l, stockId: id, qty: roundQty6(l.qty) });
  });
  return [...byId.values()];
}

function mergeAliases(keep, merged) {
  const seen = new Set();
  const out = [];
  const add = (alias) => {
    if (!alias) return;
    const k = `${alias.barcode || ''}|${String(alias.title || '').trim().toLocaleLowerCase('th')}`;
    if (k === '|' || seen.has(k)) return;
    seen.add(k);
    out.push(alias);
  };
  (keep.purchaseAliases || []).forEach(add);
  merged.forEach((m) => {
    (m.purchaseAliases || []).forEach(add);
    // ใบเสร็จที่เคยพิมพ์ชื่อเก่า ("ไขไก่") ให้เข้าตัวที่เก็บไว้ ไม่สร้างสต็อกใหม่ซ้ำอีก
    if (m.name && String(m.name).trim() !== String(keep.name || '').trim()) add({ title: String(m.name).trim() });
  });
  return out;
}

/**
 * แผนรวมสต็อก `mergeIds` เข้า `keepId` (ยังไม่เขียนอะไร)
 *
 * @returns {{ ok:true, keep, merged, chains, menuUpdates, modifierUpdates, recipeUpdates, summary }
 *          | { ok:false, error:string }}
 */
export function planMerge({ keepId, mergeIds = [], stock = [], menu = [], beanModifiers = [] } = {}) {
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const keep = stockById.get(keepId);
  const ids = [...new Set(mergeIds)].filter((id) => id && id !== keepId);
  if (!keep) return { ok: false, error: 'ไม่พบรายการที่จะเก็บไว้' };
  if (isArchivedStock(keep)) return { ok: false, error: 'รายการที่จะเก็บถูกรวมไปแล้ว' };
  if (!ids.length) return { ok: false, error: 'เลือกรายการที่จะรวมอย่างน้อย 1 รายการ' };
  const merged = ids.map((id) => stockById.get(id));
  if (merged.some((m) => !m)) return { ok: false, error: 'ไม่พบบางรายการที่จะรวม' };
  if (merged.some(isArchivedStock)) return { ok: false, error: 'บางรายการถูกรวมไปแล้ว' };
  const badUnit = merged.find((m) => !sameUnit(m.unit, keep.unit));
  if (badUnit) return { ok: false, error: `หน่วยไม่ตรงกัน: ${badUnit.name} (${badUnit.unit}) กับ ${keep.name} (${keep.unit})` };

  const idMap = new Map(ids.map((id) => [id, keepId]));
  // เอกสารที่เคยถูกรวมเข้าตัวที่กำลังจะถูกรวม · ชี้ตรงไปตัวปลายทางเลย สายจะได้ไม่ยาว
  const chains = stock
    .filter((s) => s.mergedInto && idMap.has(s.mergedInto))
    .map((s) => ({ id: s.id, mergedInto: keepId }));
  chains.forEach((c) => idMap.set(c.id, keepId));

  const quantity = roundQty6([keep, ...merged].reduce((sum, s) => sum + num(s.quantity), 0));
  const unitCost = mergedUnitCost([keep, ...merged]);

  const keepUpdate = {
    quantity,
    unitCost,
    purchaseAliases: mergeAliases(keep, merged),
  };
  if (normalizeUnit(keep.unit) !== keep.unit && normalizeUnit(keep.unit)) keepUpdate.unit = normalizeUnit(keep.unit);
  // ของเตรียมที่ยังไม่มีสูตร รับสูตรของตัวที่ถูกรวมมาได้
  if (keep.kind === 'prep' && !keep.recipe) {
    const withRecipe = merged.find((m) => m.recipe);
    if (withRecipe) keepUpdate.recipe = withRecipe.recipe;
  }

  const menuUpdates = [];
  menu.forEach((m) => {
    const next = rewriteLinks(m.stockLinks, idMap);
    if (next) menuUpdates.push({ id: m.id, name: String(m.name || ''), stockLinks: next });
  });
  const modifierUpdates = [];
  beanModifiers.forEach((m) => {
    const next = rewriteLinks(m.stockLinks, idMap);
    if (next) modifierUpdates.push({ id: m.id, name: String(m.name || ''), stockLinks: next });
  });
  const recipeUpdates = [];
  stock.forEach((s) => {
    if (idMap.has(s.id) || !s.recipe) return;
    const base = s.id === keepId && keepUpdate.recipe ? keepUpdate.recipe : s.recipe;
    const next = rewriteIngredients(base.ingredients, idMap);
    if (!next) return;
    // สูตรของตัวที่เก็บไว้เองห้ามมีตัวมันเองเป็นวัตถุดิบ (จะวนทันที)
    const ingredients = next.filter((l) => l.stockId !== s.id);
    recipeUpdates.push({ id: s.id, name: String(s.name || ''), recipe: { ...base, ingredients } });
  });

  return {
    ok: true,
    keep: { id: keepId, name: String(keep.name || ''), unit: keep.unit, before: { quantity: num(keep.quantity), unitCost: num(keep.unitCost) }, update: keepUpdate },
    merged: merged.map((m) => ({
      id: m.id,
      name: String(m.name || ''),
      quantity: num(m.quantity),
      unitCost: num(m.unitCost),
      update: { mergedInto: keepId, archived: true, quantity: 0 },
    })),
    chains,
    menuUpdates,
    modifierUpdates,
    recipeUpdates,
    summary: {
      quantity,
      unitCost,
      menuCount: menuUpdates.length,
      modifierCount: modifierUpdates.length,
      recipeCount: recipeUpdates.length,
    },
  };
}

// ── หน่วยสะกดผิด ────────────────────────────────────────────────────────────

/**
 * สต็อกที่หน่วยสะกดไม่ตรงแบบมาตรฐาน ("กรัท" → "กรัม", "g" → "กรัม")
 * เปลี่ยนแค่ชื่อหน่วย ปริมาณเท่าเดิม (normalizeUnit แปลงเฉพาะคำที่หมายถึงหน่วยเดียวกัน)
 */
export function planUnitFixes(stock = []) {
  return stock
    .filter((s) => typeof s.unit === 'string' && s.unit.trim())
    .map((s) => ({ id: s.id, name: String(s.name || ''), from: s.unit, to: normalizeUnit(s.unit) }))
    .filter((f) => f.to && f.to !== f.from);
}
