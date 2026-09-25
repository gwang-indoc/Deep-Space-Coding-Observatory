// The solar system lights up one planet at a time as Claude keeps working this
// session; once lit a planet stays. The first is there from the start. Planets
// unlock outward from the sun, in the same order as their tracks, so the
// system fills in from the inside out.
export const PLANET_UNLOCKS = [
  { kind: 'mercury', minutes: 0 },
  { kind: 'venus', minutes: 2 },
  { kind: 'earth', minutes: 4 },
  { kind: 'moon', minutes: 6 },
  { kind: 'mars', minutes: 9 },
  { kind: 'jupiter', minutes: 12 },
  { kind: 'saturn', minutes: 16 },
  { kind: 'uranus', minutes: 20 },
  { kind: 'neptune', minutes: 25 },
];

const MINUTE_MS = 60 * 1000;

export function unlockedPlanetCount(activeMs) {
  return PLANET_UNLOCKS.filter((p) => activeMs >= p.minutes * MINUTE_MS).length;
}
