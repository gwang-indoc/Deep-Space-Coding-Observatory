// src/state.js
export function createInitialState() {
  return {
    todos: [],
    missionActive: false,
    // Several Claude sessions can share one dashboard (a fork or background
    // session inherits its hooks), so each running turn is tracked by session
    // id, mapped to when it began. The mission is active while any runs.
    missions: {},
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

// Events from before hooks carried a session id share one key.
function sessionKey(event) {
  return typeof event.sessionId === 'string' ? event.sessionId : '';
}

// When the given session's running turn began, or null when it is not running.
export function missionStartedAt(state, sessionId) {
  return state.missions[sessionId ?? ''] ?? null;
}

function setMission(state, key, startedAt) {
  const missions = { ...state.missions };
  if (startedAt == null) delete missions[key];
  else missions[key] = startedAt;
  state.missions = missions;
  state.missionActive = Object.keys(missions).length > 0;
}

// Events that are not evidence Claude has resumed work, so they leave a pending
// "waiting for input" state in place.
const KEEPS_WAITING = new Set(['waiting', 'status_update', 'snapshot']);

// Subagent planets: agent_start adds one (or, carrying an agentId, links a
// background launch to it), agent_end marks it finished by either id. The
// dashboard reducer mirrors these rules.
function startAgentPlanet(todos, { id, text, agentId }, sessionId) {
  if (todos.some((t) => t.id === id)) {
    return agentId ? todos.map((t) => (t.id === id ? { ...t, agentId } : t)) : todos;
  }
  const planet = { id, text: text ?? '', status: 'in_progress' };
  if (agentId) planet.agentId = agentId;
  if (sessionId) planet.sessionId = sessionId;
  return [...todos, planet];
}

function isAgentPlanet(planet, { id, agentId }) {
  return (id != null && planet.id === id) || (agentId != null && planet.agentId === agentId);
}

function endAgentPlanet(todos, target) {
  return todos.map((t) => (isAgentPlanet(t, target) ? { ...t, status: 'completed' } : t));
}

export function applyEvent(state, event) {
  if (!KEEPS_WAITING.has(event.type)) state.waiting = null;
  const key = sessionKey(event);
  switch (event.type) {
    case 'mission_start':
      setMission(state, key, event.ts ?? Date.now());
      // A fresh prompt starts a fresh system; subagents still running stay.
      state.todos = state.todos.filter((t) => t.status !== 'completed');
      break;
    case 'mission_complete':
      setMission(state, key, null);
      break;
    case 'session_end':
      // The session is gone, and its subagents with it.
      setMission(state, key, null);
      state.todos = state.todos.map((t) => (t.sessionId === key && key ? { ...t, status: 'completed' } : t));
      break;
    case 'planet_sync':
      state.todos = event.payload.todos;
      break;
    case 'agent_start':
      state.todos = startAgentPlanet(state.todos, event.payload, key);
      break;
    case 'agent_end':
      state.todos = endAgentPlanet(state.todos, event.payload);
      // A background subagent finishing hands Claude a new turn.
      if (event.payload.resumesMission && state.missions[key] == null) setMission(state, key, event.ts ?? Date.now());
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
      missionSessions: Object.keys(state.missions),
      lastStatus: state.lastStatus,
      waiting: state.waiting,
      activeMs: state.activeMs,
      activeSince: state.activeSince,
      transcript,
    },
  };
}
