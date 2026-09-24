/**
 * AI แนะนำผูกสต็อก (ผ่าน Muse) · เจ้าของร้านอยากได้คำตอบแบบ "เข้าใจ" ไม่ใช่ "เดา"
 *
 *   1) Muse บอกสูตรมาตรฐานของเมนูพร้อมปริมาณต่อที่
 *   2) จับคู่วัตถุดิบกับสต็อกที่ร้านมีจริง แปลงหน่วยให้ตรงหน่วยสต็อก
 *   3) ทุกบรรทัดมีเหตุผล 1 ประโยค + ความมั่นใจ · ของที่ร้านไม่มีแยกไว้ใน missing
 *
 * ผลลัพธ์ไม่ถูกใส่สูตรเองเด็ดขาด · หน้าจอให้เจ้าของร้านติ๊กเลือกแล้วกด "ใส่ที่เลือก"
 */
import { activeStock } from './stockMerge.js';

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];
export const CONFIDENCE_LABEL = { high: 'มั่นใจสูง', medium: 'ปานกลาง', low: 'ไม่แน่ใจ' };

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const round4 = (n) => Math.round(n * 10000) / 10000;
const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const fmtCost = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10000) / 10000 : 0);

/** เมนูในหมวดเดียวกันที่ผูกสต็อกแล้ว · ใช้เป็นอัตราส่วนของร้านเอง (ชื่อคล้ายกันขึ้นก่อน) */
export function relatedRecipes(menuItem, menu = [], stockById = new Map(), limit = 3) {
  const name = norm(menuItem?.name);
  const words = String(menuItem?.name || '').split(/[\s+/()-]+/).map(norm).filter((w) => w.length >= 2);
  const score = (m) => {
    const n = norm(m.name);
    let s = 0;
    if (name && (n.includes(name) || name.includes(n))) s += 5;
    for (const w of words) if (n.includes(w)) s += 1;
    return s;
  };
  return menu
    .filter((m) => m.id !== menuItem?.id && m.category === menuItem?.category && Array.isArray(m.stockLinks)
      && m.stockLinks.some((l) => stockById.has(l?.stockId)))
    .map((m) => ({ m, s: score(m) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ m }) => ({
      name: m.name,
      lines: m.stockLinks.filter((l) => stockById.has(l.stockId)).map((l) => {
        const s = stockById.get(l.stockId);
        return `${s.name} ${Number(l.usage) || 0} ${s.unit || ''}`.trim();
      }),
    }));
}

/**
 * โจทย์ที่ส่งให้ Muse · ส่งแค่ชื่อ/หน่วย/ต้นทุนของสต็อกและชื่อเมนู (ไม่มีข้อมูลลูกค้า)
 * perPiece = โหมดสูตรทั้งก้อน · ขอปริมาณต่อ 1 ชิ้น (หน้าจอคูณกลับเป็นทั้งก้อนเอง)
 */
