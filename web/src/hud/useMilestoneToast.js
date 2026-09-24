import { useEffect, useRef, useState } from 'react';

const TOAST_MS = 5000;
// Unlocks seen this soon after load come from the snapshot (already earned
// earlier), so they become the baseline instead of being announced.
const SETTLE_MS = 3000;

export function useMilestoneToast(unlocked) {
  const [toast, setToast] = useState(null);
  const seen = useRef(null);
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    const ids = unlocked.map((m) => m.id);
    if (seen.current === null || Date.now() - mountedAt.current < SETTLE_MS) {
      seen.current = new Set(ids);
      return undefined;
    }
    const fresh = unlocked.filter((m) => !seen.current.has(m.id));
    if (fresh.length === 0) return undefined;
    fresh.forEach((m) => seen.current.add(m.id));
    setToast(fresh[fresh.length - 1]);
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [unlocked]);

  return toast;
}
