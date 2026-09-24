import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { BarChart3, RefreshCcw } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { funnelDay, summarizeFunnel } from '../utils/qrFunnel';
import { formatNumber, formatPercent } from '../utils/format';
import { Banner, IconButton, SectionCard, SegmentedControl } from './ui';

const RANGE_OPTIONS = [
  { value: 1, label: 'วันนี้' },
  { value: 7, label: '7 วัน' },
  { value: 30, label: '30 วัน' },
];

/**
 * QR funnel for staff: how many customer sessions reached each step of the QR
 * ordering page (daily counters written by src/utils/qrFunnel.js). Reads one
 * small doc per day, only when opened/refreshed.
 */
export default function QrFunnelCard() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ids = Array.from({ length: days }, (_, i) => funnelDay(new Date(Date.now() - i * 86400e3)));
      const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'qrFunnel', id))));
      setRows(summarizeFunnel(snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }))));
    } catch (e) {
      setError(e?.code === 'permission-denied'
        ? 'ยังไม่มีสิทธิ์อ่านสถิติ · ต้องล็อกอินด้วยบัญชีพนักงาน'
        : 'โหลดสถิติไม่สำเร็จ · ลองกดรีเฟรชอีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const max = rows?.[0]?.count || 0;

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><BarChart3 size={20} className="text-[var(--accent)]" />ลูกค้าหลุดตรงไหน (หน้า QR)</span>}
      description="นับจำนวนครั้งที่เข้าหน้า QR แล้วไปถึงแต่ละขั้น · ไม่เก็บชื่อหรือเบอร์"
      actions={(
        <>
          <SegmentedControl ariaLabel="ช่วงเวลา" options={RANGE_OPTIONS} value={days} onChange={setDays} />
          <IconButton
            icon={<RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />}
            variant="outline"
            size="lg"
            aria-label="รีเฟรช"
            disabled={loading}
            onClick={load}
          />
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        {error && <Banner tone="danger" title={error} />}
        {rows && max === 0 && !loading && (
          <p className="text-sm text-[var(--text-muted)]">ยังไม่มีข้อมูลในช่วงนี้ · ตัวนับเริ่มเก็บตั้งแต่วันที่เปิดใช้</p>
        )}
        {rows && max > 0 && (
          <ol className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.step} className="grid grid-cols-[6.5rem_1fr_auto] sm:grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="text-[var(--text-secondary)] font-medium">{r.label}</span>
                <div className="h-7 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} />
                </div>
                <span className="num text-right text-[var(--text-primary)] font-semibold min-w-[5.5rem]">
                  {formatNumber(r.count)}
                  {r.fromPrev != null && <small className="ml-1 font-normal text-[var(--text-muted)]">({formatPercent(r.fromPrev, { digits: 0 })})</small>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {rows && max > 0 && (
          <p className="text-sm text-[var(--text-muted)]">% ในวงเล็บ = เทียบกับขั้นก่อนหน้า · ถ้าตัวไหนตกมากผิดปกติ แปลว่าลูกค้าติดขั้นนั้น</p>
        )}
      </div>
    </SectionCard>
  );
}
