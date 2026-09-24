import { useState } from 'react';
import { Check, GitMerge, Phone, Trash2 } from 'lucide-react';
import { Banner, Button, EmptyState, IconButton, Money, SegmentedControl, Sheet } from '../../ui';
import DangerButton from './DangerButton';
import { formatNumber } from '../../../utils/format';
import { isNameOnlyId } from './memberData';

const row = 'rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-color)] p-3';
const muted = 'text-sm leading-[var(--lh-sm)] text-[var(--text-muted)]';

function Reconcile({ list, days, onDays, onCredit, isBusy }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={muted}>
          เทียบยอดซื้อกับแต้มที่ได้ เฉพาะ {days} วันล่าสุด · เติมส่วนที่ขาดเข้า "รออนุมัติ" แล้วค่อยกดอนุมัติอีกที (฿10 = 1 แต้ม · การแลกแต้มไม่ถูกนับซ้ำ)
        </p>
        <SegmentedControl
          ariaLabel="ช่วงเวลาที่ตรวจ"
          value={days}
          onChange={onDays}
          options={[{ value: 7, label: '7 วัน' }, { value: 14, label: '14 วัน' }]}
        />
      </div>
      {list.length === 0 ? (
        <Banner tone="ok" title="แต้มตรงกับยอดซื้อทุกคนแล้ว" />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((m) => (
            <li key={`gap-${m.phone || m.id}`} className={`${row} flex items-center justify-between gap-3`}>
              <span className="min-w-0">
                <span className="block font-semibold text-[var(--text-primary)] truncate">{String(m.name || 'ไม่ระบุชื่อ')}</span>
                <span className={`block ${muted} num`}>
                  {m.phone ? String(m.phone) : 'ไม่มีเบอร์'} · ควรได้ {Number(m.expectedEarn || 0)} · ขาด{' '}
                  <span className="font-semibold text-[var(--text-primary)]">{Number(m.earnGap)}</span> แต้ม
                  {Number(m.redeemed || 0) > 0 && <> · แลกไปแล้ว {Number(m.redeemed)}</>}
                </span>
              </span>
              <Button disabled={isBusy(m)} onClick={() => onCredit(m)} size="md" leftIcon={<Check size={16} />}>
                เติม +{Number(m.earnGap)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Duplicates({ groups, ignoredCount, onResetIgnored, onIgnore, onMerge, onDelete }) {
  return (
    <div className="flex flex-col gap-3">
      <p className={muted}>
        ชื่อซ้ำกันไม่ได้แปลว่าเป็นคนเดียวกันเสมอ · ถ้าคนเดียวกันให้ "รวม" (แต้มและประวัติยุบเข้าตัวหลัก) · ถ้าเป็นรายการขยะให้ลบทีละอัน · ถ้าคนละคนกดซ่อนกลุ่มไว้ได้
      </p>
      {ignoredCount > 0 && (
        <Button variant="ghost" className="self-start" onClick={onResetIgnored}>
          เอากลุ่มที่ซ่อนไว้ ({ignoredCount}) กลับมา
        </Button>
      )}
      {groups.length === 0 ? (
        <Banner tone="ok" title="ไม่มีชื่อซ้ำที่ต้องจัดการ" />
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={`dup-${group.key}`} className={row}>
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 font-semibold text-[var(--text-primary)] truncate">
                  {group.key} <span className={muted}>({group.members.length} รายการ)</span>
                </p>
                <Button size="md" leftIcon={<GitMerge size={16} />} onClick={() => onMerge(group)}>รวม</Button>
              </div>
              {/* Every identity in the group is deletable on its own — merging is
                  not the only way out (three different people can share one nickname). */}
              <ul className="mt-2 flex flex-col gap-1.5">
                {group.members.map((m) => (
                  <li key={`dupm-${m.id || m.phone}`} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] pl-3">
                    <span className={`${muted} text-[var(--text-secondary)] truncate num`}>
                      {m.phone ? String(m.phone) : 'ไม่มีเบอร์'} · {Number(m.points || 0)}
                      {Number(m.pendingPoints || 0) > 0 ? ` (+${Number(m.pendingPoints)})` : ''} แต้ม · {Number(m.totalPurchases || 0)} ชิ้น · <Money value={m.totalSpent || 0} />
                      {isNameOnlyId(m.id) ? ' · ยังไม่มีบัญชี' : ''}
                    </span>
                    <DangerButton
                      icon={<Trash2 size={18} />}
                      aria-label={`ลบ ${m.name || ''} ${m.phone || ''} ทิ้ง (ไม่ต้องรวม)`}
                      title="ลบรายการนี้ทิ้ง (ไม่ต้องรวม)"
                      onClick={() => onDelete(m)}
                    />
                  </li>
                ))}
              </ul>
              <Button variant="ghost" className="mt-1 -ml-2" onClick={() => onIgnore(group.key)}>
                ไม่ใช่คนเดียวกัน · ซ่อนกลุ่มนี้
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Guests({ rows, points, onPromote, onDelete }) {
  return (
    <div className="flex flex-col gap-3">
      <p className={muted}>
        รายการเก่าที่เคยบันทึกจากชื่อเล่นล้วน ตอนนี้ไม่นับเป็นสมาชิกแล้ว (บิลใหม่ที่ไม่มีเบอร์จะไม่ถูกบันทึกอีก) · ใส่เบอร์ให้ = เลื่อนเป็นสมาชิกจริงพร้อมแต้มเดิม · ลบ = เอาออกทั้งชื่อบนบิล
      </p>
      <p className="text-sm font-semibold text-[var(--text-secondary)] num">
        {formatNumber(rows.length)} คน{points > 0 ? ` · ค้างแต้ม ${formatNumber(points)}` : ''}
      </p>
      {rows.length === 0 ? (
        <EmptyState size="sm" title="ไม่มีลูกค้าที่ไม่มีเบอร์" />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((m) => {
            const pts = Number(m.points || 0) + Number(m.pendingPoints || 0);
            return (
              <li key={`guest-${m.id}`} className={`${row} flex items-center justify-between gap-2 py-1.5`}>
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--text-primary)] truncate">{String(m.name || 'ไม่ระบุชื่อ')}</span>
                  <span className={`block ${muted} truncate num`}>
                    {Number(m.totalPurchases || 0)} ชิ้น · <Money value={m.totalSpent || 0} />
                    {pts > 0 ? ` · ค้าง ${pts} แต้ม` : ''}
                    {isNameOnlyId(m.id) ? ' · ยังไม่มีบัญชี' : ''}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <IconButton
                    icon={<Phone size={18} />}
                    size="lg"
                    rounded="lg"
                    variant="secondary"
                    aria-label={`ใส่เบอร์ให้ ${m.name || ''} (เลื่อนเป็นสมาชิก)`}
                    title="ใส่เบอร์ให้ → เลื่อนเป็นสมาชิกจริง (แต้มเดิมตามไปด้วย)"
                    onClick={() => onPromote(m)}
                  />
                  <DangerButton
                    icon={<Trash2 size={18} />}
                    aria-label={`ลบ ${m.name || ''} ออกจากระบบสมาชิก`}
                    title="ลบออกจากระบบสมาชิก"
                    onClick={() => onDelete(m)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "เครื่องมือ" · reconciliation, duplicate merge and guest clean-up (moved out of the page). */
export default function MemberToolsSheet({
  open, onClose,
  reconcileList, reconcileDays, onReconcileDays, onCredit,
  duplicateGroups, ignoredCount, onResetIgnored, onIgnoreGroup, onMerge,
  guestRows, guestPoints, onPromoteGuest,
  onDelete, isBusy,
}) {
  const [tool, setTool] = useState('reconcile');
  return (
    <Sheet open={open} onClose={onClose} width={600} title="เครื่องมือสมาชิก" description="ตรวจแต้มที่ซื้อแล้วไม่ขึ้น รวมชื่อซ้ำ และจัดการลูกค้าที่ไม่มีเบอร์">
      <div className="flex flex-col gap-4">
        <SegmentedControl
          fullWidth
          ariaLabel="เลือกเครื่องมือ"
          value={tool}
          onChange={setTool}
          options={[
            { value: 'reconcile', label: 'แต้มไม่ขึ้น', count: reconcileList.length || undefined },
            { value: 'duplicates', label: 'ชื่อซ้ำ', count: duplicateGroups.length || undefined },
            { value: 'guests', label: 'ไม่มีเบอร์', count: guestRows.length || undefined },
          ]}
        />
        {tool === 'reconcile' && (
          <Reconcile list={reconcileList} days={reconcileDays} onDays={onReconcileDays} onCredit={onCredit} isBusy={isBusy} />
        )}
        {tool === 'duplicates' && (
          <Duplicates
            groups={duplicateGroups}
            ignoredCount={ignoredCount}
            onResetIgnored={onResetIgnored}
            onIgnore={onIgnoreGroup}
            onMerge={onMerge}
            onDelete={onDelete}
          />
        )}
        {tool === 'guests' && <Guests rows={guestRows} points={guestPoints} onPromote={onPromoteGuest} onDelete={onDelete} />}
      </div>
    </Sheet>
  );
}
