import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * แจ้งเตือนในแอปเมื่อมีออเดอร์จาก QR เข้ามาใหม่
 *
 * ทำไมต้องมีทั้งที่มีแจ้งเตือนเข้าไลน์อยู่แล้ว: แพ็กฟรีของ LINE ให้ 300 ข้อความ/เดือน
 * และ push เข้ากลุ่มนับตามจำนวนคนในกลุ่ม (วัดแล้ว กลุ่ม 3 คน = 3 ครั้งต่อออเดอร์)
 * ราว 100 ออเดอร์ก็เต็มเดือน · ตัวนี้เตือนในเครื่องล้วน ไม่กินโควตาอะไรเลย
 *
 * ตรรกะ: จำ id ของออเดอร์ QR ที่มีอยู่ตอน mount ไว้เป็นฐาน แล้วอะไรที่โผล่หลังจากนั้น
 * ถึงจะนับว่า "ใหม่" ไม่งั้นเปิดหน้าจอทีไรจะกรี๊ดใส่ออเดอร์เก่าทั้งกอง
 *
 * เสียง: สังเคราะห์ด้วย Web Audio ไม่ต้องมีไฟล์เสียงในโปรเจกต์ · เบราว์เซอร์ห้ามเล่นเสียง
 * ก่อนผู้ใช้แตะหน้าจอ เลยต้องมีปุ่มให้กดเปิดหนึ่งครั้ง (ดู `enableSound`)
 */

const SOUND_PREF_KEY = 'siwara_order_sound';

function playChime(ctx) {
  // โน้ต 3 ตัวไล่ขึ้น ดังพอได้ยินข้ามเสียงเครื่องชง แต่ไม่แสบหูตอนอยู่ใกล้จอ
  const now = ctx.currentTime;
  [880, 1108.73, 1318.51].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.16;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.45);
  });
}

export default function useNewQrOrderAlert(orders) {
  const [alerts, setAlerts] = useState([]);
  const [soundOn, setSoundOn] = useState(false);
  const seenRef = useRef(null);
  const ctxRef = useRef(null);
  const soundOnRef = useRef(false);

  // เก็บใน ref ด้วย เพราะ effect ด้านล่างอ่านค่าตอนมีออเดอร์เข้า ไม่อยากให้ผูก dependency
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const enableSound = useCallback(async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctxRef.current = ctxRef.current || new Ctx();
      // ต้อง resume ภายใต้ user gesture ไม่งั้น iOS ค้างอยู่สถานะ suspended
      await ctxRef.current.resume();
      playChime(ctxRef.current); // เล่นให้ฟังทันที = ยืนยันว่าดังจริงและดังแค่ไหน
      setSoundOn(true);
      try { localStorage.setItem(SOUND_PREF_KEY, '1'); } catch { /* private mode */ }
    } catch { /* ไม่มีเสียงก็ยังมีป้ายเตือนบนจอ */ }
  }, []);

  const disableSound = useCallback(() => {
    setSoundOn(false);
    try { localStorage.setItem(SOUND_PREF_KEY, '0'); } catch { /* private mode */ }
  }, []);

  const dismiss = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dismissAll = useCallback(() => setAlerts([]), []);

  useEffect(() => {
    const qrOrders = (orders || []).filter((o) => o.source === 'qr');

    // รอบแรก: ตั้งฐานเฉยๆ ไม่เตือน
    if (seenRef.current === null) {
      seenRef.current = new Set(qrOrders.map((o) => o.id));
      return;
    }

    const fresh = qrOrders.filter((o) => !seenRef.current.has(o.id) && o.status === 'pending');
    if (!fresh.length) {
      // ยังต้องจำ id ที่เห็นแล้วเสมอ ไม่งั้นออเดอร์ที่ถูกกดรับไปแล้วจะกลับมาเตือนซ้ำ
      qrOrders.forEach((o) => seenRef.current.add(o.id));
      return;
    }

    fresh.forEach((o) => seenRef.current.add(o.id));
    qrOrders.forEach((o) => seenRef.current.add(o.id));
    setAlerts((prev) => [...prev, ...fresh]);

    if (soundOnRef.current && ctxRef.current) {
      try { playChime(ctxRef.current); } catch { /* ไม่เป็นไร ป้ายยังขึ้น */ }
    }
  }, [orders]);

  // จงใจไม่ auto-enable จากค่าที่จำไว้: เบราว์เซอร์ต้องการ user gesture ทุกครั้งที่โหลดหน้าใหม่
  // ปลุก AudioContext เองไม่ได้ · ค่าใน localStorage มีไว้ให้รู้ว่าร้านนี้ใช้เสียงอยู่เท่านั้น
  return { alerts, dismiss, dismissAll, soundOn, enableSound, disableSound };
}
