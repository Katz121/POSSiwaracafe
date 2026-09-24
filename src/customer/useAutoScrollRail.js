import { useEffect, useRef } from 'react';

/**
 * แถบเมนูขายดีเลื่อนเองช้าๆ · **หยุดถาวรทันทีที่ลูกค้าแตะ/ปัด/เลื่อนเมาส์/โฟกัส**
 * (การ์ดที่ขยับอยู่ตอนนิ้วลงทำให้กดผิดตัว จึงไม่วิ่งต่อหลังลูกค้าเริ่มใช้เอง)
 *
 * เลื่อนด้วย scrollLeft ไม่ใช่ CSS marquee → ปัดเองได้ตามปกติ ไม่มีการ์ดซ้ำ
 * ถึงท้ายแถวพัก 1.5 วิ แล้วกลับต้นแถว · หยุดตอนแถบไม่อยู่บนจอ/แท็บถูกซ่อน
 * ผู้ใช้ที่ตั้งลดการเคลื่อนไหว (prefers-reduced-motion) ไม่วิ่งเลย
 * ระหว่างวิ่งปิด scroll-snap ที่ตัว element (ไม่งั้นเบราว์เซอร์ดูดกลับทุกเฟรม) แล้วคืนตอนหยุด
 *
 * @returns ref ที่ต้องผูกกับกล่องที่เลื่อนแนวนอน
 */
export default function useAutoScrollRail(enabled, speedPxPerSec = 28) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof window === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (el.scrollWidth <= el.clientWidth + 8) return undefined;

    let stopped = false;
    let visible = true;
    let raf = 0;
    let last = 0;
    let pauseUntil = 0;
    let pos = el.scrollLeft;
    el.style.scrollSnapType = 'none';

    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      el.style.scrollSnapType = '';
    };
    const tick = (now) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(now - last, 100) : 0;
      last = now;
      if (!visible || document.hidden || now < pauseUntil) return;
      const max = el.scrollWidth - el.clientWidth;
      if (pos >= max - 1) {
        pos = 0;
        el.scrollTo({ left: 0, behavior: 'smooth' });
        pauseUntil = now + 1500;
        return;
      }
      pos = Math.min(max, pos + (speedPxPerSec * dt) / 1000);
      el.scrollLeft = pos;
    };

    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.2 })
      : null;
    io?.observe(el);
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin'];
    events.forEach((ev) => el.addEventListener(ev, stop, { passive: true }));
    pauseUntil = performance.now() + 1200; // ให้เห็นแถวนิ่งๆ ก่อนเริ่มวิ่ง
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      io?.disconnect();
      events.forEach((ev) => el.removeEventListener(ev, stop));
      el.style.scrollSnapType = '';
    };
  }, [enabled, speedPxPerSec]);

  return ref;
}
