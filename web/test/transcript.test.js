import { describe, it, expect } from 'vitest';
import { TRANSCRIPT_LIMIT, appendTranscript, transcriptFromSnapshot } from '../src/state/transcript.js';

const entry = (i) => ({ id: `e${i}`, kind: 'text', text: `t${i}` });

describe('transcript state', () => {
  it('reads the snapshot transcript, or nothing from an older server', () => {
    expect(transcriptFromSnapshot({ transcript: [entry(1)] })).toEqual([entry(1)]);
    expect(transcriptFromSnapshot({ todos: [] })).toEqual([]);
    expect(transcriptFromSnapshot(undefined)).toEqual([]);
  });

  it('appends entries in order', () => {
    expect(appendTranscript([entry(1)], [entry(2), entry(3)])).toEqual([entry(1), entry(2), entry(3)]);
  });

  it('keeps only the newest TRANSCRIPT_LIMIT entries', () => {
    const existing = Array.from({ length: TRANSCRIPT_LIMIT }, (_, i) => entry(i));
    const next = appendTranscript(existing, [entry('new')]);
    expect(next).toHaveLength(TRANSCRIPT_LIMIT);
    expect(next[0]).toEqual(entry(1));
    expect(next[TRANSCRIPT_LIMIT - 1]).toEqual(entry('new'));
  });

  it('returns the same array when there is nothing to add', () => {
    const existing = [entry(1)];
    expect(appendTranscript(existing, [])).toBe(existing);
    expect(appendTranscript(existing, undefined)).toBe(existing);
  });
});
