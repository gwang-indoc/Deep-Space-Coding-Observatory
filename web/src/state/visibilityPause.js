export function createVisibilityPauseController({
  documentImpl = typeof document !== 'undefined' ? document : undefined,
  onPause,
  onResume,
} = {}) {
  function handleChange() {
    if (documentImpl?.hidden) {
      onPause?.();
    } else {
      onResume?.();
    }
  }

  function start() {
    documentImpl?.addEventListener?.('visibilitychange', handleChange);
  }

  function stop() {
    documentImpl?.removeEventListener?.('visibilitychange', handleChange);
  }

  return { start, stop };
}
