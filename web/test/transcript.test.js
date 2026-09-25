import { describe, it, expect } from 'vitest';
import { TRANSCRIPT_LIMIT, appendTranscript, groupToolResults, transcriptFromSnapshot } from '../src/state/transcript.js';

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

describe('groupToolResults', () => {
  it('moves each result directly under its own call when calls run in parallel', () => {
    const entries = [
      { id: '1', kind: 'tool', toolUseId: 'a', name: 'Edit', summary: 'x.js' },
      { id: '2', kind: 'tool', toolUseId: 'b', name: 'Bash', summary: 'npm test' },
      { id: '3', kind: 'diff', toolUseId: 'a', file: 'x.js', rows: [], more: 0 },
      { id: '4', kind: 'output', toolUseId: 'b', lines: ['ok'], more: 0, isError: false },
      { id: '5', kind: 'text', text: 'done' },
    ];
    expect(groupToolResults(entries).map((e) => e.id)).toEqual(['1', '3', '2', '4', '5']);
  });

  it('leaves a result whose call is not in the list where it is', () => {
    const entries = [
      { id: '1', kind: 'output', toolUseId: 'gone', lines: ['x'], more: 0, isError: false },
      { id: '2', kind: 'tool', toolUseId: 'c', name: 'Bash', summary: 'ls' },
    ];
    expect(groupToolResults(entries).map((e) => e.id)).toEqual(['1', '2']);
  });
});
