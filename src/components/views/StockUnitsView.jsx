import { useMemo, useState } from 'react';
import { Scale, Pencil } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { useDataContext, useUIContext } from '../../context/AppContext';
import { getStockCategory } from '../../config/constants';
import { formatNumber } from '../../utils/format';
import { normalizePacks } from '../../utils/stockIntake';
import { Button, EmptyState, FilterChips, PageHeader, Toolbar, useToast } from '../ui';
import PacksEditor from './inventory/PacksEditor';

const qty = (n) => formatNumber(n, { maxDecimals: 3 });

/**
 * StockUnitsView · ตัวเทียบหน่วย (หน่วยซื้อ → หน่วยที่สูตรตัด) ของทุกวัตถุดิบในหน้าเดียว
 * ข้อมูลอยู่ที่ stock.packs ตัวเดียวกับหน้าแก้ไขวัตถุดิบ · "รับของเข้า" กับบอท Telegram ใช้แปลง
 * เช่น น้ำช่อดอกมะพร้าว 1 ขวด = 1000 · ไซรัปส้ม 1 ขวด = 300 · ขวดคนละขนาดตั้งชื่อต่างกัน (ขวดเล็ก/ขวดใหญ่)
 */
export default function StockUnitsView() {
  const { activeStock = [] } = useDataContext();
  const { runDbAction } = useUIContext();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // { id, packs }
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(
    () => [...activeStock].sort((a, b) => getStockCategory(a).localeCompare(getStockCategory(b), 'th') || String(a.name).localeCompare(String(b.name), 'th')),
    [activeStock],
  );
  const has = (s) => normalizePacks(s.packs).length > 0;
  const counts = { all: sorted.length, missing: sorted.filter((s) => !has(s)).length, set: sorted.filter(has).length };
  const q = search.trim().toLocaleLowerCase('th');
  const rows = sorted.filter((s) => (filter === 'all' || (filter === 'set' ? has(s) : !has(s)))
    && (!q || String(s.name).toLocaleLowerCase('th').includes(q) || getStockCategory(s).toLocaleLowerCase('th').includes(q)));

  const startEdit = (s) => setEditing({ id: s.id, packs: normalizePacks(s.packs).length ? normalizePacks(s.packs) : [{ label: '', size: '' }] });
  const save = async (s) => {
    const packs = normalizePacks(editing.packs);
    const half = editing.packs.filter((p) => String(p.label).trim() || String(p.size).trim()).length - packs.length;
    if (half > 0) { toast.warning('มีแถวที่กรอกไม่ครบหรือชื่อซ้ำ · ใส่ทั้งชื่อหน่วยและจำนวนมากกว่า 0 หรือลบแถวนั้น'); return; }
    setSaving(true);
    const ok = await runDbAction(async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stock', s.id), { packs });
    }, 'บันทึกตัวเทียบไม่สำเร็จ');
    setSaving(false);
    if (ok) { toast.success(`บันทึกตัวเทียบ "${s.name}" แล้ว`); setEditing(null); }
  };

  return (
    <div className="h-full bg-[var(--bg-canvas)] flex flex-col overflow-hidden text-[var(--text-primary)]">
      <PageHeader title="ตัวเทียบหน่วย" subtitle="ซื้อเป็นขวด/ถุง/ลัง · สูตรตัดเป็นกรัม/มล. · ตั้งไว้ที่นี่ รับของเข้าแปลงให้เอง" icon={Scale} sticky={false} />
      <Toolbar
        search={{ value: search, onChange: setSearch, placeholder: 'ค้นหาวัตถุดิบหรือหมวด' }}
        filters={(
          <FilterChips
            className="[&>button]:min-h-11"
            ariaLabel="สถานะตัวเทียบ"
            value={filter}
            onChange={setFilter}
            chips={[
              { value: 'all', label: 'ทั้งหมด', count: counts.all },
              { value: 'missing', label: 'ยังไม่ตั้ง', count: counts.missing, tone: 'warn' },
              { value: 'set', label: 'ตั้งแล้ว', count: counts.set },
            ]}
          />
        )}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-[var(--page-pad)] pb-24 md:pb-10">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            ตัวเลขคือหน่วยที่สูตรตัดของวัตถุดิบนั้น · ของเหลวที่ตัดเป็นกรัมให้ใส่น้ำหนักจริงของ 1 ขวด · ขวดคนละขนาดตั้งคนละชื่อ เช่น ขวดเล็ก = 100, ขวดใหญ่ = 1000
          </p>
          {rows.length === 0 && <EmptyState icon={Scale} title="ไม่พบวัตถุดิบ" description="ลองเปลี่ยนคำค้นหรือตัวกรอง" />}
          <ul className="flex flex-col gap-2">
            {rows.map((s) => {
              const packs = normalizePacks(s.packs);
              const open = editing?.id === s.id;
              return (
                <li key={s.id} className="rounded-[var(--radius)] bg-[var(--bg-surface)] p-3 shadow-[var(--elev-1)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{s.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{getStockCategory(s)} · สูตรตัดเป็น <b className="text-[var(--text-secondary)]">{s.unit || 'หน่วย'}</b></p>
                    </div>
                    {!open && (
                      <Button size="sm" variant={packs.length ? 'secondary' : 'primary'} leftIcon={<Pencil size={16} />} onClick={() => startEdit(s)}>
                        {packs.length ? 'แก้ไข' : 'ตั้งตัวเทียบ'}
                      </Button>
                    )}
                  </div>
                  {!open && packs.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {packs.map((p) => (
                        <li key={p.label} className="num rounded-full bg-[var(--bg-sunken)] px-3 py-1 text-sm">
                          1 {p.label} = <b>{qty(p.size)}</b> {s.unit}
                        </li>
                      ))}
                    </ul>
                  )}
                  {open && (
                    <div className="mt-3 flex flex-col gap-3">
                      <PacksEditor packs={editing.packs} unit={s.unit} onChange={(next) => setEditing({ ...editing, packs: next })} idBase={`u-${s.id}`} />
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setEditing(null)}>ยกเลิก</Button>
                        <Button loading={saving} disabled={saving} onClick={() => save(s)}>บันทึก</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
