// The solar system lights up one planet at a time as Claude keeps working this
// session; once lit a planet stays. The first is there from the start so a
// subagent always has a planet to boost.
export const PLANET_UNLOCKS = [
  { kind: 'earth', minutes: 0 },
  { kind: 'mars', minutes: 2 },
  { kind: 'venus', minutes: 4 },
  { kind: 'jupiter', minutes: 6 },
  { kind: 'saturn', minutes: 9 },
  { kind: 'uranus', minutes: 12 },
  { kind: 'neptune', minutes: 16 },
  { kind: 'moon', minutes: 20 },
];

const MINUTE_MS = 60 * 1000;

export function unlockedPlanetCount(activeMs) {
  return PLANET_UNLOCKS.filter((p) => activeMs >= p.minutes * MINUTE_MS).length;
}

// FNV-1a: a cheap, stable string hash so a subagent's pick survives reloads.
function hash(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Each running subagent boosts a random-looking lit planet, chosen from its id.
// Concurrent subagents take different planets until every lit one is taken.
export function boostedPlanets(agentIds, count) {
  const boosted = new Set();
  if (count <= 0) return boosted;
  for (const id of agentIds) {
    const start = hash(String(id)) % count;
    let index = start;
    for (let step = 0; step < count && boosted.has(index); step += 1) {
      index = (start + step + 1) % count;
    }
    boosted.add(index);
  }
  return boosted;
}
