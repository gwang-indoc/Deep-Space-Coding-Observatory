import { describe, it, expect } from 'vitest';
import {
  createInitialOrbitState,
  applyOrbitEvent,
  applySnapshot,
  selectActiveShips,
  selectActiveRadarPings,
  selectNebulaVisible,
  selectMissionCompleteFlashVisible,
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
      lastCompletedAt: null,
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
