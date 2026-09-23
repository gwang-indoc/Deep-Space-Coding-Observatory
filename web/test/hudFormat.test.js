import { describe, it, expect } from 'vitest';
import { contextTone, formatResetCountdown } from '../src/hud/hudFormat.js';

describe('contextTone', () => {
  it('is cool below 80%', () => {
    expect(contextTone(79)).toBe('cool');
  });
  it('is warm at 80% and above, below 100%', () => {
    expect(contextTone(80)).toBe('warm');
    expect(contextTone(99)).toBe('warm');
  });
  it('is critical at 100% or above', () => {
    expect(contextTone(100)).toBe('critical');
  });
});

describe('formatResetCountdown', () => {
  it('returns null when there is no reset timestamp', () => {
    expect(formatResetCountdown(null, 0)).toBeNull();
  });

  it('returns "resetting" once the reset time has passed', () => {
    expect(formatResetCountdown(1000, 1000 * 1000 + 1)).toBe('resetting');
  });

  it('formats minutes only when under an hour remains', () => {
    const resetsAt = 1000; // seconds
    const nowMs = resetsAt * 1000 - 45 * 60 * 1000; // 45 minutes before
    expect(formatResetCountdown(resetsAt, nowMs)).toBe('45m');
  });

  it('formats hours and minutes when over an hour remains', () => {
    const resetsAt = 100000; // seconds
    const nowMs = resetsAt * 1000 - (2 * 60 + 15) * 60 * 1000; // 2h15m before
    expect(formatResetCountdown(resetsAt, nowMs)).toBe('2h 15m');
  });

  it('formats days and hours once a day or more remains', () => {
    const resetsAt = 1000000; // seconds
    const nowMs = resetsAt * 1000 - ((3 * 24 + 11) * 60 + 19) * 60 * 1000; // 3d 11h 19m before
    expect(formatResetCountdown(resetsAt, nowMs)).toBe('3d 11h');
  });

  it('formats exactly one day as days and hours', () => {
    const resetsAt = 1000000; // seconds
    const nowMs = resetsAt * 1000 - 24 * 60 * 60 * 1000;
    expect(formatResetCountdown(resetsAt, nowMs)).toBe('1d 0h');
  });
});