export function buildStockSuggestPrompt({
  menuItem, stock = [], existingLinks = [], packagingPresets = [], related = [], perPiece = false,
}) {
  const live = activeStock(stock);
  const byId = new Map(live.map((s) => [s.id, s]));
  const stockList = live.map((s) => `${s.id}|${s.name}|${s.unit || '-'}|${fmtCost(s.unitCost)}`).join('\n');
  const have = existingLinks.filter((l) => byId.has(l?.stockId))
    .map((l) => `- ${byId.get(l.stockId).name} ${Number(l.usage) || 0} ${byId.get(l.stockId).unit || ''}`.trim());
  const presets = packagingPresets.map((p) => `- ${p.label}: ${p.links.map((l) => {
    const s = byId.get(l.stockId);
    return s ? `${s.name} (id ${s.id}) ${Number(l.usage) || 1} ${s.unit || ''}`.trim() : '';
  }).filter(Boolean).join(' + ')}`).filter((line) => !line.endsWith(': '));
  const relatedText = related.map((r) => `- ${r.name}: ${r.lines.join(', ')}`);
  const per = perPiece ? 'ต่อ 1 ชิ้น (เค้ก 1 ชิ้นที่ตัดขาย)' : 'ต่อ 1 แก้ว/ที่ ที่ขาย';

  return `งาน: แนะนำการผูกสต็อก (ตัดวัตถุดิบเมื่อขาย) ให้เมนูของร้าน
เมนู: "${menuItem?.name || ''}" · หมวด: ${menuItem?.category || 'ไม่ระบุ'}${menuItem?.description ? ` · คำอธิบาย: ${menuItem.description}` : ''}
ปริมาณที่ต้องการ: ${per}

ทำตามลำดับนี้ (คิดให้เข้าใจ ห้ามเดาสุ่ม):
1) ระบุสูตรมาตรฐานของเมนูนี้แบบร้านคาเฟ่ไทย พร้อมปริมาณ${per} (ผงชา/กาแฟ นม นมข้น ไซรัป น้ำแข็ง ท็อปปิ้ง และบรรจุภัณฑ์ ถ้าเป็นเครื่องดื่มเย็น/ปั่น)
   ถ้าร้านมีสูตรเมนูใกล้เคียงด้านล่าง ให้ยึดอัตราส่วนของร้านเป็นหลัก ไม่รู้จักเมนูนี้จริงๆ ค้นเว็บได้
2) จับคู่แต่ละวัตถุดิบกับสต็อกของร้านที่ตรงที่สุด "ตัวเดียว" ใช้ id ตรงตามรายการเท่านั้น
   แปลงหน่วยให้เป็นหน่วยของสต็อกตัวนั้น เช่น สต็อกหน่วยกิโลกรัม ใช้ 15 กรัม = 0.015 · สต็อกหน่วยมล. ใช้ 30 มล. = 30
   ถ้าสต็อกเป็นหน่วยขวด/ถุง/แพ็คที่ไม่รู้ขนาด ให้ประมาณจากชื่อ บอกสมมติฐานในเหตุผล และให้ confidence ไม่เกิน medium
3) แก้ว/ฝา/หลอด: ใช้ชุดบรรจุภัณฑ์ของร้านด้านล่าง เลือกขนาดที่เหมาะกับเมนู (เช่น ปั่นมักใช้แก้วใหญ่) ถ้าเมนูร้อนหรือไม่ใช่เครื่องดื่มไม่ต้องใส่
4) วัตถุดิบในสูตรที่ร้านไม่มีในสต็อก ใส่ใน missing ห้ามจับคู่ผิดตัวเพื่อให้ครบ
5) confidence: high = ชื่อตรงและปริมาณเป็นมาตรฐาน · medium = ตรงแต่ต้องประมาณปริมาณ/หน่วย · low = ไม่แน่ใจว่าร้านใช้ตัวนี้

สูตรที่เมนูนี้ผูกไว้แล้ว (ไม่ต้องแนะนำซ้ำ):
${have.length ? have.join('\n') : '- ยังไม่มี'}

ชุดแก้ว/หลอดที่ร้านใช้:
${presets.length ? presets.join('\n') : '- ร้านยังไม่ได้ตั้ง (เลือกจากสต็อกเอง)'}

สูตรของร้านเองสำหรับเมนูใกล้เคียง (อัตราส่วนจริงของร้าน):
${relatedText.length ? relatedText.join('\n') : '- ไม่มี'}

สต็อกของร้าน (id|ชื่อ|หน่วย|ต้นทุนต่อหน่วย บาท):
${stockList}

ตอบเป็น JSON เท่านั้น รูปแบบ:
{"recipe":[{"ingredient":"ชื่อวัตถุดิบในสูตร","amount":"ปริมาณพร้อมหน่วย เช่น 20 กรัม"}],
 "links":[{"stockId":"id จากรายการ","usage":ตัวเลขในหน่วยของสต็อก,"ingredient":"ชื่อในสูตร","reason":"เหตุผลภาษาไทย 1 ประโยค ว่าทำไมตัวนี้และปริมาณนี้","confidence":"high|medium|low"}],
 "missing":["วัตถุดิบในสูตรที่ร้านไม่มี"],
 "notes":"ข้อสังเกตสั้นๆ ถึงเจ้าของร้าน (ไม่มีให้ใส่ \\"\\")"}`;
}

const pickArray = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.links)) return data.links;
  if (Array.isArray(data?.lines)) return data.lines;
  if (Array.isArray(data?.suggestions)) return data.suggestions;
  return null;
};

