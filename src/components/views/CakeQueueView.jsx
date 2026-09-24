import { useEffect, useMemo, useState } from 'react';
import { Cake, Phone, Clock, CheckCircle2, PackageCheck, XCircle, RotateCcw, Zap, Truck, Store } from 'lucide-react';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, appId } from '../../services/firebase';
import { Button, Badge, Card, EmptyState, PageHeader, Spinner, Tabs, useToast } from '../ui';
import { formatBaht } from '../../utils/format';

/**
 * คิวเค้กสั่งทำ
 *
 * ข้อมูลมาจากหน้า siwaracafe.com/cake → ลูกค้าส่งรหัสเข้าไลน์ → worker เขียนลง
 * `cakeQueue` (ดู api-proxy/worker.js · saveCakeQueueItem) หน้านี้แค่อ่านกับเปลี่ยนสถานะ
 *
 * ทำไมต้องมี: แชทไลน์กับ Telegram เป็นการแจ้งเตือน ไม่ใช่รายการงาน
 * ร้านต้องตอบได้ว่า "เสาร์นี้มีกี่ก้อน" และ "ก้อนไหนยังไม่ได้ยืนยันกับลูกค้า"
 *
 * ⚠️ การยืนยันคิวเป็นการตัดสินใจของคน · บอทไม่เคยยืนยันแทน สถานะเริ่มที่ "ใหม่" เสมอ
 */

const FLOW = {
  new:       { label: 'ใหม่ ยังไม่ยืนยัน', tone: 'amber',   next: 'confirmed', nextLabel: 'ยืนยันคิวแล้ว', icon: Clock },
  confirmed: { label: 'ยืนยันคิวแล้ว',     tone: 'blue',    next: 'done',      nextLabel: 'ทำเสร็จแล้ว',   icon: CheckCircle2 },
  done:      { label: 'ทำเสร็จ รอรับ',      tone: 'violet',  next: 'picked',    nextLabel: 'ลูกค้ารับแล้ว', icon: PackageCheck },
  picked:    { label: 'รับแล้ว',            tone: 'emerald', next: null,        nextLabel: '',              icon: PackageCheck },
  cancelled: { label: 'ยกเลิก',             tone: 'rose',    next: null,        nextLabel: '',              icon: XCircle },
};

// Status → Badge tone (semantic tokens, readable in both themes)
const TONE = { amber: 'warn', blue: 'info', violet: 'neutral', emerald: 'ok', rose: 'danger' };

