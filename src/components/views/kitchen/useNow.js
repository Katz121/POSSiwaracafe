import { useEffect, useState } from 'react';

/** Current time, refreshed every `intervalMs` (default 30 s) for ticket ages. */
export default function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
