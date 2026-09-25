import { describe, it, expect } from 'vitest';
import {
  createInitialOrbitState,
  applyOrbitEvent,
  applySnapshot,
  selectActiveShips,
  selectActiveRadarPings,
  selectNebulaVisible,
  selectOrbitMode,
  selectActiveMs,
  selectMissionCompleteFlashVisible,
  SHIP_TTL_MS,
  RADAR_TTL_MS,
} from '../src/state/orbitReducer.js';

describe('createInitialOrbitState', () => {
  it('starts idle with empty collections', () => {
    const state = createInitialOrbitState();
    expect(state).toEqual({
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
    });
  });
});

describe('applyOrbitEvent: mission lifecycle', () => {
  it('mission_start sets missionActive true and clears any prior completion flash', () => {
    const completed = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_complete', ts: 1, payload: {} });
    const state = applyOrbitEvent(completed, { type: 'mission_start', ts: 2, payload: {} });
    expect(state.missionActive).toBe(true);
    expect(state.lastCompletedAt).toBeNull();
  });

  it('mission_complete sets missionActive false and records lastCompletedAt', () => {
    const active = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_start', ts: 1, payload: {} });
    const state = applyOrbitEvent(active, { type: 'mission_complete', ts: 2, payload: {} });
    expect(state.missionActive).toBe(false);
    expect(state.lastCompletedAt).toBe(2);
  });
});

describe('applyOrbitEvent: mission-complete flash', () => {
  it('selectMissionCompleteFlashVisible is true within 2.5s of completion and false after', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_complete', ts: 1000, payload: {} });
    expect(selectMissionCompleteFlashVisible(state, 1000 + 2499)).toBe(true);
    expect(selectMissionCompleteFlashVisible(state, 1000 + 2500)).toBe(false);
  });

  it('selectMissionCompleteFlashVisible is false when no mission has completed yet', () => {
    expect(selectMissionCompleteFlashVisible(createInitialOrbitState(), 999999)).toBe(false);
  });
});

describe('applyOrbitEvent: planet_sync', () => {
  it('replaces todos with the event payload', () => {
    const todos = [{ id: '1', text: 'Fix bug', status: 'in_progress' }];
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'planet_sync', ts: 1, payload: { todos } });
    expect(state.todos).toEqual(todos);
  });
});

describe('applyOrbitEvent: subagent planets (agent_start / agent_end)', () => {
  it('agent_start adds an in-progress planet and agent_end completes it', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'agent_start', ts: 1, payload: { id: 'a', text: 'Task A' } });
    expect(state.todos).toEqual([{ id: 'a', text: 'Task A', status: 'in_progress' }]);
    state = applyOrbitEvent(state, { type: 'agent_end', ts: 2, payload: { id: 'a', status: 'completed' } });
    expect(state.todos).toEqual([{ id: 'a', text: 'Task A', status: 'completed' }]);
  });

  it('agent_end for an unknown id leaves the planets unchanged', () => {
    const start = applyOrbitEvent(createInitialOrbitState(), { type: 'agent_start', ts: 1, payload: { id: 'a', text: 'A' } });
    const state = applyOrbitEvent(start, { type: 'agent_end', ts: 2, payload: { id: 'zzz', status: 'completed' } });
    expect(state.todos).toBe(start.todos);
  });

  it('agent_end from a background notification also resumes the mission', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), {
      type: 'agent_end',
      ts: 2,
      payload: { id: 'a', status: 'completed', resumesMission: true },
    });
    expect(state.missionActive).toBe(true);
  });

  it('a planet linked to its agentId can be ended by that agentId', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'agent_start', ts: 1, payload: { id: 'toolu_a', text: 'A' } });
    state = applyOrbitEvent(state, { type: 'agent_start', ts: 2, payload: { id: 'toolu_a', agentId: 'a1' } });
    expect(state.todos).toEqual([{ id: 'toolu_a', text: 'A', status: 'in_progress', agentId: 'a1' }]);
    state = applyOrbitEvent(state, { type: 'agent_end', ts: 3, payload: { agentId: 'a1', status: 'completed' } });
    expect(state.todos).toEqual([{ id: 'toolu_a', text: 'A', status: 'completed', agentId: 'a1' }]);
  });

  it('agent_end for an unknown agentId leaves the planets unchanged', () => {
    const start = applyOrbitEvent(createInitialOrbitState(), { type: 'agent_start', ts: 1, payload: { id: 'a', text: 'A' } });
    const state = applyOrbitEvent(start, { type: 'agent_end', ts: 2, payload: { agentId: 'zzz', status: 'completed' } });
    expect(state.todos).toBe(start.todos);
  });

  it('mission_start drops finished planets but keeps ones still running', () => {
    let state = createInitialOrbitState();
    state = applyOrbitEvent(state, { type: 'agent_start', ts: 1, payload: { id: 'a', text: 'A' } });
    state = applyOrbitEvent(state, { type: 'agent_start', ts: 2, payload: { id: 'b', text: 'B' } });
    state = applyOrbitEvent(state, { type: 'agent_end', ts: 3, payload: { id: 'a', status: 'completed' } });
    state = applyOrbitEvent(state, { type: 'mission_start', ts: 4, payload: {} });
    expect(state.todos).toEqual([{ id: 'b', text: 'B', status: 'in_progress' }]);
  });
});

