import { describe, it, expect } from 'vitest';
import { MILESTONES, unlockedMilestones, nextMilestone } from '../src/state/milestones.js';

const MIN = 60 * 1000;

describe('milestones', () => {
  it('are ordered by unlock time and have unique ids', () => {
    const minutes = MILESTONES.map((m) => m.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length);
  });

  it('unlocks nothing at the start', () => {
    expect(unlockedMilestones(0)).toEqual([]);
  });

  it('unlocks every milestone whose time has been reached', () => {
    const first = MILESTONES[0];
    const second = MILESTONES[1];
    expect(unlockedMilestones(first.minutes * MIN).map((m) => m.id)).toEqual([first.id]);
    expect(unlockedMilestones(second.minutes * MIN - 1).map((m) => m.id)).toEqual([first.id]);
  });

  it('reports the next milestone and how long until it', () => {
    const first = MILESTONES[0];
    expect(nextMilestone(0)).toEqual({ milestone: first, remainingMs: first.minutes * MIN });
  });

  it('reports no next milestone once everything is unlocked', () => {
    const last = MILESTONES[MILESTONES.length - 1];
    expect(nextMilestone(last.minutes * MIN)).toBeNull();
  });
});
