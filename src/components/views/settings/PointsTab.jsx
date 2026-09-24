import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { Banner, Button, Input } from '../../ui';
import { SaveBar, Section, Toggle } from './controls';

/** "แต้มสมาชิก" · redeem threshold/value, expiry, reward items. */
export default function PointsTab({ draft, patch, dirty, onSave }) {
  const rewards = draft.pointsRewards || [];
  // Immutable edits (the old code mutated the objects shared with context).
  const setReward = (idx, change) => patch({ pointsRewards: rewards.map((r, i) => (i === idx ? { ...r, ...change } : r)) });
  const removeReward = (idx) => patch({ pointsRewards: rewards.filter((_, i) => i !== idx) });
  const addReward = () => patch({ pointsRewards: [...rewards, { id: crypto.randomUUID(), name: '', cost: 10, enabled: true }] });
  const expiring = Number(draft.pointsExpiryMonths || 0) > 0;

  return (
    <div className="flex flex-col gap-5">
      <Section title="แลกแต้มเป็นส่วนลด" description="฿10 = 1 แต้ม · ครบเกณฑ์แล้วลูกค้าแลกเป็นส่วนลดเงินสดได้">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="แต้มขั้นต่ำที่แลกได้" type="number" inputMode="numeric" suffix="แต้ม" inputClassName="num"
            value={draft.redeemPointsThreshold} onChange={(e) => patch({ redeemPointsThreshold: e.target.value })} />
          <Input label="ส่วนลดเมื่อแลก" type="number" inputMode="decimal" suffix="บาท" inputClassName="num"
            value={draft.redeemDiscountValue} onChange={(e) => patch({ redeemDiscountValue: e.target.value })} />
        </div>
      </Section>

      <Section title="แต้มหมดอายุ" description="แต้มหมดอายุถ้าลูกค้าไม่มาซื้อตามจำนวนเดือนนี้ · 0 = ไม่หมดอายุ">
        <div className="flex flex-col gap-3">
          <Input label="ไม่มาซื้อนานเกิน" type="number" inputMode="numeric" suffix="เดือน" inputClassName="num" className="sm:max-w-xs"
            value={draft.pointsExpiryMonths} onChange={(e) => patch({ pointsExpiryMonths: e.target.value })} />
          {expiring && <Banner tone="warn" compact title="ควรประกาศให้ลูกค้ารู้ก่อนเปิดใช้" />}
        </div>
      </Section>

      <Section title="ของแลกแต้ม (เมนูลับ / ท็อปปิ้ง)" description="ลูกค้าจะเห็นของเหล่านี้ให้แลกด้วยแต้ม แทนส่วนลดเงินสด">
        <div className="flex flex-col gap-3">
          <Toggle
            label="เปิดใช้งานของแลกแต้ม"
            checked={draft.pointsRewardsEnabled}
            onChange={(v) => patch({ pointsRewardsEnabled: v })}
          />
          {draft.pointsRewardsEnabled && (
            <>
              <ul className="flex flex-col gap-2">
                {rewards.map((reward, idx) => (
                  <li key={reward.id || idx} className="flex flex-wrap sm:flex-nowrap items-end gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] p-3">
                    <Input
                      label="ชื่อของแลก"
                      value={reward.name}
                      onChange={(e) => setReward(idx, { name: e.target.value })}
                      placeholder="เช่น วิปครีม"
                      className="flex-1 min-w-[10rem]"
                    />
                    <Input
                      label="ใช้แต้ม"
                      type="number"
                      inputMode="numeric"
                      value={reward.cost}
                      onChange={(e) => setReward(idx, { cost: e.target.value })}
                      inputClassName="num"
                      className="w-28"
                      fullWidth={false}
                    />
                    <span className="flex gap-1">
                      <button
                        type="button"
                        aria-pressed={!!reward.enabled}
                        aria-label={reward.enabled ? `ซ่อน ${reward.name || 'ของแลก'} จากลูกค้า` : `แสดง ${reward.name || 'ของแลก'} ให้ลูกค้า`}
                        onClick={() => setReward(idx, { enabled: !reward.enabled })}
                        className={`w-12 h-12 inline-flex items-center justify-center rounded-[var(--radius-sm)] outline-none focus-visible:shadow-[var(--focus-ring)] ${reward.enabled ? 'bg-[var(--accent-soft)] text-[var(--accent-soft-fg)]' : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-strong)]'}`}
                      >
                        {reward.enabled ? <Eye size={18} /> : <EyeOff size={18} />}
                      </button>
                      <button
                        type="button"
                        aria-label={`ลบ ${reward.name || 'ของแลก'}`}
                        onClick={() => removeReward(idx)}
                        className="w-12 h-12 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--state-danger)] hover:bg-[var(--state-danger-soft)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                      >
                        <Trash2 size={18} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" leftIcon={<Plus size={18} />} onClick={addReward} className="self-start">เพิ่มของแลกแต้ม</Button>
            </>
          )}
        </div>
      </Section>

      <SaveBar dirty={dirty} onSave={onSave} />
    </div>
  );
}
