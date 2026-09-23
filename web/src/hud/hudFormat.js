const WARN_THRESHOLD = 80;

export function contextTone(pct) {
  if (pct >= 100) return 'critical';
  if (pct >= WARN_THRESHOLD) return 'warm';
  return 'cool';
}

export function formatResetCountdown(resetsAtEpochSeconds, nowMs) {
  if (resetsAtEpochSeconds == null) return null;
  const remainingMs = resetsAtEpochSeconds * 1000 - nowMs;
  if (remainingMs <= 0) return 'resetting';
  const totalMinutes = Math.round(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
