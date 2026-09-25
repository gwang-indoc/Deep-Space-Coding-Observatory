// The solar system lights up one planet at a time as Claude keeps working this
// session; once lit a planet stays. The first is there from the start. Unlock order is independent of where
// a body orbits: the tracks follow the real order from the sun.
export const PLANET_UNLOCKS = [
  { kind: 'earth', minutes: 0 },
  { kind: 'mars', minutes: 2 },
  { kind: 'venus', minutes: 4 },
  { kind: 'jupiter', minutes: 6 },
  { kind: 'saturn', minutes: 9 },
  { kind: 'uranus', minutes: 12 },
  { kind: 'neptune', minutes: 16 },
  { kind: 'moon', minutes: 20 },
  { kind: 'mercury', minutes: 25 },
];

const MINUTE_MS = 60 * 1000;

export function unlockedPlanetCount(activeMs) {
  return PLANET_UNLOCKS.filter((p) => activeMs >= p.minutes * MINUTE_MS).length;
}
