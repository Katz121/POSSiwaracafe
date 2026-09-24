import { useMemo, useState } from 'react';
import { Coffee, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Banner, Button, EmptyState, FilterChips, Money } from '../../ui';
import { formatNumber } from '../../../utils/format';

const DEFAULT_GROUP = 'เมล็ดกาแฟ';

const matches = (filter, mod, h) => {
  if (filter === 'broken') return h?.broken;
  if (filter === 'unlinked') return (h?.aliveCount || 0) === 0 && !h?.broken;
  if (filter === 'hidden') return mod.available === false;
  return true;
};

function ModifierRow({ mod, h, onEdit, onDelete, onToggleAvailable }) {
  const isHidden = mod.available === false;
  const linkCount = h?.aliveCount || 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 border-b border-[var(--border-light)] last:border-b-0">
      <div className="min-w-0 flex-1 basis-60">
        <p className={`font-semibold ${isHidden ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>{mod.name}</p>
        <p className="text-sm text-[var(--text-muted)] num">
          ราคา <Money value={Number(mod.price)} className="text-[var(--text-secondary)]" />
          {h?.cost > 0 && <> · ทุน <Money value={h.cost} className="text-[var(--text-secondary)]" /></>}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {h?.broken && (
            <Badge tone="danger" dot title="ผูกกับสต็อกที่ถูกลบไปแล้ว · ขายแล้วตัดสต็อกไม่ครบ">
              ลิงก์เสีย{h.status === 'partial' ? ` ${h.deadCount}/${h.deadCount + h.aliveCount}` : ''}
            </Badge>
          )}
          {!h?.broken && (linkCount > 0
            ? <Badge tone="ok">ผูกสต็อกแล้ว · {formatNumber(linkCount)} รายการ</Badge>
            : <Badge tone="warn">ยังไม่ผูกสต็อก</Badge>)}
          {mod.isDefault && <Badge tone="accent">เบส</Badge>}
          {isHidden && <Badge tone="neutral" icon={<EyeOff size={12} />}>ซ่อน (เมล็ดหมด)</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={() => onToggleAvailable(mod)}
          aria-pressed={!isHidden}
          aria-label={isHidden ? `แสดง ${mod.name}` : `ซ่อน ${mod.name} (เมล็ดหมด)`}
          title={isHidden ? 'แสดงตัวเลือกนี้' : 'ซ่อนตัวเลือกนี้ (เมล็ดหมด)'}
          className="w-11 h-11 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          {isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
        <Button variant={h?.broken ? 'primary' : 'secondary'} leftIcon={<Pencil size={16} />} onClick={() => onEdit(mod)}>
          {h?.broken ? 'แก้ลิงก์' : 'แก้ไข'}
        </Button>
        <button
          type="button"
          onClick={() => onDelete(mod)}
          aria-label={`ลบ ${mod.name}`}
          className="w-11 h-11 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </li>
  );
}

/**
 * "ตัวเลือกเมนู" (#แท็กเมล็ดกาแฟ) · list grouped by group, with a "ลิงก์เสีย"
 * badge on options whose stock links point at deleted stock (the stock-audit
 * page sends the owner here to fix them). Hidden options still show so their
 * cost can be prepared before they go on sale.
 */
export default function ModifiersTab({ beanModifiers, health, onAdd, onEdit, onDelete, onToggleAvailable }) {
  const counts = useMemo(() => {
    const c = { all: beanModifiers.length, broken: 0, unlinked: 0, hidden: 0, linked: 0 };
    beanModifiers.forEach((m) => {
      const h = health.get(m.id);
      if (h?.broken) c.broken += 1;
      else if ((h?.aliveCount || 0) === 0) c.unlinked += 1;
      if ((h?.aliveCount || 0) > 0) c.linked += 1;
      if (m.available === false) c.hidden += 1;
    });
    return c;
  }, [beanModifiers, health]);

  const [filter, setFilter] = useState(() => (counts.broken > 0 ? 'broken' : 'all'));

  const groups = useMemo(() => {
    const map = new Map();
    beanModifiers
      .filter((m) => matches(filter, m, health.get(m.id)))
      .forEach((m) => {
        const g = m.group || DEFAULT_GROUP;
        if (!map.has(g)) map.set(g, []);
        map.get(g).push(m);
      });
    return [...map.entries()];
  }, [beanModifiers, health, filter]);

  return (
    <div className="flex flex-col gap-4">
      {counts.broken > 0 && (
        <Banner
          tone="danger"
          title={`ตัวเลือก ${formatNumber(counts.broken)} รายการผูกกับสต็อกที่ถูกลบไปแล้ว`}
          action={filter !== 'broken' ? { label: 'ดูเฉพาะลิงก์เสีย', onClick: () => setFilter('broken') } : undefined}
        >
          ขายแล้วระบบตัดสต็อกเมล็ด/ผงได้ไม่ครบ · กด "แก้ลิงก์" แล้วเลือกวัตถุดิบตัวใหม่แทนตัวที่ถูกลบ
        </Banner>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          ariaLabel="สถานะการผูกสต็อก"
          value={filter}
          onChange={(v) => setFilter(v || 'all')}
          chips={[
            { value: 'all', label: 'ทั้งหมด', count: counts.all },
            { value: 'broken', label: 'ลิงก์เสีย', count: counts.broken, tone: 'danger' },
            { value: 'unlinked', label: 'ยังไม่ผูก', count: counts.unlinked, tone: 'warn' },
            { value: 'hidden', label: 'ซ่อนอยู่', count: counts.hidden },
          ]}
        />
        <Button leftIcon={<Plus size={18} />} onClick={onAdd}>เพิ่มตัวเลือก</Button>
      </div>
      <p className="text-sm text-[var(--text-muted)] num">
        ผูกแล้ว {formatNumber(counts.linked)} · ยังไม่ผูก {formatNumber(beanModifiers.length - counts.linked)}
      </p>

      {groups.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Coffee}
          title={beanModifiers.length === 0 ? 'ยังไม่มีตัวเลือก' : 'ไม่มีตัวเลือกในตัวกรองนี้'}
          action={beanModifiers.length === 0 ? { label: 'เพิ่มตัวเลือก', onClick: onAdd } : undefined}
        />
      ) : groups.map(([group, mods]) => (
        <section key={group} aria-label={group} className="rounded-[var(--radius)] bg-[var(--bg-surface)] shadow-[var(--elev-1)] px-4 md:px-5 py-2">
          <h3 className="pt-2 pb-1 text-sm font-semibold text-[var(--text-secondary)]">{group} <span className="font-normal text-[var(--text-muted)] num">({formatNumber(mods.length)})</span></h3>
          <ul>
            {mods.map((mod) => (
              <ModifierRow key={mod.id} mod={mod} h={health.get(mod.id)} onEdit={onEdit} onDelete={onDelete} onToggleAvailable={onToggleAvailable} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
