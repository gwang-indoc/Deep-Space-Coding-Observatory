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
    waitingMessage: null,
    lastCompletedAt: null,
    activeMs: 0,
    activeSince: null,
  };
}

// Mirrors the server: accumulate time only while a mission runs and Claude is
// not waiting on the user. Returns the same object when nothing changes.
function trackActiveTime(state, ts) {
  const running = state.missionActive && state.waitingSince == null;
  if (running && state.activeSince == null) return { ...state, activeSince: ts };
  if (!running && state.activeSince != null) {
    return { ...state, activeMs: state.activeMs + Math.max(0, ts - state.activeSince), activeSince: null };
  }
  return state;
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

// Mirrors the server's subagent planet rules. Both return the same array when
// nothing changes.
function startAgentPlanet(todos, { id, text }) {
  if (todos.some((t) => t.id === id)) return todos;
  return [...todos, { id, text: text ?? '', status: 'in_progress' }];
}

function endAgentPlanet(todos, { id }) {
  if (!todos.some((t) => t.id === id && t.status !== 'completed')) return todos;
  return todos.map((t) => (t.id === id ? { ...t, status: 'completed' } : t));
}

export function applySnapshot(state, payload) {
  const next = {
    ...state,
    todos: payload?.todos ?? [],
    missionActive: Boolean(payload?.missionActive),
  };
  // Older servers omit `waiting`; only a present value overrides local state.
  if (payload?.waiting) {
    next.waitingSince = payload.waiting.since;
    next.waitingMessage = payload.waiting.message || null;
  }
  if (typeof payload?.activeMs === 'number') {
    next.activeMs = payload.activeMs;
    next.activeSince = payload.activeSince ?? null;
  }
  return next;
}

export function applyOrbitEvent(state, event) {
  const next = reduceOrbitEvent(state, event);
  return event.type === 'snapshot' ? next : trackActiveTime(next, event.ts);
}

function reduceOrbitEvent(state, event) {
  const ships = pruneExpired(state.ships, SHIP_TTL_MS, event.ts);
  const radarPings = pruneExpired(state.radarPings, RADAR_TTL_MS, event.ts);
  const baseState = ships === state.ships && radarPings === state.radarPings ? state : { ...state, ships, radarPings };
  const waitingSince = event.type === 'waiting' ? (baseState.waitingSince ?? event.ts) : null;
  const waitingMessage = event.type === 'waiting' ? (event.payload?.message || baseState.waitingMessage || null) : null;

  switch (event.type) {
    case 'snapshot':
      return applySnapshot(baseState, event.payload);

    case 'mission_start':
      return {
        ...baseState,
        todos: baseState.todos.filter((t) => t.status !== 'completed'),
        missionActive: true,
        waitingSince,
        waitingMessage,
        lastCompletedAt: null,
      };

    case 'mission_complete':
      return { ...baseState, missionActive: false, waitingSince, waitingMessage, lastCompletedAt: event.ts };

    case 'planet_sync':
      return { ...baseState, todos: event.payload.todos, waitingSince, waitingMessage };

    case 'agent_start':
      return { ...baseState, todos: startAgentPlanet(baseState.todos, event.payload), waitingSince, waitingMessage };

    case 'agent_end':
      return {
        ...baseState,
        todos: endAgentPlanet(baseState.todos, event.payload),
        missionActive: baseState.missionActive || Boolean(event.payload.resumesMission),
        waitingSince,
        waitingMessage,
      };

    case 'file_read':
    case 'file_edit':
      return {
        ...baseState,
        satellites: upsertSatellite(baseState.satellites, event.payload.file, event.ts),
        waitingSince,
        waitingMessage,
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
        waitingMessage,
      };

    case 'test_result':
      return {
        ...baseState,
        testResultRing: { passed: event.payload.passed, failed: event.payload.failed, updatedAt: event.ts },
        waitingSince,
        waitingMessage,
      };

    case 'search':
      return {
        ...baseState,
        radarPings: [...baseState.radarPings, { id: event.seq != null ? String(event.seq) : String(event.ts), startedAt: event.ts }],
        waitingSince,
        waitingMessage,
      };

    case 'waiting':
      return { ...baseState, waitingSince, waitingMessage };

    default:
      return baseState;
  }
}

export function selectActiveMs(state, nowMs) {
  return state.activeMs + (state.activeSince != null ? Math.max(0, nowMs - state.activeSince) : 0);
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

// One of 'waiting' (Claude needs the user), 'idle' (no mission running) or
// 'active'. The completion flash counts as active so it can play out first.
export function selectOrbitMode(state, nowMs) {
  if (state.waitingSince != null) return 'waiting';
  if (state.missionActive || selectMissionCompleteFlashVisible(state, nowMs)) return 'active';
  return 'idle';
}

export function selectMissionCompleteFlashVisible(state, nowMs) {
  return state.lastCompletedAt != null && nowMs - state.lastCompletedAt < COMPLETE_FLASH_MS;
}
