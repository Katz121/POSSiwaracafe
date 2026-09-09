import { useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, Target } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { getISODate, getOrderDate } from '../../utils/calculations';
import { computeProfitability } from '../../utils/profitability';
import { STOCK_CATEGORIES } from '../../config/constants';
import { Badge, Button, Card, Table } from '../ui';

// การซื้อเข้าคลังต้องไม่ถูกหักซ้ำกับต้นทุนที่ใช้ตอนขาย
const INVENTORY_CATEGORIES = ['วัตถุดิบ', ...STOCK_CATEGORIES];
const money = value => '฿' + Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const baseColumns = [
    { key: 'name', label: 'ชื่อเมนู' },
    { key: 'quantity', label: 'จำนวนที่ขาย', render: value => value.toLocaleString() },
    { key: 'revenue', label: 'ยอดขาย', render: money },
    { key: 'ratio', label: '% ของราคา', render: (_, row) => row.revenue > 0 ? ((row.cost || 0) / row.revenue * 100).toFixed(2) + '%' : 'ไม่มีราคาขาย', sortable: false },
];
const suspiciousColumns = [
    ...baseColumns.slice(0, 3),
    { key: 'unitCost', label: 'ต้นทุนต่อหน่วย', render: (_, row) => money(row.cost / (row.quantity || 1)), sortable: false },
    baseColumns[3],
];

