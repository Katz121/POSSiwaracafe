import { memo, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Button, SegmentedControl, Sheet } from '../../ui';
import { computeModifierPrice, supportsMilkChoice, MILK_OPTIONS } from '../../../config/constants';
import { supportsSweetnessChoice } from '../../../utils/promotions';
import { formatBaht } from '../../../utils/format';
import {
  getOptionGroups, defaultSelections, needsConfirmStep, SWEETNESS_LEVELS, DEFAULT_SWEETNESS, DEFAULT_MILK,
} from './posCart';

const SWEET_OPTIONS = SWEETNESS_LEVELS.map((v) => ({ value: v, label: `${v}%` }));
const MILK_SEGMENTS = MILK_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/**
 * Option picker: right sheet on iPad (420px, the cart stays visible), bottom
 * sheet on phones. Defaults are preselected (base option per group, sweetness
 * 100, cow milk) so the common drink is item → "เพิ่มลงตะกร้า".
 * Single-group items without sweetness or milk keep the one-tap fast path.
 *
 * Props: item (menu item | null), beanModifiers, saleSettings,
 *        onAdd(item, mods[], sweetness|null, milk|null), onClose
 */
function OptionSheet({ item, beanModifiers, saleSettings, onAdd, onClose }) {
  const groups = useMemo(() => (item ? getOptionGroups(item, beanModifiers) : []), [item, beanModifiers]);
  const [picks, setPicks] = useState(() => (item ? defaultSelections(item, groups) : {}));
  const [sweetness, setSweetness] = useState(DEFAULT_SWEETNESS);
  const [milk, setMilk] = useState(DEFAULT_MILK);
  // New item → fresh defaults (render-time reset, so the sheet can still animate out).
  const [forItem, setForItem] = useState(item);
  if (item !== forItem) {
    setForItem(item);
    setPicks(item ? defaultSelections(item, groups) : {});
    setSweetness(DEFAULT_SWEETNESS);
    setMilk(DEFAULT_MILK);
  }

  if (!item) return <Sheet open={false} onClose={onClose} />;

  const showSweetness = supportsSweetnessChoice(item, saleSettings);
  const showMilk = supportsMilkChoice(item);
  const multi = groups.length > 1;
  const confirm = needsConfirmStep({ groups, showSweetness, showMilk });
  const chosen = groups.map((g) => picks[g.name]).filter(Boolean);
  const allChosen = groups.every((g) => picks[g.name]);
  const preview = groups.length ? computeModifierPrice(item, chosen) : null;

  const add = (mods = chosen) => onAdd(item, mods, showSweetness ? sweetness : null, showMilk ? milk : null);

  const footer = confirm ? (
    <div className="w-full grid grid-cols-[auto_1fr] gap-2">
      <Button variant="secondary" size="xl" onClick={onClose}>ยกเลิก</Button>
      <Button variant="primary" size="xl" disabled={!allChosen} onClick={() => add()} data-option-add>
        {allChosen
          ? <>เพิ่มลงตะกร้า{preview != null && <span className="num">· {formatBaht(preview)}</span>}</>
          : 'เลือกให้ครบทุกกลุ่ม'}
      </Button>
    </div>
  ) : null;

  return (
    <Sheet
      open
      onClose={onClose}
      width={420}
      // sit left of the cart column (300 / 340px) so the cart stays visible
      className="md:right-[300px]! lg:right-[340px]!"
      title={String(item.name || '')}
      description={confirm ? 'ตั้งค่าเริ่มต้นไว้ให้แล้ว เปลี่ยนเฉพาะที่ลูกค้าขอ' : 'แตะตัวเลือกเพื่อเพิ่มลงตะกร้า'}
      footer={footer}
    >
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.name} className="space-y-2" aria-label={group.name}>
            {(multi || confirm) && <h3 className="text-sm font-semibold text-[var(--text-secondary)]">{group.name}</h3>}
            <div className="grid gap-2">
              {group.mods.map(({ mod }) => {
                const selected = picks[group.name]?.id === mod.id;
                // price if this option is chosen together with the other groups' picks
                const withThis = groups.map((g) => (g.name === group.name ? mod : picks[g.name])).filter(Boolean);
                const priceIfChosen = computeModifierPrice(item, withThis);
                const delta = preview == null ? 0 : priceIfChosen - preview;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={confirm ? () => setPicks((p) => ({ ...p, [group.name]: mod })) : () => add([mod])}
                    className={`w-full min-h-14 px-4 py-2 flex items-center gap-3 text-left rounded-[var(--radius-sm)] border outline-none focus-visible:shadow-[var(--focus-ring)] transition-colors duration-100 ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--bg-selected)] shadow-[inset_0_0_0_1px_var(--accent)]'
                        : 'border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <span className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${selected ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--text-on-accent)]' : 'border-[var(--border-strong)]'}`}>
                      {selected && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0 font-medium leading-normal text-[var(--text-primary)]">{mod.name}</span>
                    <span className="shrink-0 flex flex-col items-end leading-normal">
                      <span className="num font-semibold text-[var(--text-primary)]">{formatBaht(priceIfChosen)}</span>
                      {!selected && delta !== 0 && (
                        <span className="num text-xs text-[var(--text-muted)]">
                          {delta > 0 ? `+${formatBaht(delta)}` : `ถูกลง ${formatBaht(-delta)}`}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {showMilk && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">ชนิดนม</h3>
            <SegmentedControl options={MILK_SEGMENTS} value={milk} onChange={setMilk} size="lg" fullWidth ariaLabel="ชนิดนม" />
          </section>
        )}

        {showSweetness && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">ความหวาน</h3>
            <SegmentedControl options={SWEET_OPTIONS} value={sweetness} onChange={setSweetness} size="lg" fullWidth ariaLabel="ระดับความหวาน" />
          </section>
        )}
      </div>
    </Sheet>
  );
}

export default memo(OptionSheet);
