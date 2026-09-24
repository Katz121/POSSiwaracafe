import { memo } from 'react';
import {
  Coffee, Edit, Star, TrendingUp, Clock, PackageX, PackagePlus, Trash2, AlertTriangle,
} from 'lucide-react';
import { Badge, Money } from '../../ui';
import RowMenu from './RowMenu';
import { StockLinkBadge, Toggle } from './parts';

// md+ grid: thumb · name · price · cost/margin · stock link · พร้อมขาย · ⋯
const GRID = 'md:grid md:grid-cols-[56px_minmax(0,1fr)_88px_120px_minmax(150px,190px)_64px_44px] md:items-center md:gap-3';

function Thumb({ item }) {
  const off = item.available === false;
  return (
    <div className="relative w-14 h-14 shrink-0 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-sunken)] flex items-center justify-center">
      {item.image
        ? <img src={item.image} alt="" width={56} height={56} loading="lazy" decoding="async" className={`w-14 h-14 object-cover ${off ? 'grayscale opacity-60' : ''}`} />
        : <Coffee size={22} className="text-[var(--text-muted)]" aria-hidden="true" />}
    </div>
  );
}

function HighlightBadges({ item }) {
  return (
    <>
      {item.available === false && <Badge tone="neutral" className="font-semibold">ปิดขาย</Badge>}
      {item.isFeatured === true && <Badge tone="accent" icon={<Star size={12} aria-hidden="true" />}>แนะนำ</Badge>}
      {item.recommended === true && <Badge tone="neutral">แนะนำเดิม</Badge>}
      {item.isPinnedBest === true && <Badge tone="accent" icon={<TrendingUp size={12} aria-hidden="true" />}>ขายดี</Badge>}
      {item.excludeFromSale && <Badge tone="info" icon={<Clock size={12} aria-hidden="true" />}>ไม่ร่วม Happy Hour</Badge>}
    </>
  );
}

function CostCell({ status, inline = false }) {
  if (!status?.costed) return <span className="text-sm text-[var(--text-muted)]">ยังไม่มีต้นทุน</span>;
  const low = status.marginPercent < 30;
  const margin = (
    <span className={`num text-sm font-semibold inline-flex items-center gap-1 ${low ? 'text-[var(--state-danger)]' : 'text-[var(--state-ok)]'}`}>
      {low && <AlertTriangle size={13} aria-hidden="true" />}กำไร {status.marginPercent}%
    </span>
  );
  if (inline) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 text-sm leading-snug">
        <span className="text-[var(--text-muted)]">ทุน <Money value={status.totalCost} /></span>
        {margin}
        {status.suspicious && <span className="text-xs font-medium text-[var(--state-warn)]">ต้นทุนน่าสงสัย</span>}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-xs text-[var(--text-muted)]">ทุน <Money value={status.totalCost} /></span>
      {margin}
      {status.suspicious && <span className="text-xs font-medium text-[var(--state-warn)]">ต้นทุนน่าสงสัย</span>}
    </span>
  );
}

