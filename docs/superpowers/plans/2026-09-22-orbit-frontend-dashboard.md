# Orbit Frontend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser-based visualization half of Orbit — a React + React Three Fiber dashboard, served by the existing `orbit` CLI, that consumes the backend's SSE event stream and renders it as the "deep space observatory" scene described in the design spec.

**Architecture:** A new `web/` npm workspace package (Vite + React + @react-three/fiber) with a pure, fully-unit-tested state core (`orbitReducer.js`, `animationQueue.js`) driving thin, manually-verified rendering components. `src/server.js` is extended to serve `web/dist/` as static files, falling back to today's placeholder when no build exists.

**Tech Stack:** React 18, @react-three/fiber + @react-three/drei + three.js, framer-motion (HUD easing), Vite (build/dev), Vitest + @testing-library/react (unit tests for the pure/DOM-testable layers only — no 3D rendering tests).

**Spec:**
- `docs/superpowers/specs/2026-09-22-orbit-design.md` (sections 4, the Status HUD subsection, and section 5) — visual/animation design, source of truth for what each event looks like.
- `docs/superpowers/specs/2026-09-22-orbit-frontend-design.md` — repo layout, data flow, build/serve integration, and testing scope for this plan.

## Global Constraints

- Node.js >= 20 (existing repo-wide requirement).
- The root package's zero-runtime-dependency property is preserved — all new dependencies (React, three.js, R3F, drei, framer-motion, Vite, Vitest, Testing Library, jsdom) live only in `web/package.json`.
- Animation pacing: queued events play back at a randomized 800–1500ms interval per event (spec section 3); a backlog of more than 20 queued events of the same type collapses into one batch event.
- `status_update` and the initial/reconnect `snapshot` event never go through the animation queue — they apply immediately (spec section 3 / section 4 HUD subsection).
- No 3D pixel-snapshot tests and no multi-session/concurrency tests (spec section 6). Pure logic (reducer, queue, HUD formatting, wake lock, visibility) gets real unit tests; R3F rendering components are manually verified.
- `orbit-notify` / `orbit-statusline` / the SSE pipeline must never cause extra Claude API calls (spec section 5) — this plan only adds a consumer of the existing local event stream, nothing that calls out to Claude.
- Fixed camera in the 3D scene (spec section 4) — no orbit/fly controls.

---

## Task 1: Workspace scaffold — Vite + React app skeleton

