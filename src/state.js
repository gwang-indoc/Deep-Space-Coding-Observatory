// src/state.js
export function createInitialState() {
  return {
    todos: [],
    missionActive: false,
    lastStatus: null,
  };
}

export function applyEvent(state, event) {
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
    },
  };
}
