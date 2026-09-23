const MAX_SATELLITES = 12;
export const SHIP_TTL_MS = 2200;
export const RADAR_TTL_MS = 900;
const NEBULA_DELAY_MS = 3000;
const COMPLETE_FLASH_MS = 2500;

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
  const waitingSince = event.type === 'waiting' ? (state.waitingSince ?? event.ts) : null;

  switch (event.type) {
    case 'snapshot':
      return applySnapshot(state, event.payload);

    case 'mission_start':
      return { ...state, missionActive: true, waitingSince, lastCompletedAt: null };

    case 'mission_complete':
      return { ...state, missionActive: false, waitingSince, lastCompletedAt: event.ts };

    case 'planet_sync':
      return { ...state, todos: event.payload.todos, waitingSince };

    case 'file_read':
    case 'file_edit':
      return {
        ...state,
        satellites: upsertSatellite(state.satellites, event.payload.file, event.ts),
        waitingSince,
      };

    case 'run_command':
    case 'run_tests':
      return {
        ...state,
        ships: [
          ...state.ships,
          { id: String(event.ts), kind: event.type === 'run_tests' ? 'tests' : 'command', startedAt: event.ts },
        ],
        waitingSince,
      };

    case 'test_result':
      return {
        ...state,
        testResultRing: { passed: event.payload.passed, failed: event.payload.failed, updatedAt: event.ts },
        waitingSince,
      };

    case 'search':
      return {
        ...state,
        radarPings: [...state.radarPings, { id: String(event.ts), startedAt: event.ts }],
        waitingSince,
      };

    case 'waiting':
      return { ...state, waitingSince };

    default:
      return state;
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
