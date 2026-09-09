import { forwardRef, useState } from 'react';
import { usageFromPortions, portionsFromUsage } from '../../utils/wastage';

const StockUsageInput = forwardRef(function StockUsageInput({ usage, unit = 'หน่วย', onChange, className = '' }, ref) {
  const [mode, setMode] = useState(['ก้อน', 'ชิ้น', 'ถุง', 'ใบ'].includes(unit.trim()) ? 'portions' : 'usage');
  const [draft, setDraft] = useState(null);
  const portions = portionsFromUsage(usage);
  const displayPortions = Number.isInteger(portions) ? String(portions) : portions.toFixed(2);
  return <div ref={ref} className={`space-y-2 ${className}`}>
    <select aria-label="โหมดกรอกปริมาณ" className="w-full min-h-11 bg-[var(--bg-tertiary)] rounded-xl p-2" value={mode} onChange={e => { setMode(e.target.value); setDraft(null); }}>
      <option value="usage">ปริมาณต่อแก้ว/ชิ้น</option>
      <option value="portions">ตัดได้กี่ชิ้นต่อ 1 หน่วย</option>
    </select>
    <input aria-label={mode === 'portions' ? 'จำนวนชิ้นต่อ 1 หน่วย' : 'ปริมาณต่อแก้ว/ชิ้น'} type="number" step="any" min="0" required
      className="w-full min-h-11 bg-[var(--bg-tertiary)] rounded-xl p-3"
      value={mode === 'portions' ? (draft?.usage === usage ? draft.text : displayPortions) : usage}
      onChange={e => {
        // เก็บข้อความที่กำลังพิมพ์แยกจากสูตร เพื่อไม่ให้การปัดเพื่อแสดงผลเปลี่ยน usage เดิม
        const nextUsage = mode === 'portions' ? usageFromPortions(e.target.value) : e.target.value;
        setDraft({ text: e.target.value, usage: nextUsage });
        onChange(nextUsage);
      }} />
    <p className="text-xs text-[var(--text-muted)]">{mode === 'portions' ? `= ${Number(usage) || 0} ${unit}/ชิ้น` : `1 ${unit} = ${displayPortions} ชิ้น`}</p>
  </div>;
});
StockUsageInput.displayName = 'StockUsageInput';
export default StockUsageInput;
