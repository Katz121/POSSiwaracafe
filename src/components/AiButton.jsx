import { useConfigContext } from '../context/AppContext';
import { Button } from './ui';
import { AI_OFFLINE_HINT } from '../utils/museJobs';

/**
 * ปุ่ม AI · ใช้ได้เฉพาะตอนคอมที่ร้าน (muse-bridge) ออนไลน์
 * ออฟไลน์ = ปุ่มถูกปิดพร้อมบอกวิธีแก้ใต้ปุ่ม (ไม่ใช่กดแล้วเงียบ)
 */
export default function AiButton({ disabled, hintClassName = '', block = false, ...props }) {
  const { aiReady } = useConfigContext();
  const button = (
    <Button
      variant="ai"
      disabled={disabled || !aiReady}
      title={aiReady ? undefined : AI_OFFLINE_HINT}
      data-ai-offline={aiReady ? undefined : '1'}
      {...props}
    />
  );
  if (aiReady) return button;
  return (
    <span className={`${block ? 'flex w-full' : 'inline-flex'} flex-col items-start gap-1`}>
      {button}
      <span data-ai-offline-hint className={`text-xs leading-[var(--lh-xs)] text-[var(--text-muted)] ${hintClassName}`}>{AI_OFFLINE_HINT}</span>
    </span>
  );
}
