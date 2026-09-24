import { CookingPot } from 'lucide-react';
import UnitCost from '../inventory/UnitCost';
import { Button, EmptyState, Money } from '../../ui';
import { formatTime } from '../../../utils/format';
import { isPieceUnit, summarizeProduction } from '../../../utils/production';
import { PANEL, qty } from './productionModel';

/**
 * "ผลิต" tab of สรุปขาย & สต็อก · what was made that day, what it used, what it cost.
 * Production moves value between stock items (no expense) · see utils/production.js.
 */
export default function ProductionAuditList({ batches, date, loading, onOpen }) {
  const { batches: done, costTotal } = summarizeProduction(batches, date);
  if (loading) return null;
  if (!done.length) {
    return (
      <EmptyState
        size="sm"
        icon={CookingPot}
        title="วันนี้ไม่มีรายการผลิตที่ทำเสร็จ"
        actionLabel="ไปหน้าผลิตวันนี้"
        onAction={onOpen}
        className={PANEL}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          ทำเสร็จ <b className="num text-[var(--text-primary)]">{done.length}</b> รายการ ·
          ต้นทุนวัตถุดิบรวม <Money value={costTotal} className="font-semibold text-[var(--text-primary)]" />
          <span className="block text-xs text-[var(--text-muted)]">ย้ายมูลค่าจากวัตถุดิบไปเป็นของเตรียม · ไม่ใช่รายจ่ายใหม่</span>
        </p>
        <Button variant="secondary" size="sm" leftIcon={<CookingPot size={16} />} onClick={onOpen}>เปิดหน้าผลิต</Button>
      </div>
      <ul className={`${PANEL} divide-y divide-[var(--border-light)]`}>
        {done.map((b) => {
          const unit = b.outputUnit || '';
          return (
            <li key={b.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 font-semibold text-[var(--text-primary)]">
                  {b.outputName}
                  <span className="num ml-2 text-sm font-normal text-[var(--text-muted)]">{b.doneAt ? `${formatTime(b.doneAt)} น.` : ''}</span>
                </p>
                <p className="num text-sm text-[var(--text-secondary)]">
                  {isPieceUnit(unit) ? 'ตัดได้' : 'ได้'} <b className="text-[var(--text-primary)]">{qty(b.yieldQty)} {unit}</b>
                  {' '}· <Money value={b.costTotal} /> · <UnitCost value={b.unitCost} />/{unit}
                </p>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                ใช้ {(b.actualIngredients || []).map((l) => `${l.name} ${qty(l.qty)} ${l.unit}`).join(' · ')}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