**Files:**
- Modify: `package.json` (root) — add `"workspaces": ["web"]` and a `build` script
- Create: `web/package.json`
- Create: `web/vite.config.js`
- Create: `web/index.html`
- Create: `web/src/main.jsx`
- Create: `web/src/App.jsx`
- Test: `web/test/App.test.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: a `web/` workspace that builds to `web/dist/` via `npm run build --workspace=web`, and a default-exported `App` component from `web/src/App.jsx` that later tasks extend

- [ ] **Step 1: Add the workspace to the root package.json**

Read the current root `package.json` and add a `workspaces` field and a `build` script alongside the existing `test` script, e.g.:

```json
{
  "name": "orbit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["web"],
  "engines": { "node": ">=20" },
  "bin": {
    "orbit": "./bin/orbit",
    "orbit-notify": "./bin/orbit-notify",
    "orbit-statusline": "./bin/orbit-statusline"
  },
  "scripts": {
    "test": "node --test test/",
    "build": "npm run build --workspace=web"
  }
}
```

(Keep every existing field exactly as it is today — only add `workspaces` and the `build` script.)

- [ ] **Step 2: Create the web package manifest**

```json
// web/package.json
{
  "name": "orbit-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.166.0",
    "@react-three/fiber": "^8.17.0",
    "@react-three/drei": "^9.111.0",
    "framer-motion": "^11.3.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 3: Create the Vite config (build, dev proxy, and Vitest environment)**

```js
// web/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/events': 'http://localhost:4321',
      '/event': 'http://localhost:4321',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 4: Create the HTML entry point and React bootstrap**

```html
<!-- web/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Orbit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

```jsx
// web/src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 5: Write the failing smoke test**

```jsx
// web/test/App.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App.jsx';

describe('App', () => {
  it('renders the orbit root element', () => {
    render(<App />);
    expect(screen.getByTestId('orbit-app')).toBeTruthy();
  });
});
```

- [ ] **Step 6: Install dependencies**

Run: `npm install` (from the repo root — npm workspaces resolves `web/`'s dependencies too)

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/App.jsx"` (the file doesn't exist yet)

- [ ] **Step 8: Write the minimal App component**

```jsx
// web/src/App.jsx
export default function App() {
  return <div data-testid="orbit-app">Orbit</div>;
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test --workspace=web`
Expected: PASS (1 test)

- [ ] **Step 10: Verify the production build works**

Run: `npm run build --workspace=web`
Expected: `web/dist/index.html` and bundled JS/CSS assets are created without errors.

- [ ] **Step 11: Commit**

```bash
git add package.json web/package.json web/vite.config.js web/index.html web/src/main.jsx web/src/App.jsx web/test/App.test.jsx package-lock.json
git commit -m "feat: scaffold orbit-web workspace with Vite + React"
```

---

## Task 2: Pure scene state core (`orbitReducer.js`)

**Files:**
- Create: `web/src/state/orbitReducer.js`
- Test: `web/test/orbitReducer.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `createInitialOrbitState(): OrbitState` from `web/src/state/orbitReducer.js`
  - `applyOrbitEvent(state: OrbitState, event: {type, ts, payload}): OrbitState` — a reducer usable directly with React's `useReducer`; handles `mission_start`, `mission_complete`, `planet_sync`, `file_read`, `file_edit`, `run_command`, `run_tests`, `test_result`, `search`, `waiting`, and `snapshot`
  - `applySnapshot(state: OrbitState, payload: {todos, missionActive}): OrbitState`
  - `selectActiveShips(state, nowMs): Ship[]`
  - `selectActiveRadarPings(state, nowMs): RadarPing[]`
  - `selectNebulaVisible(state, nowMs): boolean`
  - `selectMissionCompleteFlashVisible(state, nowMs): boolean`

  `OrbitState` shape: `{ missionActive: boolean, todos: Array, satellites: Array<{file, enteredAt, lastSeenAt, blinkCount}>, ships: Array<{id, kind: 'command'|'tests', startedAt}>, radarPings: Array<{id, startedAt}>, testResultRing: {passed, failed, updatedAt}|null, waitingSince: number|null, lastCompletedAt: number|null }`

- [ ] **Step 1: Write the failing tests**

```js
// web/test/orbitReducer.test.js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/state/orbitReducer.js"`

- [ ] **Step 3: Write the minimal implementation**

```js
// web/src/state/orbitReducer.js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=web`
Expected: PASS (all `orbitReducer` cases)

- [ ] **Step 5: Commit**

```bash
git add web/src/state/orbitReducer.js web/test/orbitReducer.test.js
git commit -m "feat: add pure orbit scene state reducer and selectors"
```

---

## Task 3: Animation pacing queue (`animationQueue.js`)

**Files:**
- Create: `web/src/state/animationQueue.js`
- Test: `web/test/animationQueue.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `createAnimationQueue(opts?: { now?: () => number, random?: () => number }): { push(event), pop(): event|batchEvent|null, size(): number, nextIntervalMs(): number }` from `web/src/state/animationQueue.js`. A `batchEvent` has the shape `{ type: 'batch', ts, payload: { originalType, count, items } }`.

- [ ] **Step 1: Write the failing tests**

```js
// web/test/animationQueue.test.js
import { describe, it, expect } from 'vitest';
import { createAnimationQueue } from '../src/state/animationQueue.js';

describe('createAnimationQueue', () => {
  it('pops in FIFO order', () => {
    const queue = createAnimationQueue();
    queue.push({ type: 'file_read', ts: 1, payload: {} });
    queue.push({ type: 'search', ts: 2, payload: {} });
    expect(queue.pop()).toEqual({ type: 'file_read', ts: 1, payload: {} });
    expect(queue.pop()).toEqual({ type: 'search', ts: 2, payload: {} });
  });

  it('returns null when empty', () => {
    const queue = createAnimationQueue();
    expect(queue.pop()).toBeNull();
  });

  it('reports its size', () => {
    const queue = createAnimationQueue();
    queue.push({ type: 'file_read', ts: 1, payload: {} });
    queue.push({ type: 'file_read', ts: 2, payload: {} });
    expect(queue.size()).toBe(2);
  });

  it('collapses more than 20 queued events of the same type into one batch event', () => {
    const queue = createAnimationQueue({ now: () => 9999 });
    for (let i = 0; i < 21; i += 1) {
      queue.push({ type: 'file_read', ts: i, payload: { file: `f${i}.ts` } });
    }
    const popped = queue.pop();
    expect(popped.type).toBe('batch');
    expect(popped.ts).toBe(9999);
    expect(popped.payload.originalType).toBe('file_read');
    expect(popped.payload.count).toBe(21);
    expect(popped.payload.items).toHaveLength(21);
    expect(queue.size()).toBe(0);
  });

  it('does not batch other event types mixed in with a large backlog of one type', () => {
    const queue = createAnimationQueue();
    for (let i = 0; i < 21; i += 1) {
      queue.push({ type: 'file_read', ts: i, payload: {} });
    }
    queue.push({ type: 'mission_complete', ts: 999, payload: {} });

    queue.pop(); // collapses the 21 file_read events into one batch
    expect(queue.pop()).toEqual({ type: 'mission_complete', ts: 999, payload: {} });
  });

  it('nextIntervalMs stays within the 800-1500ms range using the injected random source', () => {
    const queue = createAnimationQueue({ random: () => 0 });
    expect(queue.nextIntervalMs()).toBe(800);
    const queueMax = createAnimationQueue({ random: () => 1 });
    expect(queueMax.nextIntervalMs()).toBe(1500);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/state/animationQueue.js"`

- [ ] **Step 3: Write the minimal implementation**

```js
// web/src/state/animationQueue.js
const MIN_INTERVAL_MS = 800;
const MAX_INTERVAL_MS = 1500;
const BATCH_THRESHOLD = 20;

export function createAnimationQueue({ now = () => Date.now(), random = Math.random } = {}) {
  let queue = [];

  function push(event) {
    queue.push(event);
  }

  function size() {
    return queue.length;
  }

  function pop() {
    if (queue.length === 0) return null;

    const [first] = queue;
    const sameType = queue.filter((e) => e.type === first.type);

    if (sameType.length > BATCH_THRESHOLD) {
      queue = queue.filter((e) => e.type !== first.type);
      return {
        type: 'batch',
        ts: now(),
        payload: { originalType: first.type, count: sameType.length, items: sameType },
      };
    }

    queue = queue.slice(1);
    return first;
  }

  function nextIntervalMs() {
    return MIN_INTERVAL_MS + random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
  }

  return { push, pop, size, nextIntervalMs };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=web`
Expected: PASS (all `animationQueue` cases)

- [ ] **Step 5: Commit**

```bash
git add web/src/state/animationQueue.js web/test/animationQueue.test.js
git commit -m "feat: add animation pacing queue with burst batching"
```

---

## Task 4: SSE client (`eventSource.js`)

**Files:**
- Create: `web/src/state/eventSource.js`
- Test: `web/test/eventSource.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (routes raw events; callers decide what to do with them)
- Produces: `createEventStream({ url?: string, onSnapshot?: (payload) => void, onStatusUpdate?: (payload) => void, onQueueableEvent?: (event) => void, EventSourceImpl?: EventSourceConstructor }): { close(): void }` from `web/src/state/eventSource.js`

- [ ] **Step 1: Write the failing tests**

```js
// web/test/eventSource.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createEventStream } from '../src/state/eventSource.js';

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.closed = false;
    FakeEventSource.instances.push(this);
  }
  emit(dataObj) {
    this.onmessage?.({ data: JSON.stringify(dataObj) });
  }
  emitRaw(rawString) {
    this.onmessage?.({ data: rawString });
  }
  close() {
    this.closed = true;
  }
}
FakeEventSource.instances = [];

beforeEach(() => {
  FakeEventSource.instances = [];
});

describe('createEventStream', () => {
  it('connects to the given url', () => {
    createEventStream({ url: '/events', EventSourceImpl: FakeEventSource });
    expect(FakeEventSource.instances[0].url).toBe('/events');
  });

  it('routes a snapshot event to onSnapshot with just its payload', () => {
    const received = [];
    createEventStream({ onSnapshot: (p) => received.push(p), EventSourceImpl: FakeEventSource });
    FakeEventSource.instances[0].emit({ type: 'snapshot', ts: 1, payload: { todos: [], missionActive: false } });
    expect(received).toEqual([{ todos: [], missionActive: false }]);
  });

  it('routes a status_update event to onStatusUpdate with just its payload', () => {
    const received = [];
    createEventStream({ onStatusUpdate: (p) => received.push(p), EventSourceImpl: FakeEventSource });
    FakeEventSource.instances[0].emit({ type: 'status_update', ts: 1, payload: { model: 'Sonnet 5' } });
    expect(received).toEqual([{ model: 'Sonnet 5' }]);
  });

  it('routes any other event type to onQueueableEvent with the full event', () => {
    const received = [];
    createEventStream({ onQueueableEvent: (e) => received.push(e), EventSourceImpl: FakeEventSource });
    FakeEventSource.instances[0].emit({ type: 'file_read', ts: 1, payload: { file: 'a.ts' } });
    expect(received).toEqual([{ type: 'file_read', ts: 1, payload: { file: 'a.ts' } }]);
  });

  it('ignores malformed JSON without throwing', () => {
    createEventStream({ EventSourceImpl: FakeEventSource });
    expect(() => FakeEventSource.instances[0].emitRaw('not json')).not.toThrow();
  });

  it('close() closes the underlying EventSource', () => {
    const stream = createEventStream({ EventSourceImpl: FakeEventSource });
    stream.close();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/state/eventSource.js"`

- [ ] **Step 3: Write the minimal implementation**

```js
// web/src/state/eventSource.js
export function createEventStream({
  url = '/events',
  onSnapshot,
  onStatusUpdate,
  onQueueableEvent,
  EventSourceImpl = typeof window !== 'undefined' ? window.EventSource : undefined,
} = {}) {
  const source = new EventSourceImpl(url);

  source.onmessage = (message) => {
    let event;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    if (!event || typeof event.type !== 'string') return;

    if (event.type === 'snapshot') {
      onSnapshot?.(event.payload);
      return;
    }
    if (event.type === 'status_update') {
      onStatusUpdate?.(event.payload);
      return;
    }
    onQueueableEvent?.(event);
  };

  return {
    close: () => source.close(),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace=web`
Expected: PASS (all `eventSource` cases)

- [ ] **Step 5: Commit**

```bash
git add web/src/state/eventSource.js web/test/eventSource.test.js
git commit -m "feat: add SSE client that routes snapshot/status/animation events"
```

---

## Task 5: Wake lock and visibility-pause controllers

**Files:**
- Create: `web/src/state/wakeLock.js`
- Create: `web/src/state/visibilityPause.js`
- Test: `web/test/wakeLock.test.js`
- Test: `web/test/visibilityPause.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `createWakeLockController(opts?: { navigatorImpl?, documentImpl? }): { start(): Promise<void>, stop(): void }` from `web/src/state/wakeLock.js`
  - `createVisibilityPauseController(opts: { documentImpl?, onPause?: () => void, onResume?: () => void }): { start(): void, stop(): void }` from `web/src/state/visibilityPause.js`

- [ ] **Step 1: Write the failing wake lock tests**

```js
// web/test/wakeLock.test.js
import { describe, it, expect, vi } from 'vitest';
import { createWakeLockController } from '../src/state/wakeLock.js';

function makeFakeEnv({ requestImpl } = {}) {
  const listeners = {};
  const documentImpl = {
    visibilityState: 'visible',
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    removeEventListener: (type) => {
      delete listeners[type];
    },
  };
  const release = vi.fn();
  const request = requestImpl ?? vi.fn().mockResolvedValue({ release });
  const navigatorImpl = { wakeLock: { request } };
  return { documentImpl, navigatorImpl, request, release, fireVisibilityChange: () => listeners.visibilitychange?.() };
}

describe('createWakeLockController', () => {
  it('requests a screen wake lock on start()', async () => {
    const { documentImpl, navigatorImpl, request } = makeFakeEnv();
    const controller = createWakeLockController({ navigatorImpl, documentImpl });
    await controller.start();
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('does nothing if the Wake Lock API is unavailable', async () => {
    const controller = createWakeLockController({ navigatorImpl: {}, documentImpl: { addEventListener() {}, removeEventListener() {} } });
    await expect(controller.start()).resolves.toBeUndefined();
  });

  it('releases the sentinel on stop()', async () => {
    const { documentImpl, navigatorImpl, release } = makeFakeEnv();
    const controller = createWakeLockController({ navigatorImpl, documentImpl });
    await controller.start();
    controller.stop();
    expect(release).toHaveBeenCalled();
  });

  it('re-requests the lock when the page becomes visible again after losing it', async () => {
    const { documentImpl, navigatorImpl, request, fireVisibilityChange } = makeFakeEnv();
    const controller = createWakeLockController({ navigatorImpl, documentImpl });
    await controller.start();
    controller.stop(); // simulates the sentinel being released (e.g. tab hidden)
    documentImpl.visibilityState = 'visible';
    fireVisibilityChange();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the wake lock tests to verify they fail**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/state/wakeLock.js"`

- [ ] **Step 3: Write the minimal wake lock implementation**

```js
// web/src/state/wakeLock.js
export function createWakeLockController({
  navigatorImpl = typeof navigator !== 'undefined' ? navigator : undefined,
  documentImpl = typeof document !== 'undefined' ? document : undefined,
} = {}) {
  let sentinel = null;

  async function request() {
    if (!navigatorImpl?.wakeLock) return;
    try {
      sentinel = await navigatorImpl.wakeLock.request('screen');
    } catch {
      sentinel = null;
    }
  }

  function handleVisibilityChange() {
    if (documentImpl?.visibilityState === 'visible' && sentinel === null) {
      request();
    }
  }

  function start() {
    documentImpl?.addEventListener?.('visibilitychange', handleVisibilityChange);
    return request();
  }

  function stop() {
    documentImpl?.removeEventListener?.('visibilitychange', handleVisibilityChange);
    sentinel?.release?.();
    sentinel = null;
  }

  return { start, stop };
}
```

- [ ] **Step 4: Run the wake lock tests to verify they pass**

Run: `npm test --workspace=web`
Expected: PASS (all `wakeLock` cases)

- [ ] **Step 5: Write the failing visibility-pause tests**

```js
// web/test/visibilityPause.test.js
import { describe, it, expect, vi } from 'vitest';
import { createVisibilityPauseController } from '../src/state/visibilityPause.js';

function makeFakeDocument() {
  const listeners = {};
  return {
    hidden: false,
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    removeEventListener: (type) => {
      delete listeners[type];
    },
    fire: () => listeners.visibilitychange?.(),
  };
}

describe('createVisibilityPauseController', () => {
  it('calls onPause when the document becomes hidden', () => {
    const documentImpl = makeFakeDocument();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const controller = createVisibilityPauseController({ documentImpl, onPause, onResume });
    controller.start();

    documentImpl.hidden = true;
    documentImpl.fire();

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('calls onResume when the document becomes visible again', () => {
    const documentImpl = makeFakeDocument();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const controller = createVisibilityPauseController({ documentImpl, onPause, onResume });
    controller.start();

    documentImpl.hidden = true;
    documentImpl.fire();
    documentImpl.hidden = false;
    documentImpl.fire();

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('stop() removes the listener', () => {
    const documentImpl = makeFakeDocument();
    const onPause = vi.fn();
    const controller = createVisibilityPauseController({ documentImpl, onPause });
    controller.start();
    controller.stop();

    documentImpl.hidden = true;
    documentImpl.fire();

    expect(onPause).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the visibility-pause tests to verify they fail**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/state/visibilityPause.js"`

- [ ] **Step 7: Write the minimal visibility-pause implementation**

```js
// web/src/state/visibilityPause.js
export function createVisibilityPauseController({
  documentImpl = typeof document !== 'undefined' ? document : undefined,
  onPause,
  onResume,
} = {}) {
  function handleChange() {
    if (documentImpl?.hidden) {
      onPause?.();
    } else {
      onResume?.();
    }
  }

  function start() {
    documentImpl?.addEventListener?.('visibilitychange', handleChange);
  }

  function stop() {
    documentImpl?.removeEventListener?.('visibilitychange', handleChange);
  }

  return { start, stop };
}
```

- [ ] **Step 8: Run the visibility-pause tests to verify they pass**

Run: `npm test --workspace=web`
Expected: PASS (all `visibilityPause` cases)

- [ ] **Step 9: Commit**

```bash
git add web/src/state/wakeLock.js web/src/state/visibilityPause.js web/test/wakeLock.test.js web/test/visibilityPause.test.js
git commit -m "feat: add wake lock and visibility-pause controllers"
```

---

## Task 6: Status HUD formatting + component

**Files:**
- Create: `web/src/hud/hudFormat.js`
- Create: `web/src/hud/StatusHud.jsx`
- Test: `web/test/hudFormat.test.js`
- Test: `web/test/StatusHud.test.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (receives `lastStatus` as a prop shaped like the backend's `status_update` payload: `{ model, contextPct, fiveHourPct, fiveHourResetsAt, sevenDayPct, sevenDayResetsAt }`)
- Produces:
  - `contextTone(pct: number): 'cool'|'warm'|'critical'` from `web/src/hud/hudFormat.js`
  - `formatResetCountdown(resetsAtEpochSeconds: number|null, nowMs: number): string|null` from `web/src/hud/hudFormat.js`
  - `StatusHud({ lastStatus })` React component from `web/src/hud/StatusHud.jsx` (default export)

- [ ] **Step 1: Write the failing formatting tests**

```js
// web/test/hudFormat.test.js
import { describe, it, expect } from 'vitest';
import { contextTone, formatResetCountdown } from '../src/hud/hudFormat.js';

describe('contextTone', () => {
  it('is cool below 80%', () => {
    expect(contextTone(79)).toBe('cool');
  });
  it('is warm at 80% and above, below 100%', () => {
    expect(contextTone(80)).toBe('warm');
    expect(contextTone(99)).toBe('warm');
  });
  it('is critical at 100% or above', () => {
    expect(contextTone(100)).toBe('critical');
  });
});

describe('formatResetCountdown', () => {
  it('returns null when there is no reset timestamp', () => {
    expect(formatResetCountdown(null, 0)).toBeNull();
  });

  it('returns "resetting" once the reset time has passed', () => {
    expect(formatResetCountdown(1000, 1000 * 1000 + 1)).toBe('resetting');
  });

  it('formats minutes only when under an hour remains', () => {
    const resetsAt = 1000; // seconds
    const nowMs = resetsAt * 1000 - 45 * 60 * 1000; // 45 minutes before
    expect(formatResetCountdown(resetsAt, nowMs)).toBe('45m');
  });

  it('formats hours and minutes when over an hour remains', () => {
    const resetsAt = 100000; // seconds
    const nowMs = resetsAt * 1000 - (2 * 60 + 15) * 60 * 1000; // 2h15m before
    expect(formatResetCountdown(resetsAt, nowMs)).toBe('2h 15m');
  });
});
```

- [ ] **Step 2: Run the formatting tests to verify they fail**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/hud/hudFormat.js"`

- [ ] **Step 3: Write the minimal formatting implementation**

```js
// web/src/hud/hudFormat.js
const WARN_THRESHOLD = 80;

export function contextTone(pct) {
  if (pct >= 100) return 'critical';
  if (pct >= WARN_THRESHOLD) return 'warm';
  return 'cool';
}

export function formatResetCountdown(resetsAtEpochSeconds, nowMs) {
  if (resetsAtEpochSeconds == null) return null;
  const remainingMs = resetsAtEpochSeconds * 1000 - nowMs;
  if (remainingMs <= 0) return 'resetting';
  const totalMinutes = Math.round(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
```

- [ ] **Step 4: Run the formatting tests to verify they pass**

Run: `npm test --workspace=web`
Expected: PASS (all `hudFormat` cases)

- [ ] **Step 5: Write the failing StatusHud smoke test**

```jsx
// web/test/StatusHud.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusHud from '../src/hud/StatusHud.jsx';

describe('StatusHud', () => {
  it('renders the model name and percentages from lastStatus', () => {
    render(
      <StatusHud
        lastStatus={{
          model: 'Sonnet 5',
          contextPct: 42,
          fiveHourPct: 62,
          fiveHourResetsAt: null,
          sevenDayPct: 31,
          sevenDayResetsAt: null,
        }}
      />
    );
    expect(screen.getByText('Sonnet 5')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getByText('31%')).toBeTruthy();
  });

  it('renders a placeholder before any status_update has arrived', () => {
    render(<StatusHud lastStatus={null} />);
    expect(screen.getByTestId('status-hud')).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run the StatusHud test to verify it fails**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/hud/StatusHud.jsx"`

- [ ] **Step 7: Write the minimal StatusHud implementation**

```jsx
// web/src/hud/StatusHud.jsx
import { contextTone, formatResetCountdown } from './hudFormat.js';

export default function StatusHud({ lastStatus }) {
  if (!lastStatus) {
    return <div className="status-hud status-hud--idle" data-testid="status-hud" />;
  }

  const { model, contextPct, fiveHourPct, fiveHourResetsAt, sevenDayPct, sevenDayResetsAt } = lastStatus;
  const now = Date.now();

  return (
    <div className={`status-hud status-hud--${contextTone(contextPct)}`} data-testid="status-hud">
      <div className="status-hud__model">{model}</div>
      <div className="status-hud__row">
        <span>Context</span>
        <span>{contextPct}%</span>
      </div>
      <div className="status-hud__row">
        <span>5h</span>
        <span>{fiveHourPct}%</span>
        <span>{formatResetCountdown(fiveHourResetsAt, now)}</span>
      </div>
      <div className="status-hud__row">
        <span>7d</span>
        <span>{sevenDayPct}%</span>
        <span>{formatResetCountdown(sevenDayResetsAt, now)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the StatusHud test to verify it passes**

Run: `npm test --workspace=web`
Expected: PASS (both `StatusHud` cases)

- [ ] **Step 9: Commit**

```bash
git add web/src/hud/hudFormat.js web/src/hud/StatusHud.jsx web/test/hudFormat.test.js web/test/StatusHud.test.jsx
git commit -m "feat: add Status HUD formatting and component"
```

---

## Task 7: Step list component

**Files:**
- Create: `web/src/hud/StepList.jsx`
- Test: `web/test/StepList.test.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `StepList({ activeStep, recentLog })` React component (default export) from `web/src/hud/StepList.jsx`, where `activeStep` is one of `'planning'|'reading'|'editing'|'testing'|null` and `recentLog` is `string[]`

- [ ] **Step 1: Write the failing test**

```jsx
// web/test/StepList.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepList from '../src/hud/StepList.jsx';

describe('StepList', () => {
  it('renders all four step labels', () => {
    render(<StepList activeStep={null} recentLog={[]} />);
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByText('Reading')).toBeTruthy();
    expect(screen.getByText('Editing')).toBeTruthy();
    expect(screen.getByText('Testing')).toBeTruthy();
  });

  it('marks the active step with data-active', () => {
    render(<StepList activeStep="reading" recentLog={[]} />);
    expect(screen.getByText('Reading').closest('[data-active]').getAttribute('data-active')).toBe('true');
    expect(screen.getByText('Editing').closest('[data-active]').getAttribute('data-active')).toBe('false');
  });

  it('hides the recent log by default and shows it on hover', () => {
    render(<StepList activeStep="reading" recentLog={['Reading src/auth/session.ts']} />);
    expect(screen.queryByText('Reading src/auth/session.ts')).toBeNull();

    fireEvent.mouseEnter(screen.getByTestId('step-list'));
    expect(screen.getByText('Reading src/auth/session.ts')).toBeTruthy();

    fireEvent.mouseLeave(screen.getByTestId('step-list'));
    expect(screen.queryByText('Reading src/auth/session.ts')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace=web`
Expected: FAIL with `Failed to resolve import "../src/hud/StepList.jsx"`

- [ ] **Step 3: Write the minimal implementation**

```jsx
// web/src/hud/StepList.jsx
import { useState } from 'react';

const STEPS = [
  { key: 'planning', label: 'Planning' },
  { key: 'reading', label: 'Reading' },
  { key: 'editing', label: 'Editing' },
  { key: 'testing', label: 'Testing' },
];

export default function StepList({ activeStep, recentLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="step-list"
      data-testid="step-list"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <ul className="step-list__steps">
        {STEPS.map((step) => (
          <li key={step.key} data-active={String(step.key === activeStep)}>
            {step.label}
          </li>
        ))}
      </ul>
      {expanded && (
        <ul className="step-list__log">
          {recentLog.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test --workspace=web`
Expected: PASS (all `StepList` cases)

- [ ] **Step 5: Commit**

```bash
git add web/src/hud/StepList.jsx web/test/StepList.test.jsx
git commit -m "feat: add step list component with hover-expand log"
```

---

## Task 8: Scene root, central star, and idle universe

**Files:**
- Create: `web/src/scene/Scene.jsx`
- Create: `web/src/scene/CentralStar.jsx`
- Create: `web/src/scene/IdleUniverse.jsx`

**Interfaces:**
- Consumes: `selectMissionCompleteFlashVisible(state, nowMs)` from `web/src/state/orbitReducer.js` (Task 2)
- Produces: `Scene({ missionActive, children })`, `CentralStar({ missionActive, lastCompletedAt })`, `IdleUniverse()` React components (default exports)

**Testing note:** per the parent spec (section 6), 3D rendering is manually verified, not unit tested — jsdom has no WebGL context for React Three Fiber to render into. This task's steps are implementation + manual verification, not TDD.

- [ ] **Step 1: Implement the fixed-camera scene root**

```jsx
// web/src/scene/Scene.jsx
import { Canvas } from '@react-three/fiber';

export default function Scene({ missionActive, renderingPaused, children }) {
  return (
    <Canvas
      frameloop={renderingPaused ? 'never' : 'always'}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 12], fov: 50 }}
      style={{ position: 'absolute', inset: 0, background: '#02030a' }}
    >
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 5]} intensity={missionActive ? 1.2 : 0.4} />
      {children}
    </Canvas>
  );
}
```

- [ ] **Step 2: Implement the central star**

```jsx
// web/src/scene/CentralStar.jsx
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { selectMissionCompleteFlashVisible } from '../state/orbitReducer.js';

export default function CentralStar({ missionActive, lastCompletedAt }) {
  const meshRef = useRef(null);
  const [flashing, setFlashing] = useState(false);

  useFrame((state) => {
    if (!meshRef.current) return;
    const flashVisible = selectMissionCompleteFlashVisible({ lastCompletedAt }, Date.now());
    if (flashVisible !== flashing) setFlashing(flashVisible);

    const pulse = flashVisible
      ? 1 + Math.max(0, 1 - (Date.now() - lastCompletedAt) / 2500) * 1.5
      : missionActive
        ? 1 + Math.sin(state.clock.elapsedTime * 2) * 0.08
        : 1;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1.2, 32, 32]} />
      <meshStandardMaterial
        color={flashing ? '#ffffff' : missionActive ? '#ffcf7a' : '#3a3f55'}
        emissive={flashing ? '#ffe9c2' : missionActive ? '#ff9f43' : '#101223'}
        emissiveIntensity={flashing ? 2.2 : missionActive ? 0.8 : 0.15}
      />
      {flashing && (
        <Html center distanceFactor={10}>
          <div style={{ color: '#ffe9c2', fontFamily: 'monospace', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
            MISSION COMPLETE
          </div>
        </Html>
      )}
    </mesh>
  );
}
```

- [ ] **Step 3: Implement the idle universe background**

```jsx
// web/src/scene/IdleUniverse.jsx
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const STAR_COUNT = 400;

export default function IdleUniverse() {
  const pointsRef = useRef(null);

  const positions = useMemo(() => {
    const array = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      array[i * 3] = (Math.random() - 0.5) * 60;
      array[i * 3 + 1] = (Math.random() - 0.5) * 60;
      array[i * 3 + 2] = (Math.random() - 0.5) * 60 - 10;
    }
    return array;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.01;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#8ea2c6" size={0.05} sizeAttenuation />
    </points>
  );
}
```

- [ ] **Step 4: Manually verify in the dev server**

Run: `npm run dev --workspace=web`, open the printed local URL, and confirm: a dark scene renders, faint stars slowly rotate in the background, and a dim central sphere is visible. Temporarily pass `lastCompletedAt={Date.now()}` to `CentralStar` and confirm a bright white flash with "MISSION COMPLETE" text appears and fades within ~2.5s; remove the hardcoded prop afterward.

- [ ] **Step 5: Commit**

```bash
git add web/src/scene/Scene.jsx web/src/scene/CentralStar.jsx web/src/scene/IdleUniverse.jsx
git commit -m "feat: add scene root, central star, and idle universe background"
```

---

## Task 9: Planet layer (todos)

**Files:**
- Create: `web/src/scene/PlanetLayer.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `PlanetLayer({ todos })` React component (default export) from `web/src/scene/PlanetLayer.jsx`, where `todos` matches the backend's `planet_sync` payload shape (`Array<{ id, text, status }>`)

**Testing note:** manual verification only, per Task 8's note.

- [ ] **Step 1: Implement the planet layer**

```jsx
// web/src/scene/PlanetLayer.jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

const STATUS_COLOR = {
  pending: '#3a3f55',
  in_progress: '#5fb0ff',
  completed: '#7dffb0',
};

function Planet({ index, total, status }) {
  const groupRef = useRef(null);
  const radius = 3 + index * 1.1;
  const speed = status === 'in_progress' ? 0.35 : status === 'completed' ? 0.12 : 0;

  useFrame((state) => {
    if (!groupRef.current) return;
    const angle = (index / total) * Math.PI * 2 + state.clock.elapsedTime * speed;
    groupRef.current.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial
          color={STATUS_COLOR[status] ?? STATUS_COLOR.pending}
          emissive={STATUS_COLOR[status] ?? STATUS_COLOR.pending}
          emissiveIntensity={status === 'pending' ? 0.05 : 0.5}
        />
      </mesh>
    </group>
  );
}

export default function PlanetLayer({ todos }) {
  if (!todos || todos.length === 0) return null;

  return (
    <group>
      {todos.map((todo, index) => (
        <Planet key={todo.id} index={index} total={todos.length} status={todo.status} />
      ))}
    </group>
  );
}
```

- [ ] **Step 2: Manually verify in the dev server**

Temporarily render `<PlanetLayer todos={[{ id: '1', text: 'a', status: 'pending' }, { id: '2', text: 'b', status: 'in_progress' }, { id: '3', text: 'c', status: 'completed' }]} />` inside `App.jsx`'s `Scene`, confirm three planets orbit at different radii with distinct colors and speeds, then remove the temporary hardcoded data (real wiring happens in Task 13).

- [ ] **Step 3: Commit**

```bash
git add web/src/scene/PlanetLayer.jsx
git commit -m "feat: add planet layer rendering todos from planet_sync"
```

---

## Task 10: Satellites (file_read / file_edit)

**Files:**
- Create: `web/src/scene/Satellites.jsx`

**Interfaces:**
- Consumes: `selectActiveShips`-style pattern is not needed here (satellites don't expire) — reads `satellites: Array<{file, enteredAt, lastSeenAt, blinkCount}>` directly, the shape produced by `orbitReducer.js` (Task 2)
- Produces: `Satellites({ satellites })` React component (default export) from `web/src/scene/Satellites.jsx`

**Testing note:** manual verification only, per Task 8's note.

- [ ] **Step 1: Implement the satellites layer**

```jsx
// web/src/scene/Satellites.jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

function Satellite({ index, total, blinkCount }) {
  const meshRef = useRef(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const angle = (index / Math.max(total, 1)) * Math.PI * 2 + state.clock.elapsedTime * 0.5;
    const radius = 6.5;
    meshRef.current.position.set(Math.cos(angle) * radius, Math.sin(state.clock.elapsedTime + index) * 0.3, Math.sin(angle) * radius);
    const blink = blinkCount > 0 ? 1 + Math.sin(state.clock.elapsedTime * 6) * 0.3 : 1;
    meshRef.current.scale.setScalar(blink);
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.15, 0.15, 0.15]} />
      <meshStandardMaterial color="#cbd5f5" emissive="#8ea2c6" emissiveIntensity={0.4} />
    </mesh>
  );
}

export default function Satellites({ satellites }) {
  if (!satellites || satellites.length === 0) return null;

  return (
    <group>
      {satellites.map((satellite, index) => (
        <Satellite key={satellite.file} index={index} total={satellites.length} blinkCount={satellite.blinkCount} />
      ))}
    </group>
  );
}
```

- [ ] **Step 2: Manually verify in the dev server**

Temporarily render `<Satellites satellites={[{ file: 'a.ts', enteredAt: 0, lastSeenAt: 0, blinkCount: 0 }, { file: 'b.ts', enteredAt: 0, lastSeenAt: 0, blinkCount: 2 }]} />` inside `Scene`, confirm two small cubes orbit and the second one (repeat-read) pulses/blinks while the first stays steady, then remove the hardcoded data.

- [ ] **Step 3: Commit**

```bash
git add web/src/scene/Satellites.jsx
git commit -m "feat: add satellites layer for file_read/file_edit events"
```

---

## Task 11: Ships, radar ping, and test result ring

**Files:**
- Create: `web/src/scene/Ship.jsx`
- Create: `web/src/scene/RadarPing.jsx`

**Interfaces:**
- Consumes: `selectActiveShips`, `selectActiveRadarPings`, `SHIP_TTL_MS`, `RADAR_TTL_MS` from `web/src/state/orbitReducer.js` (Task 2); reads `ships`, `radarPings`, and `testResultRing` directly from `OrbitState`
- Produces: `Ship({ ships, testResultRing })`, `RadarPing({ radarPings })` React components (default exports)

**Testing note:** manual verification only, per Task 8's note.

- [ ] **Step 1: Implement ships and the test result ring**

```jsx
// web/src/scene/Ship.jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { selectActiveShips, SHIP_TTL_MS } from '../state/orbitReducer.js';

function ShipMesh({ ship }) {
  const meshRef = useRef(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const progress = Math.min(1, Math.max(0, (Date.now() - ship.startedAt) / SHIP_TTL_MS));
    const angle = progress * Math.PI * 2;
    const radius = 4 + progress * 4;
    meshRef.current.position.set(Math.cos(angle) * radius, 0.1, Math.sin(angle) * radius);
  });

  return (
    <mesh ref={meshRef}>
      <coneGeometry args={[0.12, 0.4, 8]} />
      <meshStandardMaterial color={ship.kind === 'tests' ? '#7dffb0' : '#ffd479'} />
    </mesh>
  );
}

function TestResultRing({ testResultRing }) {
  if (!testResultRing) return null;
  const total = testResultRing.passed + testResultRing.failed;
  if (total === 0) return null;

  return (
    <group>
      {Array.from({ length: total }).map((_, index) => {
        const angle = (index / total) * Math.PI * 2;
        const passed = index < testResultRing.passed;
        return (
          <mesh key={index} position={[Math.cos(angle) * 8.5, 0, Math.sin(angle) * 8.5]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color={passed ? '#7dffb0' : '#ff6b6b'} emissive={passed ? '#3d8f61' : '#8f2d2d'} emissiveIntensity={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function Ship({ ships, testResultRing }) {
  const now = Date.now();
  const active = selectActiveShips({ ships }, now);

  return (
    <group>
      {active.map((ship) => (
        <ShipMesh key={ship.id} ship={ship} />
      ))}
      <TestResultRing testResultRing={testResultRing} />
    </group>
  );
}
```

- [ ] **Step 2: Implement the radar ping**

```jsx
// web/src/scene/RadarPing.jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { selectActiveRadarPings, RADAR_TTL_MS } from '../state/orbitReducer.js';

function Ping({ ping }) {
  const meshRef = useRef(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const progress = Math.min(1, (Date.now() - ping.startedAt) / RADAR_TTL_MS);
    meshRef.current.scale.setScalar(1 + progress * 6);
    meshRef.current.material.opacity = 1 - progress;
  });

  return (
    <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1, 1.05, 32]} />
      <meshBasicMaterial color="#5fb0ff" transparent opacity={0.6} />
    </mesh>
  );
}

export default function RadarPing({ radarPings }) {
  const now = Date.now();
  const active = selectActiveRadarPings({ radarPings }, now);

  return (
    <group>
      {active.map((ping) => (
        <Ping key={ping.id} ping={ping} />
      ))}
    </group>
  );
}
```

- [ ] **Step 3: Manually verify in the dev server**

Temporarily render `<Ship ships={[{ id: '1', kind: 'command', startedAt: Date.now() }]} testResultRing={{ passed: 3, failed: 1 }} />` and `<RadarPing radarPings={[{ id: '1', startedAt: Date.now() }]} />` inside `Scene`, confirm a small cone travels an orbit and disappears after ~2.2s, a ring of 4 colored dots appears, and an expanding translucent ring fades out over ~0.9s. Remove the hardcoded data afterward.

- [ ] **Step 4: Commit**

```bash
git add web/src/scene/Ship.jsx web/src/scene/RadarPing.jsx
git commit -m "feat: add ships, test result ring, and radar ping"
```

---

## Task 12: Nebula (waiting state)

**Files:**
- Create: `web/src/scene/Nebula.jsx`

**Interfaces:**
- Consumes: `selectNebulaVisible(state, nowMs)` from `web/src/state/orbitReducer.js` (Task 2); reads `waitingSince` directly from `OrbitState`
- Produces: `Nebula({ waitingSince })` React component (default export) from `web/src/scene/Nebula.jsx`

**Testing note:** manual verification only, per Task 8's note.

- [ ] **Step 1: Implement the nebula**

```jsx
// web/src/scene/Nebula.jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { selectNebulaVisible } from '../state/orbitReducer.js';

export default function Nebula({ waitingSince }) {
  const meshRef = useRef(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const visible = selectNebulaVisible({ waitingSince }, Date.now());
    meshRef.current.visible = visible;
    if (visible) {
      meshRef.current.rotation.z = state.clock.elapsedTime * 0.02;
      meshRef.current.material.opacity = 0.15 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -15]}>
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial color="#5b3a8f" transparent opacity={0.15} />
    </mesh>
  );
}
```

- [ ] **Step 2: Manually verify in the dev server**

Temporarily render `<Nebula waitingSince={Date.now() - 3500} />` inside `Scene`, confirm a faint slowly-rotating purple haze is visible in the background; render `<Nebula waitingSince={Date.now()} />` and confirm nothing is visible yet (delay not elapsed). Remove the hardcoded prop afterward.

- [ ] **Step 3: Commit**

```bash
git add web/src/scene/Nebula.jsx
git commit -m "feat: add nebula background for the waiting state"
```

---

## Task 13: Wire it together — OrbitProvider and App assembly

**Files:**
- Create: `web/src/state/OrbitProvider.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: everything from Tasks 2–12 (`applyOrbitEvent`, `createInitialOrbitState`, `createAnimationQueue`, `createEventStream`, `createWakeLockController`, `createVisibilityPauseController`, `StatusHud`, `StepList`, `Scene`, `CentralStar`, `IdleUniverse`, `PlanetLayer`, `Satellites`, `Ship`, `RadarPing`, `Nebula`)
- Produces: `OrbitProvider({ children })` and `useOrbit()` from `web/src/state/OrbitProvider.jsx`, exposing `{ orbitState, lastStatus, renderingPaused, activeStep, recentLog }` from context; the fully assembled `App` default export from `web/src/App.jsx`

**Note on the backend's `snapshot` payload:** `src/state.js`'s `snapshotEvent` (already implemented) sends `{ todos, missionActive, lastStatus }` on every `GET /events` connect/reconnect specifically so a fresh or reconnected browser tab doesn't show a blank HUD (parent spec section 3). `eventSource.js` (Task 4) routes the whole `snapshot` payload to `onSnapshot` — this task's `onSnapshot` handler must forward `payload.lastStatus` into the HUD state in addition to dispatching the todos/missionActive fields into the reducer, or a reconnect leaves the HUD stale until the next periodic `status_update`.

**Testing note:** this task is integration wiring across already-unit-tested pieces (queue, event source, reducer, wake lock, visibility) plus manually-verified rendering components — verified manually against the real running backend, not with a new automated test.

- [ ] **Step 1: Implement the provider**

```jsx
// web/src/state/OrbitProvider.jsx
import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { applyOrbitEvent, createInitialOrbitState } from './orbitReducer.js';
import { createAnimationQueue } from './animationQueue.js';
import { createEventStream } from './eventSource.js';
import { createWakeLockController } from './wakeLock.js';
import { createVisibilityPauseController } from './visibilityPause.js';

const OrbitContext = createContext(null);

function labelForEvent(event) {
  switch (event.type) {
    case 'file_read':
      return `Reading ${event.payload.file}`;
    case 'file_edit':
      return `Editing ${event.payload.file}`;
    case 'run_command':
      return `Running: ${event.payload.command}`;
    case 'run_tests':
      return `Running tests: ${event.payload.command}`;
    case 'test_result':
      return `Tests: ${event.payload.passed} passed, ${event.payload.failed} failed`;
    case 'search':
      return 'Searching';
    case 'mission_start':
      return 'Mission started';
    case 'mission_complete':
      return 'Mission complete';
    case 'planet_sync':
      return 'Todo list updated';
    default:
      return null;
  }
}

function stepForEvent(type) {
  switch (type) {
    case 'mission_start':
      return 'planning';
    case 'file_read':
    case 'search':
      return 'reading';
    case 'file_edit':
      return 'editing';
    case 'run_tests':
    case 'test_result':
      return 'testing';
    default:
      return undefined; // leave the previously active step as-is
  }
}

const RECENT_LOG_LIMIT = 5;

export function OrbitProvider({ children }) {
  const [orbitState, dispatch] = useReducer(applyOrbitEvent, undefined, createInitialOrbitState);
  const [lastStatus, setLastStatus] = useState(null);
  const [renderingPaused, setRenderingPaused] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [recentLog, setRecentLog] = useState([]);
  const queueRef = useRef(null);
  if (queueRef.current === null) {
    queueRef.current = createAnimationQueue();
  }

  function applyDispatchedEvent(event) {
    dispatch(event);
    const label = labelForEvent(event);
    if (label) {
      setRecentLog((prev) => [label, ...prev].slice(0, RECENT_LOG_LIMIT));
    }
    const step = stepForEvent(event.type);
    if (step !== undefined) {
      setActiveStep(step);
    }
  }

  useEffect(() => {
    const stream = createEventStream({
      onSnapshot: (payload) => {
        dispatch({ type: 'snapshot', ts: Date.now(), payload });
        if (payload.lastStatus) setLastStatus(payload.lastStatus);
      },
      onStatusUpdate: (payload) => setLastStatus(payload),
      onQueueableEvent: (event) => queueRef.current.push(event),
    });

    let timeoutId = null;
    function tick() {
      const next = queueRef.current.pop();
      if (next) {
        if (next.type === 'batch') {
          next.payload.items.forEach((item) => applyDispatchedEvent(item));
        } else {
          applyDispatchedEvent(next);
        }
      }
      timeoutId = setTimeout(tick, queueRef.current.nextIntervalMs());
    }
    tick();

    const wakeLock = createWakeLockController();
    wakeLock.start();

    const visibility = createVisibilityPauseController({
      onPause: () => setRenderingPaused(true),
      onResume: () => setRenderingPaused(false),
    });
    visibility.start();

    return () => {
      stream.close();
      clearTimeout(timeoutId);
      wakeLock.stop();
      visibility.stop();
    };
  }, []);

  return (
    <OrbitContext.Provider value={{ orbitState, lastStatus, renderingPaused, activeStep, recentLog }}>
      {children}
    </OrbitContext.Provider>
  );
}

export function useOrbit() {
  const ctx = useContext(OrbitContext);
  if (!ctx) throw new Error('useOrbit must be used within OrbitProvider');
  return ctx;
}
```

- [ ] **Step 2: Assemble the full App**

```jsx
// web/src/App.jsx
import { OrbitProvider, useOrbit } from './state/OrbitProvider.jsx';
import Scene from './scene/Scene.jsx';
import CentralStar from './scene/CentralStar.jsx';
import IdleUniverse from './scene/IdleUniverse.jsx';
import PlanetLayer from './scene/PlanetLayer.jsx';
import Satellites from './scene/Satellites.jsx';
import Ship from './scene/Ship.jsx';
import RadarPing from './scene/RadarPing.jsx';
import Nebula from './scene/Nebula.jsx';
import StatusHud from './hud/StatusHud.jsx';
import StepList from './hud/StepList.jsx';

function OrbitDashboard() {
  const { orbitState, lastStatus, renderingPaused, activeStep, recentLog } = useOrbit();

  return (
    <div data-testid="orbit-app" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Scene missionActive={orbitState.missionActive} renderingPaused={renderingPaused}>
        <IdleUniverse />
        <Nebula waitingSince={orbitState.waitingSince} />
        <CentralStar missionActive={orbitState.missionActive} lastCompletedAt={orbitState.lastCompletedAt} />
        <PlanetLayer todos={orbitState.todos} />
        <Satellites satellites={orbitState.satellites} />
        <Ship ships={orbitState.ships} testResultRing={orbitState.testResultRing} />
        <RadarPing radarPings={orbitState.radarPings} />
      </Scene>
      <StatusHud lastStatus={lastStatus} />
      <StepList activeStep={activeStep} recentLog={recentLog} />
    </div>
  );
}

export default function App() {
  return (
    <OrbitProvider>
      <OrbitDashboard />
    </OrbitProvider>
  );
}
```

- [ ] **Step 3: Update the existing App smoke test's expectations if needed**

Run: `npm test --workspace=web`
Expected: the `App.test.jsx` smoke test from Task 1 still passes (it only checks for the `orbit-app` test id, which the assembled `App` still renders). If it fails because `OrbitProvider`'s `useEffect` throws in jsdom (no real `EventSource`/`WakeLock`), wrap the failing calls: confirm `createEventStream` only runs `new EventSourceImpl(...)` when `EventSourceImpl` is defined (jsdom doesn't implement `EventSource` by default), and adjust `OrbitProvider` to skip stream creation when `window.EventSource` is undefined, e.g. guard the `useEffect` body's stream setup with `if (typeof window !== 'undefined' && !window.EventSource) return;` before creating the stream (still start the queue/wake lock/visibility controllers, which already no-op safely without their browser APIs).

- [ ] **Step 4: Manually verify against the real backend**

Run: `npm run build --workspace=web`, then from the repo root run `node bin/orbit claude -p "list the files in this repo"` and confirm the opened browser tab shows the full scene (not the placeholder), the HUD updates with real model/context/rate-limit data, satellites/ships appear as Claude reads files and runs commands, and the step list's active dot and hover log update as different event types arrive. Then reload the browser tab mid-session (or open a second tab) and confirm the HUD shows the last known model/context/rate-limit numbers immediately from the reconnect `snapshot` rather than staying blank until the next periodic update.

- [ ] **Step 5: Commit**

```bash
git add web/src/state/OrbitProvider.jsx web/src/App.jsx
git commit -m "feat: wire OrbitProvider and assemble the full dashboard"
```

---

## Task 14: Serve the built frontend from the backend

**Files:**
- Modify: `src/server.js`
- Modify: `test/server.test.js`

**Interfaces:**
- Consumes: `web/dist/` build output (Task 1's build script)
- Produces: `GET /` now serves `web/dist/index.html` and its assets (`GET /assets/*` etc.) when `web/dist/` exists, falling back to the existing placeholder string otherwise

- [ ] **Step 1: Write the failing regression test for the fallback path**

Add to `test/server.test.js` (keep all existing tests in that file unchanged):

```js
// added to test/server.test.js
test('GET / falls back to the placeholder when no frontend build exists', async () => {
  const { port, close } = await createOrbitServer(0);
  const response = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Orbit backend running/);
  await close();
});
```

- [ ] **Step 2: Run the test to verify it currently passes (baseline) then confirm it still needs the fallback behavior preserved**

Run: `node --test test/server.test.js`
Expected: PASS (this test should already pass against the current placeholder-only implementation — it's a regression guard for Step 4's change, not a new-feature test)

- [ ] **Step 3: Add static-file serving with the fallback**

```js
// src/server.js — add near the top, alongside the existing import
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST_DIR = path.join(__dirname, '..', 'web', 'dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function serveStatic(req, res) {
  const requestedPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(WEB_DIST_DIR, requestedPath);

  if (!filePath.startsWith(WEB_DIST_DIR)) {
    res.writeHead(403);
    res.end();
    return true;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
```

Then replace the existing `GET /` branch in `createOrbitServer`'s request handler:

```js
    if (req.method === 'GET' && req.url === '/') {
      if (fs.existsSync(WEB_DIST_DIR) && serveStatic(req, res)) {
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>Orbit</title><body>Orbit backend running.</body>');
      return;
    }
```

And add a new branch (before the final `res.writeHead(404)`) so bundled JS/CSS assets are served too:

```js
    if (req.method === 'GET' && fs.existsSync(WEB_DIST_DIR) && serveStatic(req, res)) {
      return;
    }
```

- [ ] **Step 4: Run the full backend test suite**

Run: `node --test test/`
Expected: PASS (all existing backend tests, plus the new regression test — `web/dist/` doesn't exist in the test environment unless someone has run the frontend build, so the placeholder path is what's exercised)

- [ ] **Step 5: Manually verify static serving with a real build**

Run: `npm run build --workspace=web`, then `node --test test/server.test.js` again to confirm the placeholder-fallback test still passes for a fresh `createOrbitServer` (it only checks `GET /` returns 200 with either the built page or the placeholder — if you want to specifically confirm the built page is served now, temporarily `curl localhost:<port>/` after starting `orbit` for real and check the response contains the Vite-built `<div id="root">` markup instead of "Orbit backend running").

- [ ] **Step 6: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "feat: serve built frontend from web/dist with placeholder fallback"
```

---

## Task 15: End-to-end manual verification and README update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–14

- [ ] **Step 1: Run the full test suite (backend + frontend)**

Run: `node --test test/ && npm test --workspace=web`
Expected: PASS across both suites

- [ ] **Step 2: Full manual acceptance pass**

Run `npm run build --workspace=web` then `node bin/orbit claude` and, while driving a real Claude Code session against this repo, manually confirm each of the following (per the parent spec's section 6 acceptance checklist):

- Idle Universe renders before any prompt is submitted
- `mission_start` wakes the central star when a prompt is submitted
- Reading a file adds/updates a satellite; re-reading the same file blinks it instead of duplicating
- Editing a file lights up the corresponding satellite
- Running a shell command launches a ship; running a test command launches a distinct ship
- Test results render a pass/fail dot ring
- A search triggers a radar ping
- Staying idle/waiting for >3s fades in the nebula; it's gone again once activity resumes
- The Status HUD shows model name, context %, and 5h/7d % with countdowns, refreshing without any visible flicker, and survives a page reload/reconnect without going blank (hydrated from the reconnect `snapshot`'s `lastStatus`)
- The step list's active dot tracks the most recent activity type (reading/editing/testing/planning) and its hover log shows recent event descriptions
- `mission_complete` on `Stop` triggers the central star's supernova-style flash and "MISSION COMPLETE" text, which fades after ~2.5s
- Switching browser tabs away pauses the Three.js render loop (check via browser dev tools' performance/CPU indicator) while the SSE connection stays alive (events still show up immediately when you switch back)
- The tab does not go to sleep/screensaver while active (Wake Lock)

- [ ] **Step 3: Update the README**

Replace the "Status" callout that currently says the frontend isn't built, and add a short "Frontend" section. Edit the existing status blockquote in `README.md` (added in the earlier README revamp commit) from:

```markdown
> **Status:** the 3D visualization frontend described in the
> [design doc](docs/superpowers/specs/2026-09-22-orbit-design.md) is not
> built yet — this repo currently ships the event pipeline it will run on.
> `GET /` serves a placeholder page today.
```

to:

```markdown
> **Status:** both halves are built — the event pipeline and the
> [3D dashboard](docs/superpowers/specs/2026-09-22-orbit-frontend-design.md)
> described in the [design doc](docs/superpowers/specs/2026-09-22-orbit-design.md).
> Run `npm run build --workspace=web` before using `orbit` so `GET /` serves
> the real dashboard instead of the plain-text placeholder.
```

Add, after the existing "## Development" section:

```markdown
## Building the frontend

    npm run build --workspace=web

This bundles the React Three Fiber dashboard into `web/dist/`, which
`orbit`'s server serves at `GET /`. Without a build, `GET /` falls back to
a plain-text placeholder — the backend and its tests never require a
frontend build to exist.

For live-reload frontend development, run `npm run dev --workspace=web` in
one terminal and `orbit claude [args...]` in another; the dashboard's dev
server proxies `/events` and `/event` to the running backend.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the frontend build and update status"
```
