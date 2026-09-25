// src/state.js
export function createInitialState() {
  return {
    todos: [],
    missionActive: false,
    lastStatus: null,
    waiting: null,
    // Time Claude has spent actually working this session (not idle, not
    // waiting on the user). The dashboard unlocks extra scenery as it grows.
    activeMs: 0,
    activeSince: null,
  };
}

// A background subagent keeps Claude working after the main turn has ended.
function hasRunningAgent(todos) {
  return todos.some((t) => t.status === 'in_progress');
}

function trackActiveTime(state, ts) {
  const running = (state.missionActive || hasRunningAgent(state.todos)) && !state.waiting;
  if (running && state.activeSince == null) {
    state.activeSince = ts;
  } else if (!running && state.activeSince != null) {
    state.activeMs += Math.max(0, ts - state.activeSince);
    state.activeSince = null;
  }
}

// Events that are not evidence Claude has resumed work, so they leave a pending
// "waiting for input" state in place.
const KEEPS_WAITING = new Set(['waiting', 'status_update', 'snapshot']);

// Subagent planets: agent_start adds one, agent_end marks it finished. The
// dashboard reducer mirrors these rules.
function startAgentPlanet(todos, { id, text }) {
  if (todos.some((t) => t.id === id)) return todos;
  return [...todos, { id, text: text ?? '', status: 'in_progress' }];
}

function endAgentPlanet(todos, { id }) {
  return todos.map((t) => (t.id === id ? { ...t, status: 'completed' } : t));
}

export function applyEvent(state, event) {
  if (!KEEPS_WAITING.has(event.type)) state.waiting = null;
  switch (event.type) {
    case 'mission_start':
      state.missionActive = true;
      // A fresh prompt starts a fresh system; subagents still running stay.
      state.todos = state.todos.filter((t) => t.status !== 'completed');
      break;
    case 'mission_complete':
      state.missionActive = false;
      break;
    case 'planet_sync':
      state.todos = event.payload.todos;
      break;
    case 'agent_start':
      state.todos = startAgentPlanet(state.todos, event.payload);
      break;
    case 'agent_end':
      state.todos = endAgentPlanet(state.todos, event.payload);
      // A background subagent finishing hands Claude a new turn.
      if (event.payload.resumesMission) state.missionActive = true;
      break;
    case 'waiting':
      if (!state.waiting) state.waiting = { since: event.ts, message: event.payload?.message ?? '' };
      break;
    case 'status_update':
      state.lastStatus = event.payload;
      break;
    default:
      break;
  }
  trackActiveTime(state, event.ts ?? Date.now());
  return state;
}

export function snapshotEvent(state, { transcript = [] } = {}) {
  return {
    type: 'snapshot',
    ts: Date.now(),
    payload: {
      todos: state.todos,
      missionActive: state.missionActive,
      lastStatus: state.lastStatus,
      waiting: state.waiting,
      activeMs: state.activeMs,
      activeSince: state.activeSince,
      transcript,
    },
  };
}
