const APP_TITLE = 'Orbit';
const WAITING_TITLE = '⚠ 需要你的输入';

// Tab title for the current mode; `tick` increments once a second so the
// waiting title blinks and is noticeable from another tab.
export function tabTitleFor(mode, tick) {
  if (mode === 'waiting') return tick % 2 === 0 ? WAITING_TITLE : APP_TITLE;
  if (mode === 'idle') return `${APP_TITLE} · 空闲`;
  return APP_TITLE;
}
