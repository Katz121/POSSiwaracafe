import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { BarChart3, RefreshCcw } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { funnelDay, summarizeFunnel } from '../utils/qrFunnel';

const RANGES = [1, 7, 30];

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
    <div className="bg-[var(--bg-secondary)] rounded-[var(--radius)] p-6 border border-[var(--border-color)] shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-500"><BarChart3 size={22} /></div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">ลูกค้าหลุดตรงไหน (หน้า QR)</h2>
            <p className="text-xs text-[var(--text-muted)]">นับจำนวนครั้งที่เข้าหน้า QR แล้วไปถึงแต่ละขั้น · ไม่เก็บชื่อหรือเบอร์</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={`min-h-[44px] px-3 rounded-[var(--radius-sm)] text-xs font-semibold border ${days === d ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-color)]'}`}>
              {d === 1 ? 'วันนี้' : `${d} วัน`}
            </button>
          ))}
          <button type="button" onClick={load} aria-label="รีเฟรช" disabled={loading}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] disabled:opacity-50">
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {rows && max === 0 && !loading && (
        <p className="text-sm text-[var(--text-muted)]">ยังไม่มีข้อมูลในช่วงนี้ · ตัวนับเริ่มเก็บตั้งแต่วันที่เปิดใช้</p>
      )}
      {rows && max > 0 && (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.step} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
              <span className="text-[var(--text-secondary)] font-medium">{r.label}</span>
              <div className="h-7 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] overflow-hidden">
                <div className="h-full bg-emerald-500/80" style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} />
              </div>
              <span className="num text-right tabular-nums text-[var(--text-primary)] font-semibold min-w-[6.5rem]">
                {r.count.toLocaleString('th-TH')}
                {r.fromPrev != null && <small className="ml-1 font-normal text-[var(--text-muted)]">({r.fromPrev}%)</small>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {rows && max > 0 && (
        <p className="text-xs text-[var(--text-muted)]">% ในวงเล็บ = เทียบกับขั้นก่อนหน้า · ถ้าตัวไหนตกมากผิดปกติ แปลว่าลูกค้าติดขั้นนั้น</p>
      )}
    </div>
  );
}
