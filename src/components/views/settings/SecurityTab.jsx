import { Lock } from 'lucide-react';
import { Button, Input } from '../../ui';
import { SaveBar, Section, Toggle } from './controls';

/** "ความปลอดภัย" · PIN on/off (immediate), change PIN (saved with settings), forget this device. */
export default function SecurityTab({ pinEnabled, onTogglePin, draft, patch, dirty, onSave, onLockDevice }) {
  return (
    <div className="flex flex-col gap-5">
      <Section title="ล็อกด้วย PIN" description="เปลี่ยนแล้วมีผลทันที ไม่ต้องกดบันทึก">
        <Toggle
          label="ถาม PIN ก่อนเข้าหน้าเจ้าของร้าน"
          description={pinEnabled ? 'เปิดอยู่ · หน้าตั้งค่าและเมนูต้องใส่ PIN' : 'ปิดอยู่ · ใครก็เข้าหน้าตั้งค่าได้'}
          checked={pinEnabled}
          onChange={onTogglePin}
        />
      </Section>

      <Section title="เปลี่ยน PIN" description='เปลี่ยน PIN แล้วทุกเครื่องที่ "จำไว้" จะถูกล็อกอัตโนมัติ'>
        <Input
          label="PIN แอดมิน"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={draft.adminPin}
          onChange={(e) => patch({ adminPin: e.target.value })}
          placeholder="เช่น 1234"
          className="sm:max-w-xs"
          inputClassName="num"
        />
        <SaveBar inline dirty={dirty} onSave={onSave} />
      </Section>

      {onLockDevice && (
        <Section title="เครื่องนี้" description="ใช้เมื่ออยากให้เครื่องนี้ถาม PIN ใหม่">
          <Button variant="secondary" leftIcon={<Lock size={18} />} onClick={onLockDevice}>ล็อกและลืมอุปกรณ์นี้</Button>
        </Section>
      )}
    </div>
  );
}
