import { Receipt } from 'lucide-react';
import { Button, Money, Sheet } from '../../ui';
import { dayLabel } from './salesFormat';

function Stat({ label, children }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2 min-w-0">
      <p className="text-xs leading-[var(--lh-xs)] text-[var(--text-muted)]">{label}</p>
      <p className="num font-semibold text-[var(--text-primary)] truncate">{children}</p>
    </div>
  );
}

/** One day of the sales history: totals + the expenses recorded that day. */
export default function DaySheet({ day, onClose, onOpenBills }) {
  const profit = day ? day.revenue - day.expense : 0;
  return (
    <Sheet
      open={!!day}
      onClose={onClose}
      title={day ? dayLabel(day.key) : ''}
      description="ยอดขายและรายจ่ายที่บันทึกในวันนี้"
      footer={day && day.bills.length > 0 ? (
        <Button variant="secondary" leftIcon={<Receipt size={18} />} onClick={() => onOpenBills(day.key)}>
          ดูบิลของวันนี้
        </Button>
      ) : null}
    >
      {day && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="ยอดขาย"><Money value={day.revenue} /></Stat>
            <Stat label="รายจ่าย"><Money value={day.expense} /></Stat>
            <Stat label="กำไร"><Money value={profit} tone={profit < 0 ? 'danger' : undefined} /></Stat>
            <Stat label="บิล · แก้ว · ขนม">{day.bills.length} · {day.cups} · {day.pieces}</Stat>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">รายจ่าย ({day.expenses.length})</h3>
            {day.expenses.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">ไม่มีรายจ่ายที่บันทึกไว้</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border-light)]">
                {day.expenses.map((e, i) => (
                  <li key={e.id || i} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block text-[var(--text-primary)] break-words">{e.title || 'ไม่ระบุหัวข้อ'}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{e.category || 'ไม่ระบุหมวด'}</span>
                    </span>
                    <Money value={e.amount} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