describe('applyOrbitEvent: satellites (file_read / file_edit)', () => {
  it('adds a new satellite for a first-time file', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), {
      type: 'file_read',
      ts: 100,
      payload: { file: 'a.ts' },
    });
    expect(state.satellites).toEqual([{ file: 'a.ts', enteredAt: 100, lastSeenAt: 100, blinkCount: 0 }]);
  });

  it('updates lastSeenAt and increments blinkCount instead of duplicating on repeat reads', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'file_read', ts: 100, payload: { file: 'a.ts' } });
    state = applyOrbitEvent(state, { type: 'file_edit', ts: 200, payload: { file: 'a.ts' } });
    expect(state.satellites).toEqual([{ file: 'a.ts', enteredAt: 100, lastSeenAt: 200, blinkCount: 1 }]);
  });

  it('evicts the oldest satellite (by enteredAt) once more than 12 distinct files are tracked', () => {
    let state = createInitialOrbitState();
    for (let i = 0; i < 13; i += 1) {
      state = applyOrbitEvent(state, { type: 'file_read', ts: i, payload: { file: `file-${i}.ts` } });
    }
    expect(state.satellites).toHaveLength(12);
    expect(state.satellites.find((s) => s.file === 'file-0.ts')).toBeUndefined();
    expect(state.satellites.find((s) => s.file === 'file-12.ts')).toBeDefined();
  });
});

describe('applyOrbitEvent: ships (run_command / run_tests) and their TTL', () => {
  it('adds a command ship and a tests ship with distinct kinds', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), {
      type: 'run_command',
      ts: 100,
      payload: { command: 'ls' },
    });
    state = applyOrbitEvent(state, { type: 'run_tests', ts: 200, payload: { command: 'npm test' } });
    expect(state.ships).toEqual([
      { id: '100', kind: 'command', startedAt: 100 },
      { id: '200', kind: 'tests', startedAt: 200 },
    ]);
  });

  it('selectActiveShips filters out ships older than the TTL', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'run_command', ts: 1000, payload: {} });
    expect(selectActiveShips(state, 1000 + 2199)).toHaveLength(1);
    expect(selectActiveShips(state, 1000 + 2200)).toHaveLength(0);
  });
});

describe('applyOrbitEvent: search / radar pings', () => {
  it('adds a radar ping and selectActiveRadarPings filters by TTL', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'search', ts: 500, payload: {} });
    expect(selectActiveRadarPings(state, 500 + 899)).toHaveLength(1);
    expect(selectActiveRadarPings(state, 500 + 900)).toHaveLength(0);
  });
});

describe('applyOrbitEvent: test_result', () => {
  it('sets the test result ring', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), {
      type: 'test_result',
      ts: 300,
      payload: { passed: 47, failed: 1 },
    });
    expect(state.testResultRing).toEqual({ passed: 47, failed: 1, updatedAt: 300 });
  });
});