export default function ProfitabilityView() {
    const { orders, expenses, menu, stock, setView } = useAppContext();
    const [currentMonth, setCurrentMonth] = useState(() => getISODate().slice(0, 7));
    const profitability = useMemo(() => computeProfitability({
        orders: orders.filter(o => o.status === 'completed' && String(getOrderDate(o)).startsWith(currentMonth)),
        expenses: expenses.filter(e => String(e.date || '').startsWith(currentMonth)),
        menu,
        stock,
        inventoryCategories: INVENTORY_CATEGORIES,
    }), [orders, expenses, menu, stock, currentMonth]);


    return (
        <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <header className="h-16 md:h-20 lg:h-24 shrink-0 flex items-center gap-3 px-4 md:px-8 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <Button variant="ghost" onClick={() => setView('admin')} aria-label="กลับหน้าจัดการ"><ChevronLeft size={24} /></Button>
                <h1 className="text-lg md:text-2xl font-bold">ความสามารถทำกำไร</h1>
            </header>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 space-y-6">
                <label className="flex flex-wrap items-center gap-3 font-medium">เดือนที่ต้องการดู
                    <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3" />
                </label>
                {/* กำไรขั้นต้น · กำไรสุทธิ · จุดคุ้มทุน
                    แยกจากตัวเลขเงินสดข้างบนโดยตั้งใจ ตัวนี้ตัดต้นทุนตอนขาย ไม่ใช่ตอนซื้อ */}
                <Card padding="lg" className="space-y-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-3">
                                <Target className="text-[var(--accent-emerald)]" /> ความสามารถทำกำไร
                            </h2>
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                ตัดต้นทุนวัตถุดิบตอนขาย ไม่ใช่ตอนซื้อ · ห้ามเอาไปบวกลบกับตัวเลขเงินสด
                            </p>
                        </div>
                        {profitability.cogsCoverage < 100 && (
                            <Badge variant={profitability.cogsCoverage < 60 ? 'danger' : 'warning'}>
                                ต้นทุนครอบคลุมยอดขาย {profitability.cogsCoverage}%
                            </Badge>
                        )}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-[var(--bg-tertiary)] rounded-2xl p-4 border border-[var(--border-color)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] tracking-wider mb-2">กำไรขั้นต้น</p>
                            <p className="text-3xl lg:text-4xl font-bold text-[var(--accent-emerald)] num">฿{Math.round(profitability.grossProfit).toLocaleString()}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1 num">มาร์จิ้น {profitability.grossMargin}%</p>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] rounded-2xl p-4 border border-[var(--border-color)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] tracking-wider mb-2">ต้นทุนวัตถุดิบที่ใช้ไป</p>
                            <p className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] num">฿{Math.round(profitability.cogs).toLocaleString()}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1 num">{profitability.cogsRatio}% ของยอดขาย</p>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] rounded-2xl p-4 border border-[var(--border-color)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] tracking-wider mb-2">กำไรสุทธิ</p>
                            <p className={`text-3xl lg:text-4xl font-bold num ${profitability.netProfit >= 0 ? 'text-[var(--accent-emerald)]' : 'text-[var(--state-danger)]'}`}>
                                ฿{Math.round(profitability.netProfit).toLocaleString()}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mt-1 num">หลังหักค่าใช้จ่าย ฿{Math.round(profitability.fixedCosts).toLocaleString()}</p>
                        </div>

                        <div className="bg-[var(--bg-tertiary)] rounded-2xl p-4 border border-[var(--border-color)]">
                            <p className="text-xs font-medium text-[var(--text-muted)] tracking-wider mb-2">กำไรขั้นต้นต่อแก้ว</p>
                            <p className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] num">฿{Math.round(profitability.contributionPerUnit).toLocaleString()}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1 num">ขายไป {profitability.unitsSold.toLocaleString()} หน่วย</p>
                        </div>
                    </div>

                    {/* จุดคุ้มทุน · ตัวเลขที่ใช้ตัดสินใจได้จริงที่สุดจากทั้งหน้านี้ */}
                    <div className="rounded-2xl p-5 border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                        {profitability.breakEvenUnits === null ? (
                            <p className="text-sm text-[var(--state-danger)] font-medium">
                                ยังคำนวณจุดคุ้มทุนไม่ได้ · กำไรขั้นต้นต่อหน่วยไม่เป็นบวก แปลว่ายิ่งขายยิ่งขาดทุน ให้ตรวจราคาขายกับต้นทุนก่อน
                            </p>
                        ) : !profitability.hasFixedCosts ? (
                            <p className="text-sm text-[var(--state-warn)] font-medium">
                                ยังไม่ได้บันทึกค่าใช้จ่ายคงที่ของเดือนนี้ (ค่าเช่า เงินเดือน ค่าไฟ) จุดคุ้มทุนเลยยังไม่มีความหมาย · บันทึกรายจ่ายพวกนี้เข้าระบบก่อน แล้วตัวเลขจะขึ้นเอง
                            </p>
                        ) : (
                            <>
                                <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
                                    <p className="text-sm font-bold text-[var(--text-primary)]">
                                        จุดคุ้มทุนเดือนนี้ · <span className="num">{profitability.breakEvenUnits.toLocaleString()}</span> หน่วย
                                        <span className="text-[var(--text-muted)] font-normal num"> (฿{profitability.breakEvenRevenue.toLocaleString()})</span>
                                    </p>
                                    <p className={`text-sm font-bold ${profitability.pastBreakEven ? 'text-[var(--accent-emerald)]' : 'text-[var(--state-warn)]'}`}>
                                        {profitability.pastBreakEven
                                            ? `เลยจุดคุ้มทุนแล้ว ทุกหน่วยจากนี้กำไรเต็ม ฿${Math.round(profitability.contributionPerUnit).toLocaleString()}`
                                            : `เหลืออีก ${profitability.unitsToBreakEven.toLocaleString()} หน่วยถึงเท่าทุน`}
                                    </p>
                                </div>
                                <div className="h-3 w-full bg-[var(--bg-tertiary)] rounded-full overflow-hidden border border-[var(--border-color)]">
                                    <div
                                        className={`h-full rounded-full transition-all ${profitability.pastBreakEven ? 'bg-[var(--accent-emerald)]' : 'bg-[var(--state-warn)]'}`}
                                        style={{ width: `${Math.min(100, Math.round((profitability.unitsSold / profitability.breakEvenUnits) * 100))}%` }}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* ผูกสต็อกไม่ครบ = กำไรขั้นต้นสวยเกินจริงเสมอ ต้องเตือนให้เห็น */}
                    {profitability.uncostedItems.length > 0 && (
                        <div className="rounded-2xl p-5 border border-[var(--border-color)] bg-[var(--bg-tertiary)]">
                            <p className="text-sm font-bold text-[var(--state-warn)] mb-1 flex items-center gap-2">
                                <AlertCircle size={16} /> ยังไม่ได้ผูกต้นทุน {profitability.uncostedItems.length} เมนู
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mb-3">
                                เมนูพวกนี้ถูกคิดต้นทุนเป็น 0 ทำให้กำไรขั้นต้นข้างบนสูงกว่าความจริง · ผูกสต็อกในหน้าจัดการเมนูเพื่อให้ตัวเลขตรง
                            </p>
                            <Table data={profitability.uncostedItems} columns={baseColumns} />
                        </div>
                    )}

                    {/* ผูกบางส่วนอันตรายกว่าไม่ผูกเลย เพราะมันผ่านด่าน "คิดต้นทุนแล้ว" ไปได้เงียบๆ */}
                    {profitability.suspiciousItems.length > 0 && (
                        <div className="rounded-2xl p-5 border border-[var(--border-color)] bg-[var(--bg-tertiary)]">
                            <p className="text-sm font-bold text-[var(--state-warn)] mb-1 flex items-center gap-2">
                                <AlertCircle size={16} /> ต้นทุนต่ำผิดปกติ {profitability.suspiciousItems.length} เมนู
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mb-3">
                                ผูกสต็อกไว้แล้วแต่ต้นทุนต่ำกว่า 8% ของราคาขาย มักเกิดตอนที่วัตถุดิบหลักอยู่ที่ตัวเลือก (#) ซึ่งยังไม่ได้ผูกสต็อก หรือยังไม่ได้ใส่แก้ว ฝา หลอด
                            </p>
                            <Table data={profitability.suspiciousItems} columns={suspiciousColumns} />
                        </div>
                    )}

                    {/* อธิบายว่าทำไมกำไรกับเงินสดไม่เท่ากัน แทนที่จะให้วางงงเอง */}
                    {Math.abs(profitability.inventoryMovement) > 100 && (
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                            {profitability.inventoryMovement > 0
                                ? `เดือนนี้ซื้อของเข้าคลังมากกว่าที่ใช้ไป ฿${Math.round(profitability.inventoryMovement).toLocaleString()} เงินสดเลยดูหายมากกว่ากำไรที่หายจริง ของก้อนนี้จะกลายเป็นยอดขายเดือนหน้า`
                                : `เดือนนี้ใช้ของเก่าในคลังมากกว่าที่ซื้อเข้า ฿${Math.abs(Math.round(profitability.inventoryMovement)).toLocaleString()} เงินสดเลยดูดีกว่ากำไรจริง เดือนหน้าถ้าต้องตุนของ เงินสดจะตกลง`}
                        </p>
                    )}
                </Card>

            </div>
        </div>
    );
}
