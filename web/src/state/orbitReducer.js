const MAX_SATELLITES = 12;
export const SHIP_TTL_MS = 2200;
export const RADAR_TTL_MS = 900;
const NEBULA_DELAY_MS = 3000;
const COMPLETE_FLASH_MS = 2500;

function pruneExpired(list, ttlMs, nowMs) {
  const kept = list.filter((item) => nowMs - item.startedAt < ttlMs);
  return kept.length === list.length ? list : kept;
}

export function createInitialOrbitState() {
  return {
    missionActive: false,
    todos: [],
    satellites: [],
    ships: [],
    radarPings: [],
    testResultRing: null,
    waitingSince: null,
    lastCompletedAt: null,
  };
}

function upsertSatellite(satellites, file, ts) {
  const existingIndex = satellites.findIndex((s) => s.file === file);
  if (existingIndex === -1) {
    const next = [...satellites, { file, enteredAt: ts, lastSeenAt: ts, blinkCount: 0 }];
    if (next.length > MAX_SATELLITES) {
      next.sort((a, b) => a.enteredAt - b.enteredAt);
      next.shift();
    }
    return next;
  }
  const next = satellites.slice();
  const existing = next[existingIndex];
  next[existingIndex] = { ...existing, lastSeenAt: ts, blinkCount: existing.blinkCount + 1 };
  return next;
}

export function applySnapshot(state, payload) {
  return {
    ...state,
    todos: payload?.todos ?? [],
    missionActive: Boolean(payload?.missionActive),
  };
}

export function applyOrbitEvent(state, event) {
  const ships = pruneExpired(state.ships, SHIP_TTL_MS, event.ts);
  const radarPings = pruneExpired(state.radarPings, RADAR_TTL_MS, event.ts);
  const baseState = ships === state.ships && radarPings === state.radarPings ? state : { ...state, ships, radarPings };
  const waitingSince = event.type === 'waiting' ? (baseState.waitingSince ?? event.ts) : null;

  switch (event.type) {
    case 'snapshot':
      return applySnapshot(baseState, event.payload);

    case 'mission_start':
      return { ...baseState, missionActive: true, waitingSince, lastCompletedAt: null };

    case 'mission_complete':
      return { ...baseState, missionActive: false, waitingSince, lastCompletedAt: event.ts };

    case 'planet_sync':
      return { ...baseState, todos: event.payload.todos, waitingSince };

    case 'file_read':
    case 'file_edit':
      return {
        ...baseState,
        satellites: upsertSatellite(baseState.satellites, event.payload.file, event.ts),
        waitingSince,
      };

    case 'run_command':
    case 'run_tests':
      return {
        ...baseState,
        ships: [
          ...baseState.ships,
          {
            id: event.seq != null ? String(event.seq) : String(event.ts),
            kind: event.type === 'run_tests' ? 'tests' : 'command',
            startedAt: event.ts,
          },
        ],
        waitingSince,
      };

    case 'test_result':
      return {
        ...baseState,
        testResultRing: { passed: event.payload.passed, failed: event.payload.failed, updatedAt: event.ts },
        waitingSince,
      };

    case 'search':
      return {
        ...baseState,
        radarPings: [...baseState.radarPings, { id: event.seq != null ? String(event.seq) : String(event.ts), startedAt: event.ts }],
        waitingSince,
      };

    case 'waiting':
      return { ...baseState, waitingSince };

    default:
      return baseState;
  }
}

export function selectActiveShips(state, nowMs) {
  return state.ships.filter((ship) => nowMs - ship.startedAt < SHIP_TTL_MS);
}

export function selectActiveRadarPings(state, nowMs) {
  return state.radarPings.filter((ping) => nowMs - ping.startedAt < RADAR_TTL_MS);
}

export function selectNebulaVisible(state, nowMs) {
  return state.waitingSince != null && nowMs - state.waitingSince >= NEBULA_DELAY_MS;
}

export function selectMissionCompleteFlashVisible(state, nowMs) {
  return state.lastCompletedAt != null && nowMs - state.lastCompletedAt < COMPLETE_FLASH_MS;
}
