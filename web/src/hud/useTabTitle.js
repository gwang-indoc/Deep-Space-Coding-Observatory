import { useEffect } from 'react';
import { tabTitleFor } from './modeAlerts.js';

// Keeps the tab title in sync with the mode; while waiting it blinks so it is
// noticeable from another tab.
export function useTabTitle(mode) {
  useEffect(() => {
    let tick = 0;
    document.title = tabTitleFor(mode, tick);
    if (mode !== 'waiting') return undefined;
    const id = setInterval(() => {
      tick += 1;
      document.title = tabTitleFor(mode, tick);
    }, 1000);
    return () => clearInterval(id);
  }, [mode]);
}
