// Browsers drop a screen wake lock without warning (Safari on window blur or
// occlusion, any browser when the tab hides) and refuse a request made while
// the page isn't focused. Once lost, the display sleeps, the screensaver hides
// the page and the scene pauses — so re-request on every chance we get:
// visibility, focus, user input, and a slow retry timer as the last resort.
const RETRY_EVENTS = ['pointerdown', 'keydown'];
const RETRY_INTERVAL_MS = 15_000;

export function createWakeLockController({
  navigatorImpl = typeof navigator !== 'undefined' ? navigator : undefined,
  documentImpl = typeof document !== 'undefined' ? document : undefined,
  windowImpl = typeof window !== 'undefined' ? window : undefined,
  setIntervalImpl = (fn, ms) => setInterval(fn, ms),
  clearIntervalImpl = (id) => clearInterval(id),
} = {}) {
  let sentinel = null;
  let pending = false;
  let stopped = false;
  let retryId = null;

  async function request() {
    if (!navigatorImpl?.wakeLock || stopped || pending || sentinel !== null) return;
    pending = true;
    try {
      const acquired = await navigatorImpl.wakeLock.request('screen');
      if (stopped) {
        acquired?.release?.();
        return;
      }
      sentinel = acquired;
      acquired?.addEventListener?.('release', () => {
        if (sentinel === acquired) sentinel = null;
      });
    } catch {
      sentinel = null;
    } finally {
      pending = false;
    }
  }

  function retry() {
    if (documentImpl?.visibilityState === 'visible') request();
  }

  function start() {
    stopped = false;
    documentImpl?.addEventListener?.('visibilitychange', retry);
    windowImpl?.addEventListener?.('focus', retry);
    RETRY_EVENTS.forEach((type) => documentImpl?.addEventListener?.(type, retry));
    if (navigatorImpl?.wakeLock) retryId = setIntervalImpl(retry, RETRY_INTERVAL_MS);
    return request();
  }

  function stop() {
    stopped = true;
    documentImpl?.removeEventListener?.('visibilitychange', retry);
    windowImpl?.removeEventListener?.('focus', retry);
    RETRY_EVENTS.forEach((type) => documentImpl?.removeEventListener?.(type, retry));
    if (retryId !== null) clearIntervalImpl(retryId);
    retryId = null;
    sentinel?.release?.();
    sentinel = null;
  }

  return { start, stop };
}
