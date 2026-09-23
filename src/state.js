// src/state.js
export function createInitialState() {
  return {
    todos: [],
    missionActive: false,
    lastStatus: null,
    waiting: null,
  };
}

// Events that are not evidence Claude has resumed work, so they leave a pending
// "waiting for input" state in place.
const KEEPS_WAITING = new Set(['waiting', 'status_update', 'snapshot']);

export function applyEvent(state, event) {
  if (!KEEPS_WAITING.has(event.type)) state.waiting = null;
  switch (event.type) {
    case 'mission_start':
      state.missionActive = true;
      break;
    case 'mission_complete':
      state.missionActive = false;
      break;
    case 'planet_sync':
      state.todos = event.payload.todos;
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
  return state;
}

export function snapshotEvent(state) {
  return {
    type: 'snapshot',
    ts: Date.now(),
    payload: {
      todos: state.todos,
      missionActive: state.missionActive,
      lastStatus: state.lastStatus,
      waiting: state.waiting,
    },
  };
}
