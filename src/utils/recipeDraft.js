import { getModifierGroups } from '../config/constants.js';
import { formatNumber } from './format.js';

// สูตรของเมนูที่ยังไม่ได้เขียนเอง · ดึงจากวัตถุดิบที่ผูกไว้ (menu.stockLinks) แบบสดๆ ไม่บันทึก
// สูตรที่เขียน/แก้เองใน recipes/{menuId} ชนะเสมอ · กดแก้ไขแล้วบันทึก = กลายเป็นสูตรของร้าน

const amount = (n) => formatNumber(n, { maxDecimals: 2 });

/** ข้อความสูตรจากสต็อกที่ผูก · ไม่มีอะไรให้ดึง = '' */
export function recipeDraftText(menuItem, stockById) {
  const links = (Array.isArray(menuItem?.stockLinks) ? menuItem.stockLinks : [])
    .map((l) => ({ stock: stockById?.get(l?.stockId), usage: Number(l?.usage) || 0 }))
    .filter((l) => l.stock && l.usage > 0);
  const groups = menuItem?.allowBeanModifier ? getModifierGroups(menuItem) : [];
  if (!links.length && !groups.length) return '';

  const pieces = menuItem?.recipeMode === 'whole' ? Number(menuItem?.recipePieces) || 0 : 0;
  const lines = [pieces > 0 ? `วัตถุดิบทั้งก้อน (ตัดได้ ${amount(pieces)} ชิ้น)` : 'วัตถุดิบต่อ 1 ที่'];
  links.forEach(({ stock, usage }) => {
    lines.push(`• ${stock.name} ${amount(pieces > 0 ? usage * pieces : usage)} ${stock.unit || ''}`.trimEnd());
  });
  if (groups.length) lines.push(`• + ${groups.join(' / ')} ตามที่ลูกค้าเลือก`);
  return lines.join('\n');
}

/** { text, auto } · auto = ดึงจากสต็อก (ยังไม่มีสูตรที่เขียนเอง) */
export function effectiveRecipe(recipes, menuItem, stockById) {
  const own = recipes?.[menuItem?.id];
  if (String(own?.text || '').trim()) return { ...own, auto: false };
  const text = recipeDraftText(menuItem, stockById);
  return text ? { text, auto: true } : null;
}
