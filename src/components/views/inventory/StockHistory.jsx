import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, appId } from '../../../services/firebase';
import { useDataContext } from '../../../context/AppContext';
import { formatNumber, formatThaiDate, formatTime } from '../../../utils/format';
import { buildStockHistory, summarizeHistory } from '../../../utils/stockHistory';
import { FilterChips, SegmentedControl, Spinner } from '../../ui';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });
const col = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
const RANGES = [{ value: 30, label: '30 วัน' }, { value: 90, label: '90 วัน' }, { value: 0, label: 'ทั้งหมด' }];
const isoDaysAgo = (d) => {
  const t = new Date(Date.now() - (d - 1) * 864e5);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/**
 * ประวัติสต็อกรายตัว (เพิ่ม/ตัด) · บิลกับรายจ่ายมีในเครื่องแล้ว ส่วนตรวจนับ ผลิต ปรับยอด ดึงตอนเปิด
 * กติการวมข้อมูลอยู่ที่ utils/stockHistory.js
 */
export default function StockHistory({ item }) {
  const { orders = [], expenses = [], stock = [] } = useDataContext();
  const [extra, setExtra] = useState(null); // { counts, batches, moves } | { error }
  const [kind, setKind] = useState('all');
  const [days, setDays] = useState(30);

  // id ทั้งสายที่ถูกรวมเข้ามาตัวนี้ (Firestore `in` รับได้ 30)
  const ids = useMemo(() => [item.id, ...stock.filter((s) => s.mergedInto === item.id).map((s) => s.id)].slice(0, 30), [item.id, stock]);
  const idsKey = ids.join('|');
  useEffect(() => {
    let alive = true;
    const list = idsKey.split('|');
    Promise.all([
      getDocs(query(col('stockCounts'), where('stockId', 'in', list))),
      getDocs(col('productionBatches')),
      getDocs(query(col('stockMoves'), where('stockId', 'in', list))).catch(() => ({ docs: [] })), // rules ยังไม่ deploy = ไม่มีประวัติปรับยอด
    ]).then(([c, b, m]) => {
      if (!alive) return;
      const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setExtra({ counts: rows(c), batches: rows(b), moves: rows(m) });
    }).catch(() => { if (alive) setExtra({ error: true, counts: [], batches: [], moves: [] }); });
    return () => { alive = false; };
  }, [idsKey]);

  const all = useMemo(
    () => buildStockHistory({ item, stock, orders, expenses, ...(extra || {}) }),
    [item, stock, orders, expenses, extra],
  );
  const from = days ? isoDaysAgo(days) : '';
  const inRange = all.filter((r) => !from || (r.date || '') >= from);
  const rows = inRange.filter((r) => kind === 'all' || (kind === 'in' ? r.qty > 0 : r.qty < 0));
  const sum = summarizeHistory(inRange);
  const byDate = [];
  rows.forEach((r) => {
    const last = byDate[byDate.length - 1];
    if (last && last.date === r.date) last.rows.push(r); else byDate.push({ date: r.date, rows: [r] });
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="num text-sm text-[var(--text-secondary)]">{item.name} · ตอนนี้ <b className="text-[var(--text-primary)]">{qty(item.quantity)} {item.unit}</b></p>
      <SegmentedControl fullWidth ariaLabel="ช่วงเวลา" options={RANGES} value={days} onChange={setDays} />
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2">
          <p className="text-xs text-[var(--text-muted)]">เพิ่มเข้า</p>
          <p className="num font-semibold text-[var(--state-ok)]">+{qty(sum.in)} {item.unit}</p>
        </div>
        <div className="rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] px-3 py-2">
          <p className="text-xs text-[var(--text-muted)]">ตัดออก</p>
          <p className="num font-semibold text-[var(--text-primary)]">−{qty(sum.out)} {item.unit}</p>
        </div>
      </div>
      <FilterChips
        ariaLabel="ชนิดรายการ"
        value={kind}
        onChange={setKind}
        chips={[
          { value: 'all', label: 'ทั้งหมด', count: inRange.length },
          { value: 'in', label: 'เพิ่ม', count: inRange.filter((r) => r.qty > 0).length },
          { value: 'out', label: 'ตัด', count: inRange.filter((r) => r.qty < 0).length },
        ]}
      />
      {!extra && <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><Spinner size="sm" /> กำลังโหลดประวัติตรวจนับ/ผลิต/ปรับยอด…</p>}
      {extra?.error && <p className="text-sm text-[var(--state-warn)]">โหลดประวัติตรวจนับ/ผลิตไม่สำเร็จ · แสดงเฉพาะขาย รับเข้า ของเสีย</p>}
      {rows.length === 0 && extra && <p className="text-sm text-[var(--text-muted)]">ไม่มีความเคลื่อนไหวในช่วงนี้</p>}
      <ol className="flex flex-col gap-3">
        {byDate.map((g) => (
          <li key={g.date}>
            <p className="mb-1 text-xs font-semibold text-[var(--text-muted)]">{g.date ? formatThaiDate(g.date, { weekday: true }) : 'ไม่ระบุวันที่'}</p>
            <ul className="flex flex-col divide-y divide-[var(--border-light)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-color)]">
              {g.rows.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text-primary)]">{r.label}</span>
                    <span className="block text-xs text-[var(--text-muted)] break-words">
                      {[r.kind !== 'sale' && r.at ? `${formatTime(r.at)} น.` : null, r.detail].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={`num shrink-0 font-semibold ${r.qty > 0 ? 'text-[var(--state-ok)]' : 'text-[var(--text-primary)]'}`}>
                    {r.qty > 0 ? '+' : '−'}{qty(Math.abs(r.qty))} {item.unit}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="text-xs text-[var(--text-muted)]">ขายรวมเป็นรายวัน · ปุ่ม +/− ปรับยอดให้ตรง และแก้ตัวเลขคงเหลือ เริ่มเก็บประวัติตั้งแต่ 11 ต.ค. 2569</p>
    </div>
  );
}
