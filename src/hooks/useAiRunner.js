import { useEffect, useMemo, useState } from 'react';
import { subscribeRunnerStatus, subscribeAiActivity } from '../services/aiQueue';
import { isRunnerFresh, toMillis } from '../utils/museJobs';

/**
 * สถานะ AI (Muse บนคอมที่ร้าน) จาก heartbeat `aiRunner/status`
 * ready = เห็น heartbeat ภายใน 90 วิ · ฟังเฉพาะตอนพนักงานล็อกอิน (rules เปิดให้พนักงานเท่านั้น)
 * pending = จำนวนงานที่แอปนี้กำลังรอคำตอบ
 */
export default function useAiRunner(user) {
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!user) return undefined; // ready ผูกกับ user อยู่แล้ว · ไม่ต้องล้าง status
    return subscribeRunnerStatus(setStatus);
  }, [user]);

  // heartbeat ไม่มาใหม่ = ต้องมีนาฬิกาเดินเองถึงจะรู้ว่าเก่าแล้ว
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => subscribeAiActivity(setPending), []);

  const ready = Boolean(user) && isRunnerFresh(status, now);
  const lastSeen = toMillis(status?.lastSeen);
  const busy = Boolean(status?.busy);
  return useMemo(() => ({ ready, lastSeen, busy, pending }), [ready, lastSeen, busy, pending]);
}
