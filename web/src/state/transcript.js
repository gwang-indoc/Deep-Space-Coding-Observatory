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

const RESULT_KINDS = new Set(['output', 'diff']);

// Parallel tool calls are written as consecutive calls followed by their
// results, so in file order every result would sit under the last call. Like
// the Claude Code TUI, show each result directly under its own call.
export function groupToolResults(entries) {
  const toolIds = new Set(entries.filter((e) => e.kind === 'tool' && e.toolUseId).map((e) => e.toolUseId));
  const isAttached = (e) => RESULT_KINDS.has(e.kind) && toolIds.has(e.toolUseId);
  const results = new Map();
  for (const e of entries) {
    if (isAttached(e)) results.set(e.toolUseId, [...(results.get(e.toolUseId) ?? []), e]);
  }
  const ordered = [];
  for (const e of entries) {
    if (isAttached(e)) continue;
    ordered.push(e);
    if (e.kind === 'tool') ordered.push(...(results.get(e.toolUseId) ?? []));
  }
  return ordered;
}
