import { describe, it, expect } from 'vitest';
import { tabTitleFor } from '../src/hud/modeAlerts.js';

describe('tabTitleFor', () => {
  it('is the plain app name while active', () => {
    expect(tabTitleFor('active', 0)).toBe('Orbit');
    expect(tabTitleFor('active', 1)).toBe('Orbit');
  });

  it('marks the tab as idle', () => {
    expect(tabTitleFor('idle', 0)).toBe('Orbit · 空闲');
  });

  it('alternates between an alert and the app name while waiting', () => {
    expect(tabTitleFor('waiting', 0)).toBe('⚠ 需要你的输入');
    expect(tabTitleFor('waiting', 1)).toBe('Orbit');
    expect(tabTitleFor('waiting', 2)).toBe('⚠ 需要你的输入');
  });
});
