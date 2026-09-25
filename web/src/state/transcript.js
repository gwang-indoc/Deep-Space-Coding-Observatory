// The terminal panel's backlog. Kept out of the orbit reducer so transcript
// traffic never touches mode, active time or the animation queue.
export const TRANSCRIPT_LIMIT = 300;

export function appendTranscript(entries, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return entries;
  const next = entries.concat(incoming);
  return next.length > TRANSCRIPT_LIMIT ? next.slice(-TRANSCRIPT_LIMIT) : next;
}

export function transcriptFromSnapshot(payload) {
  return Array.isArray(payload?.transcript) ? payload.transcript.slice(-TRANSCRIPT_LIMIT) : [];
}