const MenuRow = memo(function MenuRow({ item, status, selected, actions }) {
  const off = item.available === false;
  const menuItems = [
    { key: 'edit', label: 'แก้ไขเมนู', icon: Edit, onSelect: () => actions.onEdit(item) },
    { key: 'featured', label: 'เมนูแนะนำ', hint: 'แถบแนะนำหน้า QR + หน้าร้าน', icon: Star, checked: item.isFeatured === true, onSelect: () => actions.onToggleHighlight(item, 'isFeatured') },
    { key: 'pinned', label: 'ปักหมุดขายดี', hint: 'แสดงบนสุดหน้า QR', icon: TrendingUp, checked: item.isPinnedBest === true, onSelect: () => actions.onToggleHighlight(item, 'isPinnedBest') },
    { key: 'hh', label: 'ยกเว้นลด Happy Hour', hint: 'เค้กใหม่ ไม่ลดราคา', icon: Clock, checked: Boolean(item.excludeFromSale), onSelect: () => actions.onToggleExcludeFromSale(item) },
    { key: 'waste', label: 'บันทึกของเสีย', icon: PackageX, onSelect: () => actions.onWaste(item) },
    !item.stockLinks?.length && { key: 'cake', label: 'สร้างสต็อกก้อน', hint: 'เค้ก/ขนมที่ตัดเป็นชิ้น', icon: PackagePlus, onSelect: () => actions.onCakeStock(item) },
    { key: 'delete', label: 'ลบเมนู', icon: Trash2, danger: true, onSelect: () => actions.onDelete(item) },
  ];
  const warn = status && (status.deadCount > 0 || status.status === 'unlinked');

  return (
    <li
      data-menu-id={item.id}
      className={`relative ${selected ? 'bg-[var(--bg-selected)]' : 'hover:bg-[var(--bg-hover)]'} transition-colors`}
    >
      {warn && (
        <span
          aria-hidden="true"
          className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${status.deadCount > 0 ? 'bg-[var(--state-danger)]' : 'bg-[var(--state-warn)]'}`}
        />
      )}
      <div className={`flex items-start gap-3 px-3 md:px-4 py-3 min-h-[72px] ${GRID}`}>
        {/* Row body opens the editor. The toggle + ⋯ are separate buttons (no nesting). */}
        <button
          type="button"
          onClick={() => actions.onEdit(item)}
          aria-label={`แก้ไข ${item.name}`}
          className="absolute inset-0 w-full h-full outline-none focus-visible:shadow-[inset_0_0_0_3px_var(--accent)] rounded-none"
        />
        <div className="relative pointer-events-none"><Thumb item={item} /></div>

        <div className="relative pointer-events-none min-w-0 flex-1 flex flex-col gap-1">
          <p className="text-[15px] md:text-base font-semibold leading-snug text-[var(--text-primary)] break-words">
            {String(item.name)}
            {item.nameEn && <span className="hidden lg:inline font-normal text-sm text-[var(--text-muted)]"> · {item.nameEn}</span>}
          </p>
          {/* phone: price + stock status under the name */}
          <div className="flex md:hidden flex-wrap items-center gap-x-2 gap-y-1">
            <Money value={Number(item.price) || 0} className="text-sm font-semibold text-[var(--text-primary)]" />
            <StockLinkBadge status={status} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
            <HighlightBadges item={item} />
          </div>
          <div className="md:hidden"><CostCell status={status} inline /></div>
        </div>

        <div className="relative pointer-events-none hidden md:block text-right">
          <Money value={Number(item.price) || 0} className="text-base font-semibold text-[var(--text-primary)]" />
        </div>
        <div className="relative pointer-events-none hidden md:flex md:justify-end"><CostCell status={status} /></div>
        <div className="relative pointer-events-none hidden md:flex"><StockLinkBadge status={status} size="md" /></div>

        <div className="relative flex flex-col md:flex-row items-center gap-0 shrink-0 md:contents">
          <div className="relative flex md:justify-center">
            <Toggle
              checked={!off}
              onChange={() => actions.onToggleAvailability(item)}
              label={`${item.name} พร้อมขาย`}
            />
          </div>
          <RowMenu items={menuItems} label={`ตัวเลือกของ ${item.name}`} className="relative" />
        </div>
      </div>
    </li>
  );
});

/**
 * Menu list grouped by category with sticky group headers.
 * md+: a 7-column table · phone: cards (thumb, name, price, stock status, toggle, ⋯).
 * `stickyTop` = px offset for the group headers (page header + toolbar height).
 */
export default function MenuTable({ groups, statusById, selectedId, stickyTop = 0, actions }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        aria-hidden="true"
        className={`hidden md:grid px-4 text-xs font-medium text-[var(--text-muted)] ${GRID}`}
      >
        <span />
        <span>เมนู</span>
        <span className="text-right">ราคา</span>
        <span className="text-right">ทุน / กำไร</span>
        <span>สต็อก</span>
        <span className="text-center">พร้อมขาย</span>
        <span />
      </div>
      {groups.map((group) => {
        const unlinked = group.items.filter((i) => statusById.get(i.id)?.status === 'unlinked').length;
        const broken = group.items.filter((i) => statusById.get(i.id)?.deadCount > 0).length;
        return (
          <section key={group.name} aria-label={group.name} className="rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)]">
            <h2
              style={{ top: stickyTop }}
              className="sticky z-[5] flex flex-wrap items-center gap-2 px-4 py-2.5 min-h-12 rounded-t-[var(--radius)] bg-[var(--bg-sunken)] border-b border-[var(--border-color)]"
            >
              <span className="text-base font-semibold text-[var(--text-primary)]">{group.name}</span>
              <span className="num text-sm text-[var(--text-muted)]">{group.items.length} รายการ</span>
              {unlinked > 0 && <Badge tone="warn" className="font-semibold">ยังไม่ผูก {unlinked}</Badge>}
              {broken > 0 && <Badge tone="danger" className="font-semibold">ลิงก์เสีย {broken}</Badge>}
            </h2>
            <ul className="divide-y divide-[var(--border-light)]">
              {group.items.map((item) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  status={statusById.get(item.id)}
                  selected={selectedId === item.id}
                  actions={actions}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