describe('applyOrbitEvent: waiting / nebula visibility', () => {
  it('sets waitingSince on the first waiting event and does not reset it on a second one', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'waiting', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'waiting', ts: 1500, payload: {} });
    expect(state.waitingSince).toBe(1000);
  });

  it('clears waitingSince as soon as any other event arrives', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'waiting', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'file_read', ts: 1200, payload: { file: 'a.ts' } });
    expect(state.waitingSince).toBeNull();
  });

  it('selectNebulaVisible is false before the 3s delay and true at/after it', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'waiting', ts: 1000, payload: {} });
    expect(selectNebulaVisible(state, 1000 + 2999)).toBe(false);
    expect(selectNebulaVisible(state, 1000 + 3000)).toBe(true);
  });

  it('selectNebulaVisible is false when never waiting', () => {
    expect(selectNebulaVisible(createInitialOrbitState(), 999999)).toBe(false);
  });

  it('preserves waitingSince across a snapshot event (reconnect is not evidence of resumed activity)', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'waiting', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, {
      type: 'snapshot',
      ts: 2000,
      payload: { todos: [], missionActive: false },
    });
    expect(state.waitingSince).toBe(1000);
  });
});

describe('snapshot handling', () => {
  it('applySnapshot hydrates todos and missionActive directly', () => {
    const state = applySnapshot(createInitialOrbitState(), { todos: [{ id: '1', text: 'x', status: 'pending' }], missionActive: true });
    expect(state.todos).toEqual([{ id: '1', text: 'x', status: 'pending' }]);
    expect(state.missionActive).toBe(true);
  });

  it('applyOrbitEvent with type "snapshot" delegates to applySnapshot', () => {
    const viaEvent = applyOrbitEvent(createInitialOrbitState(), {
      type: 'snapshot',
      ts: 1,
      payload: { todos: [], missionActive: true, lastStatus: null },
    });
    const viaDirectCall = applySnapshot(createInitialOrbitState(), { todos: [], missionActive: true });
    expect(viaEvent).toEqual(viaDirectCall);
  });
});

describe('applyOrbitEvent: unknown event types', () => {
  it('returns the state unchanged', () => {
    const state = createInitialOrbitState();
    expect(applyOrbitEvent(state, { type: 'status_update', ts: 1, payload: {} })).toBe(state);
  });
});

describe('applyOrbitEvent: pruning expired ships and radar pings', () => {
  it('prunes a ship past its TTL when any unrelated event is applied', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'run_command', ts: 1000, payload: {} });
    expect(state.ships).toHaveLength(1);
    state = applyOrbitEvent(state, { type: 'file_read', ts: 1000 + SHIP_TTL_MS + 1, payload: { file: 'a.ts' } });
    expect(state.ships).toEqual([]);
  });

  it('prunes a radar ping past its TTL when any unrelated event is applied', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'search', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'planet_sync', ts: 1000 + RADAR_TTL_MS, payload: { todos: [] } });
    expect(state.radarPings).toEqual([]);
  });

  it('prunes even on event types the reducer otherwise ignores', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'run_command', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'status_update', ts: 1000 + SHIP_TTL_MS, payload: {} });
    expect(state.ships).toEqual([]);
  });

  it('keeps ships and pings still within their TTL', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'run_command', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'search', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'file_read', ts: 1000 + RADAR_TTL_MS - 1, payload: { file: 'a.ts' } });
    expect(state.ships).toHaveLength(1);
    expect(state.radarPings).toHaveLength(1);
  });
});

describe('applyOrbitEvent: ship / radar ping ids', () => {
  it('uses event.seq for the ship id when present', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'run_command', ts: 1000, seq: 7, payload: {} });
    expect(state.ships).toEqual([{ id: '7', kind: 'command', startedAt: 1000 }]);
  });

  it('uses event.seq for the radar ping id when present', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'search', ts: 1000, seq: 8, payload: {} });
    expect(state.radarPings).toEqual([{ id: '8', startedAt: 1000 }]);
  });

  it('gives distinct ids to same-millisecond events that carry distinct seq values', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'run_command', ts: 1000, seq: 1, payload: {} });
    state = applyOrbitEvent(state, { type: 'run_tests', ts: 1000, seq: 2, payload: {} });
    expect(state.ships.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('falls back to String(event.ts) when seq is absent', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'search', ts: 1234, payload: {} });
    expect(state.radarPings).toEqual([{ id: '1234', startedAt: 1234 }]);
  });
});

