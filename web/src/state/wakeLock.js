export function createWakeLockController({
  navigatorImpl = typeof navigator !== 'undefined' ? navigator : undefined,
  documentImpl = typeof document !== 'undefined' ? document : undefined,
} = {}) {
  let sentinel = null;

  async function request() {
    if (!navigatorImpl?.wakeLock) return;
    try {
      sentinel = await navigatorImpl.wakeLock.request('screen');
      sentinel?.addEventListener?.('release', () => {
        sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  }

  function handleVisibilityChange() {
    if (documentImpl?.visibilityState === 'visible' && sentinel === null) {
      request();
    }
  }

  function start() {
    documentImpl?.addEventListener?.('visibilitychange', handleVisibilityChange);
    return request();
  }

  function stop() {
    documentImpl?.removeEventListener?.('visibilitychange', handleVisibilityChange);
    sentinel?.release?.();
    sentinel = null;
  }

  return { start, stop };
}