const cleanStr = (v, max = 240) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * คำตอบดิบของ Muse → รายการที่หน้าจอใช้ได้
 *  - id ต้องอยู่ในสต็อกที่ใช้งานอยู่ (id ผิดแต่ชื่อตรงเป๊ะ = แก้ให้) · ปริมาณต้อง > 0
 *  - ซ้ำ stockId เอาตัวแรก · ที่ผูกไว้แล้วติดป้าย alreadyLinked (ติ๊กไม่ได้)
 *  - ติ๊กไว้ก่อนเฉพาะ high/medium · low ให้เจ้าของร้านตัดสินเอง
 * คืน null ถ้ารูปแบบคำตอบใช้ไม่ได้เลย
 */
export function normalizeStockSuggestions(data, { stock = [], existingLinks = [] } = {}) {
  const raw = pickArray(data);
  if (!raw) return null;
  const live = activeStock(stock);
  const byId = new Map(live.map((s) => [s.id, s]));
  const byName = new Map(live.map((s) => [norm(s.name), s]));
  const linked = new Set(existingLinks.map((l) => l?.stockId).filter(Boolean));
  const seen = new Set();
  const lines = [];
  let dropped = 0;

  for (const item of raw) {
    let s = byId.get(item?.stockId);
    if (!s && item?.stockId) s = byName.get(norm(item.stockId));
    if (!s && item?.stockName) s = byName.get(norm(item.stockName));
    const usage = num(item?.usage);
    if (!s || !(usage > 0) || seen.has(s.id)) { dropped += 1; continue; }
    seen.add(s.id);
    const confidence = CONFIDENCE_LEVELS.includes(String(item?.confidence).toLowerCase())
      ? String(item.confidence).toLowerCase()
      : 'low';
    const unitCost = Number(s.unitCost) || 0;
    const alreadyLinked = linked.has(s.id);
    lines.push({
      stockId: s.id,
      name: String(s.name || ''),
      unit: String(s.unit || ''),
      usage: round4(usage),
      ingredient: cleanStr(item?.ingredient, 80),
      reason: cleanStr(item?.reason),
      confidence,
      unitCost,
      cost: unitCost * usage,
      alreadyLinked,
      checked: !alreadyLinked && confidence !== 'low',
    });
  }

  const missing = (Array.isArray(data?.missing) ? data.missing : [])
    .map((m) => cleanStr(typeof m === 'string' ? m : (m?.ingredient || m?.name), 80))
    .filter(Boolean);
  const recipe = (Array.isArray(data?.recipe) ? data.recipe : [])
    .map((r) => (typeof r === 'string'
      ? { ingredient: cleanStr(r, 80), amount: '' }
      : { ingredient: cleanStr(r?.ingredient || r?.name, 80), amount: cleanStr(r?.amount, 40) }))
    .filter((r) => r.ingredient);

  return { lines, missing, recipe, notes: cleanStr(data?.notes, 400), dropped };
}

/** ต้นทุนต่อที่ของรายการที่ติ๊ก (ไม่นับที่ผูกไว้แล้ว) */
export const selectedSuggestionCost = (lines = []) => lines
  .filter((l) => l.checked && !l.alreadyLinked)
  .reduce((sum, l) => sum + (Number(l.cost) || 0), 0);

/**
 * ใส่รายการที่ติ๊กไว้ "บนสุด" ของสูตร (เหมือนปุ่มเพิ่มวัตถุดิบ) · ไม่แตะแถวเดิม
 * โหมดสูตรทั้งก้อน: perWhole = usage × จำนวนชิ้น
 */
export function applyStockSuggestions(links = [], lines = [], { whole = false, pieces = 0 } = {}) {
  const have = new Set(links.map((l) => l?.stockId).filter(Boolean));
  const add = lines
    .filter((l) => l.checked && !l.alreadyLinked && !have.has(l.stockId))
    .map((l) => (whole
      ? { stockId: l.stockId, usage: Number(l.usage), perWhole: pieces > 0 ? String(round4(Number(l.usage) * pieces)) : '' }
      : { stockId: l.stockId, usage: Number(l.usage) }));
  return { links: [...add, ...links.filter((l) => l?.stockId || Number(l?.usage))], added: add.length };
}