describe('selectOrbitMode', () => {
  it('is idle before any mission starts', () => {
    expect(selectOrbitMode(createInitialOrbitState(), 1000)).toBe('idle');
  });

  it('is active while a mission runs', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_start', ts: 1000, payload: {} });
    expect(selectOrbitMode(state, 2000)).toBe('active');
  });

  it('stays active during the completion flash, then turns idle', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_start', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'mission_complete', ts: 2000, payload: {} });
    expect(selectOrbitMode(state, 2000 + 2499)).toBe('active');
    expect(selectOrbitMode(state, 2000 + 2500)).toBe('idle');
  });

  it('is waiting as soon as a waiting event arrives, even mid-mission', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_start', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'waiting', ts: 1500, payload: { message: 'Claude needs your permission' } });
    expect(selectOrbitMode(state, 1500)).toBe('waiting');
    expect(state.waitingMessage).toBe('Claude needs your permission');
  });

  it('leaves waiting when activity resumes', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_start', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'waiting', ts: 1500, payload: { message: 'x' } });
    state = applyOrbitEvent(state, { type: 'run_command', ts: 1600, payload: { command: 'ls' } });
    expect(selectOrbitMode(state, 1600)).toBe('active');
    expect(state.waitingMessage).toBeNull();
  });

  it('stays active after the turn ends while a background subagent is still running', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_start', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'agent_start', ts: 1100, payload: { id: 'a', text: 'A' } });
    state = applyOrbitEvent(state, { type: 'mission_complete', ts: 2000, payload: {} });
    expect(selectOrbitMode(state, 60000)).toBe('active');
    state = applyOrbitEvent(state, { type: 'agent_end', ts: 61000, payload: { id: 'a', status: 'completed' } });
    expect(selectOrbitMode(state, 61000 + 2500)).toBe('idle');
  });

  it('restores waiting from a snapshot that carries it', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), {
      type: 'snapshot',
      ts: 2000,
      payload: { todos: [], missionActive: true, waiting: { since: 1500, message: 'hi' } },
    });
    expect(selectOrbitMode(state, 2000)).toBe('waiting');
    expect(state.waitingSince).toBe(1500);
    expect(state.waitingMessage).toBe('hi');
  });
});

describe('selectActiveMs', () => {
  it('counts running time and pauses while waiting or idle', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_start', ts: 1000, payload: {} });
    expect(selectActiveMs(state, 4000)).toBe(3000);
    state = applyOrbitEvent(state, { type: 'waiting', ts: 5000, payload: {} });
    expect(selectActiveMs(state, 9000)).toBe(4000);
    state = applyOrbitEvent(state, { type: 'file_read', ts: 8000, payload: { file: 'a' } });
    state = applyOrbitEvent(state, { type: 'mission_complete', ts: 10000, payload: {} });
    expect(selectActiveMs(state, 99999)).toBe(6000);
  });

  it('keeps counting while a background subagent runs after the turn ends', () => {
    let state = applyOrbitEvent(createInitialOrbitState(), { type: 'mission_start', ts: 1000, payload: {} });
    state = applyOrbitEvent(state, { type: 'agent_start', ts: 1100, payload: { id: 'a', text: 'A' } });
    state = applyOrbitEvent(state, { type: 'mission_complete', ts: 2000, payload: {} });
    expect(selectActiveMs(state, 5000)).toBe(4000);
    state = applyOrbitEvent(state, { type: 'agent_end', ts: 6000, payload: { id: 'a', status: 'completed' } });
    expect(selectActiveMs(state, 99999)).toBe(5000);
  });

  it('hydrates from a snapshot, including a still-running span', () => {
    const state = applyOrbitEvent(createInitialOrbitState(), {
      type: 'snapshot',
      ts: 5000,
      payload: { todos: [], missionActive: true, activeMs: 60000, activeSince: 4000 },
    });
    expect(selectActiveMs(state, 5000)).toBe(61000);
  });
});
