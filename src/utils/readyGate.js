/**
 * Calls `onReady` once, after every key in `keys` has been marked.
 * usePosData uses it so the full-screen loader stays up until both the first
 * (tiny) collection AND `config/settings` have arrived: `pinEnabled` / `adminPin`
 * live in settings, and clearing the loader earlier let a protected view
 * (ตั้งค่าร้าน, เมนู) render for ~1-2 s before the PIN lock knew it was on.
 */
export function createReadyGate(keys, onReady) {
  const pending = new Set(keys);
  let fired = false;
  return (key) => {
    pending.delete(key);
    if (!fired && pending.size === 0) {
      fired = true;
      onReady();
    }
  };
}