export default function CakeQueueView() {
  const toast = useToast();
  const [items, setItems] = useState(null);      // null = ยังโหลดอยู่
  const [tab, setTab] = useState('todo');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'cakeQueue');
    const stop = onSnapshot(
      ref,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setItems([]),                        // อ่านไม่ได้ (ยังไม่ได้ deploy rules) ให้เป็นรายการว่าง ไม่ใช่ค้างหมุน
    );
    return stop;
  }, []);

  const groups = useMemo(() => {
    const all = [...(items || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return {
      todo: all.filter((o) => o.status === 'new' || o.status === 'confirmed'),
      done: all.filter((o) => o.status === 'done'),
      closed: all.filter((o) => o.status === 'picked' || o.status === 'cancelled'),
      all,
    };
  }, [items]);

  async function setStatus(item, status) {
    setBusy(item.id);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'cakeQueue', item.id), {
        status,
        statusAt: new Date().toISOString(),
      });
      toast.success(`${item.code} → ${FLOW[status]?.label || status}`);
    } catch (e) {
      toast.error('เปลี่ยนสถานะไม่สำเร็จ: ' + (e?.message || ''));
    } finally {
      setBusy('');
    }
  }

  if (items === null) {
    return <div className="flex justify-center py-20"><Spinner /></div>;
  }

  const list = groups[tab] || [];
  const waiting = groups.todo.filter((o) => o.status === 'new').length;

  return (
    <div className="min-h-full">
      <PageHeader
        title="คิวเค้กสั่งทำ"
        subtitle="ออเดอร์จากหน้าเว็บ siwaracafe.com/cake"
        icon={Cake}
        meta={waiting > 0 ? <Badge tone="warn" dot>{waiting} รายการยังไม่ได้ยืนยันกับลูกค้า</Badge> : null}
      />
      <div className="px-[var(--page-pad)] py-4 space-y-4">
      <Tabs value={tab} onChange={setTab} variant="underline">
        <Tabs.List className="w-full overflow-x-auto scrollbar-hide">
          <Tabs.Tab value="todo" count={groups.todo.length}>ต้องทำ</Tabs.Tab>
          <Tabs.Tab value="done" count={groups.done.length}>รอรับ</Tabs.Tab>
          <Tabs.Tab value="closed" count={groups.closed.length}>จบแล้ว</Tabs.Tab>
          <Tabs.Tab value="all" count={groups.all.length}>ทั้งหมด</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {list.length === 0 ? (
        <EmptyState
          icon={Cake}
          title={tab === 'todo' ? 'ยังไม่มีคิวที่ต้องทำ' : 'ไม่มีรายการในหมวดนี้'}
          description="ออเดอร์จะเข้ามาเองเมื่อลูกค้าสั่งจากหน้าเว็บแล้วส่งรหัสเข้าไลน์ของร้าน"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((o) => {
            const flow = FLOW[o.status] || FLOW.new;
            const StatusIcon = flow.icon;
            return (
              <Card key={o.id} className="p-3 flex gap-3">
                {o.img ? (
                  <img
                    src={`https://siwaracafe.com/${o.img}`}
                    alt={o.designName || 'ลายเค้ก'}
                    width={96}
                    height={96}
                    loading="lazy"
                    decoding="async"
                    className="w-24 h-24 rounded-[var(--radius-sm)] object-cover shrink-0 border border-[var(--border-color)]"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-[var(--radius-sm)] shrink-0 border border-dashed border-[var(--border-color)]
                                  flex items-center justify-center text-xs leading-[18px] text-center text-[var(--text-muted)] p-1">
                    ลูกค้าส่งรูปเอง<br />ดูในแชท
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={TONE[flow.tone]} icon={<StatusIcon size={12} />}>{flow.label}</Badge>
                    <code className="text-xs text-[var(--text-muted)]">{o.code}</code>
                    {o.rush && <Badge tone="warn" icon={<Zap size={12} />}>ขอด่วน</Badge>}
                  </div>

                  <div className="font-semibold leading-normal truncate text-[var(--text-primary)]">{o.designName || o.design || 'ไม่ระบุลาย'}</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {[o.size, o.flavor].filter(Boolean).join(' · ')}
                  </div>
                  {o.msg && <div className="text-sm text-[var(--text-secondary)]">เขียนหน้าเค้ก: “{o.msg}”</div>}

                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    รับ {o.pickupDate || '-'} {o.pickupTime || ''}
                    <span className="ml-2 text-[var(--text-muted)]">
                      {String(o.fulfill || '').includes('ส่ง')
                        ? <><Truck size={11} className="inline -mt-0.5 mr-0.5" />{o.fulfill}</>
                        : <><Store size={11} className="inline -mt-0.5 mr-0.5" />{o.fulfill || 'รับที่ร้าน'}</>}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm flex-wrap text-[var(--text-primary)]">
                    <span>{o.name || '-'}</span>
                    {o.tel && (
                      <a href={`tel:${o.tel}`} className="min-h-11 text-[var(--accent-soft-fg)] inline-flex items-center gap-1">
                        <Phone size={12} />{o.tel}
                      </a>
                    )}
                    {!!o.total && <span className="ml-auto font-semibold num">~{formatBaht(o.total)}</span>}
                  </div>

                  <div className="flex gap-2 pt-1 flex-wrap">
                    {flow.next && (
                      <Button size="md" disabled={busy === o.id} onClick={() => setStatus(o, flow.next)}>
                        {flow.nextLabel}
                      </Button>
                    )}
                    {o.status !== 'cancelled' && o.status !== 'picked' && (
                      <Button size="md" variant="ghost" disabled={busy === o.id} onClick={() => setStatus(o, 'cancelled')}>
                        ยกเลิก
                      </Button>
                    )}
                    {(o.status === 'picked' || o.status === 'cancelled') && (
                      <Button size="md" variant="ghost" disabled={busy === o.id} onClick={() => setStatus(o, 'new')}>
                        <RotateCcw size={16} />เอากลับเข้าคิว
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs leading-[18px] text-[var(--text-muted)] pt-2">
        ยอดที่เห็นเป็นยอดประเมินจากตัวเลือกบนเว็บ · ราคาจริงยืนยันกับลูกค้าในแชทเสมอ
      </p>
      </div>
    </div>
  );
}
