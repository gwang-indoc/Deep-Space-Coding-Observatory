import { describe, it, expect } from 'vitest';
import { PLANET_UNLOCKS, unlockedPlanetCount } from '../src/state/planets.js';

const MIN = 60 * 1000;

describe('planet unlocks', () => {
  it('lists the nine bodies in unlock order, starting with one already there', () => {
    expect(PLANET_UNLOCKS).toHaveLength(9);
    const minutes = PLANET_UNLOCKS.map((p) => p.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(minutes[0]).toBe(0);
    expect(new Set(PLANET_UNLOCKS.map((p) => p.kind)).size).toBe(9);
  });

  it('unlocks outward from the sun, in the order the tracks are laid out', () => {
    expect(PLANET_UNLOCKS.map((p) => p.kind)).toEqual([
      'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
    ]);
  });

  it('brings the Moon in together with Earth', () => {
    const at = (kind) => PLANET_UNLOCKS.find((p) => p.kind === kind).minutes;
    expect(at('moon')).toBe(at('earth'));
  });

  it('shows the first planet from the very start', () => {
    expect(unlockedPlanetCount(0)).toBe(1);
  });

  it('lights a planet exactly when its time is reached', () => {
    const second = PLANET_UNLOCKS[1];
    expect(unlockedPlanetCount(second.minutes * MIN - 1)).toBe(1);
    expect(unlockedPlanetCount(second.minutes * MIN)).toBe(2);
  });

  it('lights all nine once the last threshold passes', () => {
    const last = PLANET_UNLOCKS[PLANET_UNLOCKS.length - 1];
    expect(unlockedPlanetCount(last.minutes * MIN)).toBe(9);
    expect(unlockedPlanetCount(last.minutes * MIN * 10)).toBe(9);
  });
});
