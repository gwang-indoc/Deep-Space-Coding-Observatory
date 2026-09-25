import { describe, it, expect } from 'vitest';
import { MILESTONES } from '../src/state/milestones.js';
import { WONDER_IDS } from '../src/scene/wonders/Wonders.jsx';

describe('wonders', () => {
  it('draws a body for every milestone', () => {
    expect(MILESTONES.map((m) => m.id).filter((id) => !WONDER_IDS.includes(id))).toEqual([]);
  });

  it('keeps unlocking scenery through a four-hour session', () => {
    expect(MILESTONES.slice(-3).map((m) => [m.id, m.minutes])).toEqual([
      ['milkyway', 150],
      ['planetary', 180],
      ['collision', 240],
    ]);
  });
});
