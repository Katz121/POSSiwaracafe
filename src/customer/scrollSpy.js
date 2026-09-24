// Scroll-spy for the customer QR menu: every category is its own section on
// one long page; the sticky chip bar highlights the section under it and a
// chip tap scrolls to that section.
import { useCallback, useEffect, useRef, useState } from 'react';

export const sectionDomId = (key) => `menu-sec-${key}`;

export const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * keys       ordered section keys (DOM ids come from sectionDomId)
 * getOffset  () => px covered by sticky chrome at the top of the viewport
 * enabled    false while search results replace the sections
 */
export function useScrollSpy(keys, getOffset, enabled = true) {
  const keysKey = keys.join('\u0001');
  const [active, setActive] = useState(keys[0] ?? null);
  const lockUntilRef = useRef(0);
  const offsetRef = useRef(getOffset);
  useEffect(() => { offsetRef.current = getOffset; }, [getOffset]);

  useEffect(() => {
    if (!enabled || !keysKey) return undefined;
    const list = keysKey.split('\u0001');
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (Date.now() < lockUntilRef.current) return;
      // A section counts as "being read" once its heading is in the top quarter
      // under the sticky bar (not only when it touches the bar).
      const line = offsetRef.current() + Math.min(160, window.innerHeight * 0.25);
      let current = list[0];
      for (const key of list) {
        const el = document.getElementById(sectionDomId(key));
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = key;
        else break;
      }
      // Short last sections can never reach the top line; at the very bottom
      // of the page the last section is the one being read.
      const doc = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 4) current = list[list.length - 1];
      setActive(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [keysKey, enabled]);

  const jumpTo = useCallback((key) => {
    const el = document.getElementById(sectionDomId(key));
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - offsetRef.current();
    const smooth = !prefersReducedMotion();
    // Hold the highlight on the tapped chip while the smooth scroll passes
    // over the sections in between.
    lockUntilRef.current = Date.now() + (smooth ? 900 : 0);
    setActive(key);
    window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  return { active: keys.includes(active) ? active : (keys[0] ?? null), jumpTo };
}

