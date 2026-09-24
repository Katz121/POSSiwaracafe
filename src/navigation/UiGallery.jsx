import { useState } from 'react';
import { Package, Wallet, Receipt, Sparkles, Plus, Coffee } from 'lucide-react';
import {
  Button, Badge, CountBadge, Banner, PageHeader, StatCard, Money, DataTable, SegmentedControl,
  FilterChips, Toolbar, Sheet, DateStepper, NumberStepper, ListRow, SectionCard, EmptyState, Tabs,
  ConfirmModal,
} from '../components/ui';
import { toISODateLocal } from '../utils/format';

const ROWS = [
  { id: 'a', name: 'ลาเต้เย็น', category: 'กาแฟ', qty: 42, total: 2310 },
  { id: 'b', name: 'อเมริกาโน่', category: 'กาแฟ', qty: 31, total: 1395.5 },
  { id: 'c', name: 'ชาเขียวมัทฉะ', category: 'ชา', qty: 12, total: 780 },
  { id: 'd', name: 'บราวนี่', category: 'เบเกอรี่', qty: 7, total: 38312.276 },
];

function Row({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-[var(--text-muted)]">{title}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

/**
 * Dev-only reference (`#/__ui`) for view packages. Toggle the theme from the
 * sidebar footer to check both themes. Not bundled in production builds.
 */
export default function UiGallery() {
  const [seg, setSeg] = useState('day');
  const [chip, setChip] = useState('all');
  const [multi, setMulti] = useState(['unpaid']);
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [date, setDate] = useState(toISODateLocal(new Date()));
  const [month, setMonth] = useState(toISODateLocal(new Date()).slice(0, 7));
  const [qty, setQty] = useState(2.5);
  const [sel, setSel] = useState('b');
  const [tab, setTab] = useState('links');

  return (
    <div className="min-h-full bg-[var(--bg-canvas)]">
      <PageHeader
        title="UI gallery"
        subtitle="WP0 · components/ui · สำหรับทีมอื่นอ้างอิง"
        icon={Coffee}
        back={{ label: 'กลับ', onClick: () => window.history.back() }}
        actions={(
          <>
            <Button variant="ai" leftIcon={<Sparkles size={16} />}>ถาม AI</Button>
            <Button leftIcon={<Plus size={16} />}>เพิ่มเมนู</Button>
          </>
        )}
        meta={<><Badge tone="ok">VAT เปิด</Badge><Badge tone="warn">PIN ปิด</Badge></>}
      />
      <Toolbar
        search={{ value: q, onChange: setQ, placeholder: 'ค้นหาเลขคิว ชื่อ หรือรหัส' }}
        filters={(
          <FilterChips
            value={chip}
            onChange={setChip}
            onClear={() => setChip('all')}
            chips={[
              { value: 'all', label: 'ทั้งหมด' },
              { value: 'unpaid', label: 'ค้างชำระ', count: 3, tone: 'warn' },
              { value: 'paid', label: 'จ่ายแล้ว', count: 18 },
              { value: 'qr', label: 'QR', count: 5, tone: 'info' },
            ]}
          />
        )}
        actions={<Button variant="secondary">Export CSV</Button>}
      />
      <div className="px-[var(--page-pad)] pb-10 flex flex-col gap-8">
        <Row title="Button">
          <Button>บันทึก</Button>
          <Button variant="secondary">ยกเลิก</Button>
          <Button variant="ghost">ข้าม</Button>
          <Button variant="outline">ดูรายละเอียด</Button>
          <Button variant="danger">ลบ</Button>
          <Button variant="warning">ค้างจ่าย</Button>
          <Button variant="ai" leftIcon={<Sparkles size={16} />}>แปลเมนู</Button>
          <Button size="xl">รับเงินแล้ว · ฿120</Button>
          <Button loading>บันทึก</Button>
        </Row>
        <Row title="Badge / CountBadge">
          <Badge tone="ok" dot>พร้อมขาย</Badge>
          <Badge tone="warn">ใกล้หมด</Badge>
          <Badge tone="danger">หมด</Badge>
          <Badge tone="info">QR</Badge>
          <Badge tone="neutral">ร่าง</Badge>
          <Badge tone="accent">แนะนำ</Badge>
          <Badge variant="primary">ใหม่</Badge>
          <CountBadge count={4} />
          <CountBadge count={12} variant="warning" />
          <CountBadge count={120} variant="primary" />
        </Row>
        <Row title="Money">
          <Money value={38312.276} size="xl" />
          <Money value={1200} />
          <Money value={-45.5} tone="danger" />
          <Money value={20} sign tone="ok" />
          <Money value={4280} size="display" />
        </Row>
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard label="ยอดขายวันนี้" value={<Money value={4280.5} />} icon={Wallet} delta={{ value: 12.4, direction: 'up', good: 'up', label: 'เทียบ พฤ. ที่แล้ว' }} />
          <StatCard label="บิล / แก้ว" value="38" unit="บิล" hint="112 แก้ว" icon={Receipt} />
          <StatCard label="ค้างชำระ" value={<Money value={360} />} tone="warn" icon={Receipt} onClick={() => {}} hint="แตะเพื่อดูบิล" />
          <StatCard label="รายจ่ายวันนี้" value={<Money value={950} />} delta={{ value: 8, direction: 'up', good: 'down' }} icon={Package} />
          <StatCard label="กำลังโหลด" value="" loading />
        </section>
        <Row title="Banner">
          <div className="flex flex-col gap-2 w-full max-w-2xl">
            <Banner tone="danger" title="มี 46 เมนูที่ตัดสต็อกไม่ได้" action={{ label: 'ดูรายการ', onClick: () => {} }} />
            <Banner tone="warn" title="ยังบันทึกไม่สำเร็จ กำลังลองใหม่" onDismiss={() => {}}>อย่าเพิ่งปิดหน้านี้</Banner>
            <Banner tone="info" title="มีแต้มรออนุมัติ 3 คน" action={{ label: 'ไปอนุมัติ', onClick: () => {} }} />
            <Banner tone="ok" title="ปิดยอดวันนี้แล้ว" />
          </div>
        </Row>
        <Row title="SegmentedControl / DateStepper / NumberStepper">
          <SegmentedControl ariaLabel="ช่วงเวลา" value={seg} onChange={setSeg} options={[{ value: 'day', label: 'วัน' }, { value: 'month', label: 'เดือน' }, { value: 'all', label: 'ทั้งหมด', count: 3 }]} />
          <SegmentedControl size="lg" value={seg} onChange={setSeg} options={[{ value: 'day', label: 'หวาน 100' }, { value: 'month', label: 'หวาน 50' }, { value: 'all', label: 'ไม่หวาน' }]} />
          <DateStepper value={date} onChange={setDate} />
          <DateStepper mode="month" value={month} onChange={setMonth} />
          <NumberStepper value={qty} onChange={setQty} step={0.5} min={0} unit="กก." ariaLabel="นม" />
        </Row>
        <Row title="FilterChips (multi)">
          <FilterChips value={multi} onChange={setMulti} onClear={() => setMulti([])} chips={[{ value: 'unpaid', label: 'ค้างชำระ', count: 3 }, { value: 'qr', label: 'QR' }, { value: 'cake', label: 'มีเค้ก' }]} />
        </Row>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-muted)]">DataTable (cards below md)</h2>
          <DataTable
            caption="ยอดขายตามเมนู"
            rows={ROWS}
            selectedKey={sel}
            onRowClick={(r) => setSel(r.id)}
            columns={[
              { key: 'name', header: 'เมนู', sortable: true },
              { key: 'category', header: 'หมวด', sortable: true },
              { key: 'qty', header: 'ชิ้น', numeric: true, sortable: true },
              { key: 'total', header: 'ยอดขาย', numeric: true, sortable: true, render: (v) => <Money value={v} /> },
            ]}
          />
          <DataTable rows={[]} columns={[{ key: 'x', header: 'ว่าง' }]} emptyState={{ title: 'ยังไม่มีบิลวันนี้', description: 'บิลใหม่จะขึ้นที่นี่ทันที', icon: 'receipt' }} />
        </section>
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionCard title="ListRow" description="56px แถวสำหรับมือถือ" actions={<Button size="sm" variant="secondary">ทั้งหมด</Button>} padding="none" className="overflow-hidden">
            <ListRow title="คิว 12 · นุช" subtitle="ลาเต้เย็น ×2 · 10:32" meta={<Money value={130} />} onClick={() => {}} />
            <ListRow title="คิว 13" subtitle="อเมริกาโน่ · 10:40" meta={<Badge tone="warn">ค้างชำระ</Badge>} onClick={() => {}} selected />
            <ListRow title="นมสด" subtitle="เหลือ 2 ลิตร" trailing={null} meta={<Badge tone="danger">ใกล้หมด</Badge>} />
          </SectionCard>
          <SectionCard title="Tabs (underline + count)">
            <Tabs value={tab} onChange={setTab} variant="underline">
              <Tabs.List>
                <Tabs.Tab value="links" count={46}>ลิงก์สต็อก</Tabs.Tab>
                <Tabs.Tab value="day">รายวัน</Tabs.Tab>
                <Tabs.Tab value="neg" count={2}>ติดลบ</Tabs.Tab>
              </Tabs.List>
            </Tabs>
            <EmptyState size="sm" tone="ok" title="ไม่มีปัญหา" description="ทุกเมนูตัดสต็อกได้" />
          </SectionCard>
        </section>
        <Row title="Sheet / ConfirmModal">
          <Button onClick={() => setSheet(true)}>เปิด Sheet</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>ConfirmModal</Button>
        </Row>
      </div>
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="รับของเข้า · นมสด"
        description="บันทึกเป็นรายจ่ายและเพิ่มสต็อกพร้อมกัน"
        footer={<><Button variant="secondary" onClick={() => setSheet(false)}>ยกเลิก</Button><Button onClick={() => setSheet(false)}>บันทึก</Button></>}
      >
        <div className="flex flex-col gap-4">
          <NumberStepper value={qty} onChange={setQty} step={1} min={0} unit="ลิตร" ariaLabel="จำนวน" />
          <SegmentedControl fullWidth size="lg" value={seg} onChange={setSeg} options={[{ value: 'day', label: 'เงินสด' }, { value: 'month', label: 'โอน' }]} />
        </div>
      </Sheet>
      <ConfirmModal isOpen={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} title="ลบบิลนี้?" message="ลบแล้วเรียกคืนไม่ได้" confirmText="ลบบิล" />
    </div>
  );
}
