import { describe, it, expect } from 'vitest';
import { PLANET_UNLOCKS, unlockedPlanetCount, boostedPlanets } from '../src/state/planets.js';

const MIN = 60 * 1000;

describe('planet unlocks', () => {
  it('lists the eight planets in unlock order, starting with one already there', () => {
    expect(PLANET_UNLOCKS).toHaveLength(8);
    const minutes = PLANET_UNLOCKS.map((p) => p.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(minutes[0]).toBe(0);
    expect(new Set(PLANET_UNLOCKS.map((p) => p.kind)).size).toBe(8);
  });

  it('shows the first planet from the very start', () => {
    expect(unlockedPlanetCount(0)).toBe(1);
  });

  it('lights a planet exactly when its time is reached', () => {
    const second = PLANET_UNLOCKS[1];
    expect(unlockedPlanetCount(second.minutes * MIN - 1)).toBe(1);
    expect(unlockedPlanetCount(second.minutes * MIN)).toBe(2);
  });

  it('lights all eight once the last threshold passes', () => {
    const last = PLANET_UNLOCKS[PLANET_UNLOCKS.length - 1];
    expect(unlockedPlanetCount(last.minutes * MIN)).toBe(8);
    expect(unlockedPlanetCount(last.minutes * MIN * 10)).toBe(8);
  });
});

describe('boostedPlanets', () => {
  it('boosts nothing when no subagent runs', () => {
    expect(boostedPlanets([], 8)).toEqual(new Set());
  });

  it('boosts the only planet when just one is lit', () => {
    expect(boostedPlanets(['toolu_abc'], 1)).toEqual(new Set([0]));
  });

  it('picks the same planet for the same subagent every time', () => {
    const first = boostedPlanets(['toolu_abc'], 8);
    expect(first.size).toBe(1);
    expect(boostedPlanets(['toolu_abc'], 8)).toEqual(first);
    const [index] = first;
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(8);
  });

  it('spreads subagents over different planets', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `toolu_${i}`);
    const picks = new Set(ids.map((id) => [...boostedPlanets([id], 8)][0]));
    expect(picks.size).toBeGreaterThan(3);
  });

  it('gives concurrent subagents different planets while any are free', () => {
    expect(boostedPlanets(['a', 'b', 'c'], 3)).toEqual(new Set([0, 1, 2]));
  });

  it('lets subagents share once every lit planet is boosted', () => {
    expect(boostedPlanets(['a', 'b', 'c'], 2)).toEqual(new Set([0, 1]));
  });
});
