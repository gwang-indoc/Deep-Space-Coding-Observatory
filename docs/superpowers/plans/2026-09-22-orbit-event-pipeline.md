# Orbit Event Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend half of Orbit — a CLI (`orbit claude [args...]`) that wraps `claude` as a child process, captures its activity via session-scoped hooks, and exposes it as a local HTTP+SSE event stream that a browser (built in a separate plan) can consume.

**Architecture:** `orbit` spawns `claude` with an inline `--settings` JSON that wires `UserPromptSubmit`/`PreToolUse`/`PostToolUse`/`Notification`/`Stop` hooks and a `statusLine` command to two small scripts (`orbit-notify`, `orbit-statusline`). Those scripts read the hook's stdin JSON, map it to Orbit's own event schema, and POST it to a local Node HTTP server, which rebroadcasts it to any connected browser tab over Server-Sent Events. Nothing is written to `~/.claude/settings.json` or any project settings file — the hook wiring lives only in the `--settings` argument of this one child process.

**Tech Stack:** Node.js (>=20), zero runtime dependencies — built-in `http`/`net`/`child_process` modules for the server and CLI, built-in `node:test` + `node:assert/strict` for tests.

**Spec:** `docs/superpowers/specs/2026-09-22-orbit-design.md` (sections 1–3 and 5 cover this plan; sections 4 and the Status HUD rendering are covered by a separate frontend plan).

## Global Constraints

- Node.js >= 20 required (native test runner, stable top-level `await`, ESM).
- Zero new npm dependencies for this plan — everything is built on Node's standard library.
- Default port is 4321 (per spec); `findFreePort` falls back to an OS-assigned ephemeral port on `EADDRINUSE`.
- `orbit-notify` and `orbit-statusline` must never throw uncaught and must always exit 0 — a broken visualization layer must never break the wrapped Claude Code session.
- Repo layout for this plan is a single root `package.json` (no npm workspaces yet). The frontend plan will add a `web/` package and introduce workspaces at that point — do not set them up here.
- The design spec's `status_update` payload example (`fiveHour: {used, limit}`) is illustrative; this plan implements it against Claude Code's actual documented statusLine schema, which exposes percentages and reset timestamps directly (`rate_limits.five_hour.used_percentage`, `rate_limits.five_hour.resets_at`), not raw used/limit counts. The event payload is `{ model, contextPct, fiveHourPct, fiveHourResetsAt, sevenDayPct, sevenDayResetsAt }`.
- `TodoWrite`'s `tool_input.todos` item shape (`content`/`status` fields) is Orbit's best inference from Claude Code's conventional todo-list schema — it is not in the official hooks reference. Task 9 includes a manual step to verify this against a real transcript and adjust `normalizeTodos` if the real field names differ.

---

## Task 1: Port finder + project scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/portFinder.js`
- Test: `test/portFinder.test.js`

**Interfaces:**
- Produces: `findFreePort(preferredPort: number): Promise<number>` from `src/portFinder.js`

- [ ] **Step 1: Scaffold the package**

Create `package.json`:

```json
{
  "name": "orbit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "bin": {
    "orbit": "./bin/orbit",
    "orbit-notify": "./bin/orbit-notify",
    "orbit-statusline": "./bin/orbit-statusline"
  },
  "scripts": {
    "test": "node --test test/"
  }
}
```

Create `.gitignore`:

```
node_modules/
*.log
```

- [ ] **Step 2: Write the failing test**

```js
// test/portFinder.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { findFreePort } from '../src/portFinder.js';

test('returns the preferred port when it is free', async () => {
  const port = await findFreePort(0); // port 0 = OS assigns a free port, always "free"
  assert.equal(typeof port, 'number');
  assert.ok(port > 0);
});

test('falls back to a different port when the preferred one is taken', async () => {
  const occupier = net.createServer();
  await new Promise((resolve) => occupier.listen(0, '127.0.0.1', resolve));
  const occupiedPort = occupier.address().port;

  const fallbackPort = await findFreePort(occupiedPort);

  assert.notEqual(fallbackPort, 0);
  assert.notEqual(fallbackPort, occupiedPort);

  await new Promise((resolve) => occupier.close(resolve));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/portFinder.test.js`
Expected: FAIL with `Cannot find module '../src/portFinder.js'`

- [ ] **Step 4: Write minimal implementation**

```js
// src/portFinder.js
import net from 'node:net';

export function findFreePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code !== 'EADDRINUSE') {
        reject(err);
        return;
      }
      const fallback = net.createServer();
      fallback.once('error', reject);
      fallback.listen(0, '127.0.0.1', () => {
        const { port } = fallback.address();
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/portFinder.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore src/portFinder.js test/portFinder.test.js
git commit -m "feat: add orbit package scaffold and port finder"
```

---

## Task 2: Hook event mapper

**Files:**
- Create: `src/hookMapper.js`
- Test: `test/hookMapper.test.js`

**Interfaces:**
- Produces: `mapHookEvent(raw: object): { type: string, ts: number, payload: object } | null` from `src/hookMapper.js`

- [ ] **Step 1: Write the failing test**

```js
// test/hookMapper.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapHookEvent } from '../src/hookMapper.js';

test('UserPromptSubmit maps to mission_start', () => {
  const event = mapHookEvent({ hook_event_name: 'UserPromptSubmit', user_prompt: 'fix the bug' });
  assert.equal(event.type, 'mission_start');
  assert.equal(event.payload.prompt, 'fix the bug');
});

test('PreToolUse Read maps to file_read', () => {
  const event = mapHookEvent({
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: 'src/auth/session.ts' },
  });
  assert.deepEqual(event, { type: 'file_read', ts: event.ts, payload: { file: 'src/auth/session.ts' } });
});

test('PreToolUse Grep and Glob map to search', () => {
  for (const tool_name of ['Grep', 'Glob']) {
    const event = mapHookEvent({ hook_event_name: 'PreToolUse', tool_name, tool_input: {} });
    assert.equal(event.type, 'search');
  }
});

test('PreToolUse Edit and Write map to file_edit', () => {
  for (const tool_name of ['Edit', 'Write']) {
    const event = mapHookEvent({
      hook_event_name: 'PreToolUse',
      tool_name,
      tool_input: { file_path: 'src/x.ts' },
    });
    assert.equal(event.type, 'file_edit');
    assert.equal(event.payload.file, 'src/x.ts');
  }
});

test('PreToolUse Bash without test keywords maps to run_command', () => {
  const event = mapHookEvent({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "wip"' },
  });
  assert.equal(event.type, 'run_command');
});

test('PreToolUse Bash with test keywords maps to run_tests', () => {
  for (const command of ['npm test', 'pytest -x', 'npx vitest run', 'go test ./...']) {
    const event = mapHookEvent({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
    assert.equal(event.type, 'run_tests', `expected run_tests for "${command}"`);
  }
});

test('PreToolUse TodoWrite maps to planet_sync with normalized todos', () => {
  const event = mapHookEvent({
    hook_event_name: 'PreToolUse',
    tool_name: 'TodoWrite',
    tool_input: {
      todos: [
        { content: 'Read auth.ts', status: 'completed' },
        { content: 'Fix timeout', status: 'in_progress' },
      ],
    },
  });
  assert.equal(event.type, 'planet_sync');
  assert.deepEqual(event.payload.todos, [
    { id: '0', text: 'Read auth.ts', status: 'completed' },
    { id: '1', text: 'Fix timeout', status: 'in_progress' },
  ]);
});

test('PreToolUse for an unmapped tool returns null', () => {
  const event = mapHookEvent({ hook_event_name: 'PreToolUse', tool_name: 'WebFetch', tool_input: {} });
  assert.equal(event, null);
});

test('PostToolUse Bash test run with passing output maps to test_result', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_result: '47 passed, 0 failed',
  });
  assert.equal(event.type, 'test_result');
  assert.deepEqual(event.payload, { passed: 47, failed: 0 });
});

test('PostToolUse Bash non-test command returns null', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    tool_result: 'file1\nfile2',
  });
  assert.equal(event, null);
});

test('Notification maps to waiting', () => {
  const event = mapHookEvent({ hook_event_name: 'Notification', message: 'Waiting for input' });
  assert.equal(event.type, 'waiting');
  assert.equal(event.payload.message, 'Waiting for input');
});

test('Stop maps to mission_complete', () => {
  const event = mapHookEvent({ hook_event_name: 'Stop' });
  assert.equal(event.type, 'mission_complete');
});

test('unknown hook_event_name returns null', () => {
  assert.equal(mapHookEvent({ hook_event_name: 'PostToolUseFailure' }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/hookMapper.test.js`
Expected: FAIL with `Cannot find module '../src/hookMapper.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/hookMapper.js
const TEST_COMMAND_PATTERN = /\b(test|jest|pytest|vitest|rspec)\b|go test/i;

function classifyBash(command) {
  return TEST_COMMAND_PATTERN.test(command || '') ? 'run_tests' : 'run_command';
}

function normalizeTodos(todos) {
  if (!Array.isArray(todos)) return [];
  return todos.map((item, index) => ({
    id: String(item.id ?? index),
    text: item.content ?? item.text ?? '',
    status: item.status ?? 'pending',
  }));
}

function parseTestResult(resultText) {
  const text = String(resultText ?? '');
  const passedMatch = text.match(/(\d+)\s+(?:passed|passing)/i);
  const failedMatch = text.match(/(\d+)\s+(?:failed|failing)/i);
  if (passedMatch || failedMatch) {
    return {
      passed: passedMatch ? Number(passedMatch[1]) : 0,
      failed: failedMatch ? Number(failedMatch[1]) : 0,
    };
  }
  return /fail/i.test(text) ? { passed: 0, failed: 1 } : { passed: 1, failed: 0 };
}

export function mapHookEvent(raw) {
  const ts = Date.now();

  switch (raw?.hook_event_name) {
    case 'UserPromptSubmit':
      return { type: 'mission_start', ts, payload: { prompt: raw.user_prompt ?? '' } };

    case 'PreToolUse': {
      const toolName = raw.tool_name;
      const toolInput = raw.tool_input ?? {};

      if (toolName === 'Read') {
        return { type: 'file_read', ts, payload: { file: toolInput.file_path ?? '' } };
      }
      if (toolName === 'Grep' || toolName === 'Glob') {
        return { type: 'search', ts, payload: {} };
      }
      if (toolName === 'Edit' || toolName === 'Write') {
        return { type: 'file_edit', ts, payload: { file: toolInput.file_path ?? '' } };
      }
      if (toolName === 'Bash') {
        return { type: classifyBash(toolInput.command), ts, payload: { command: toolInput.command ?? '' } };
      }
      if (toolName === 'TodoWrite') {
        return { type: 'planet_sync', ts, payload: { todos: normalizeTodos(toolInput.todos) } };
      }
      return null;
    }

    case 'PostToolUse': {
      const toolName = raw.tool_name;
      const toolInput = raw.tool_input ?? {};
      if (toolName === 'Bash' && classifyBash(toolInput.command) === 'run_tests') {
        return { type: 'test_result', ts, payload: parseTestResult(raw.tool_result) };
      }
      return null;
    }

    case 'Notification':
      return { type: 'waiting', ts, payload: { message: raw.message ?? '' } };

    case 'Stop':
      return { type: 'mission_complete', ts, payload: {} };

    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/hookMapper.test.js`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/hookMapper.js test/hookMapper.test.js
git commit -m "feat: map Claude Code hook payloads to Orbit events"
```

---

## Task 3: Statusline mapper

**Files:**
- Create: `src/statuslineMapper.js`
- Test: `test/statuslineMapper.test.js`

**Interfaces:**
- Produces: `mapStatuslineEvent(raw: object): { type: 'status_update', ts: number, payload: object }` from `src/statuslineMapper.js`

- [ ] **Step 1: Write the failing test**

```js
// test/statuslineMapper.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapStatuslineEvent } from '../src/statuslineMapper.js';

test('maps a full statusline payload to status_update', () => {
  const event = mapStatuslineEvent({
    model: { id: 'claude-sonnet-5', display_name: 'Sonnet 5' },
    context_window: { used_percentage: 42.4 },
    rate_limits: {
      five_hour: { used_percentage: 61.9, resets_at: 1758560000 },
      seven_day: { used_percentage: 31.2, resets_at: 1758990000 },
    },
  });

  assert.equal(event.type, 'status_update');
  assert.deepEqual(event.payload, {
    model: 'Sonnet 5',
    contextPct: 42,
    fiveHourPct: 62,
    fiveHourResetsAt: 1758560000,
    sevenDayPct: 31,
    sevenDayResetsAt: 1758990000,
  });
});

test('defaults missing fields instead of throwing', () => {
  const event = mapStatuslineEvent({});
  assert.deepEqual(event.payload, {
    model: 'unknown',
    contextPct: 0,
    fiveHourPct: 0,
    fiveHourResetsAt: null,
    sevenDayPct: 0,
    sevenDayResetsAt: null,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/statuslineMapper.test.js`
Expected: FAIL with `Cannot find module '../src/statuslineMapper.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/statuslineMapper.js
export function mapStatuslineEvent(raw) {
  return {
    type: 'status_update',
    ts: Date.now(),
    payload: {
      model: raw?.model?.display_name ?? 'unknown',
      contextPct: Math.round(raw?.context_window?.used_percentage ?? 0),
      fiveHourPct: Math.round(raw?.rate_limits?.five_hour?.used_percentage ?? 0),
      fiveHourResetsAt: raw?.rate_limits?.five_hour?.resets_at ?? null,
      sevenDayPct: Math.round(raw?.rate_limits?.seven_day?.used_percentage ?? 0),
      sevenDayResetsAt: raw?.rate_limits?.seven_day?.resets_at ?? null,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/statuslineMapper.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/statuslineMapper.js test/statuslineMapper.test.js
git commit -m "feat: map Claude Code statusline payload to status_update event"
```

---

## Task 4: In-memory state + HTTP/SSE server

**Files:**
- Create: `src/state.js`
- Create: `src/server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses only Node built-ins)
- Produces:
  - `createInitialState(): { todos: [], missionActive: boolean, lastStatus: object|null }` from `src/state.js`
  - `applyEvent(state, event): state` from `src/state.js`
  - `snapshotEvent(state): { type: 'snapshot', ts: number, payload: object }` from `src/state.js`
  - `createOrbitServer(port: number): Promise<{ server: http.Server, port: number, close: () => Promise<void> }>` from `src/server.js`

- [ ] **Step 1: Write the failing test**

```js
// test/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createOrbitServer } from '../src/server.js';

function postEvent(port, event) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(event);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/event',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function collectSseEvents(port, count) {
  return new Promise((resolve, reject) => {
    const events = [];
    const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          events.push(JSON.parse(raw.replace(/^data: /, '')));
          if (events.length === count) {
            res.destroy();
            resolve(events);
          }
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

test('sends a snapshot first, then broadcasts posted events', async () => {
  const { port, close } = await createOrbitServer(0);
  const collected = collectSseEvents(port, 2);
  await new Promise((resolve) => setTimeout(resolve, 20)); // let the SSE client connect first

  await postEvent(port, { type: 'file_read', ts: Date.now(), payload: { file: 'a.ts' } });

  const events = await collected;
  assert.equal(events[0].type, 'snapshot');
  assert.equal(events[1].type, 'file_read');
  assert.equal(events[1].payload.file, 'a.ts');

  await close();
});

test('a snapshot reflects prior planet_sync and status_update events', async () => {
  const { port, close } = await createOrbitServer(0);

  await postEvent(port, {
    type: 'planet_sync',
    ts: Date.now(),
    payload: { todos: [{ id: '1', text: 'Fix bug', status: 'in_progress' }] },
  });
  await postEvent(port, {
    type: 'status_update',
    ts: Date.now(),
    payload: { model: 'Sonnet 5', contextPct: 10, fiveHourPct: 5, fiveHourResetsAt: null, sevenDayPct: 2, sevenDayResetsAt: null },
  });

  const [snapshot] = await collectSseEvents(port, 1);
  assert.equal(snapshot.type, 'snapshot');
  assert.deepEqual(snapshot.payload.todos, [{ id: '1', text: 'Fix bug', status: 'in_progress' }]);
  assert.equal(snapshot.payload.lastStatus.model, 'Sonnet 5');

  await close();
});

test('rejects a POST /event with an unknown type', async () => {
  const { port, close } = await createOrbitServer(0);
  const status = await postEvent(port, { type: 'not_a_real_type', ts: Date.now(), payload: {} });
  assert.equal(status, 400);
  await close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL with `Cannot find module '../src/server.js'`

- [ ] **Step 3: Write minimal implementation**

```js
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
```

```js
// src/server.js
import http from 'node:http';
import { createInitialState, applyEvent, snapshotEvent } from './state.js';

const KNOWN_EVENT_TYPES = new Set([
  'file_read',
  'search',
  'file_edit',
  'run_command',
  'run_tests',
  'test_result',
  'planet_sync',
  'waiting',
  'mission_start',
  'mission_complete',
  'status_update',
]);

export function createOrbitServer(port) {
  const state = createInitialState();
  const clients = new Set();

  function broadcast(event) {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      res.write(line);
    }
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>Orbit</title><body>Orbit backend running.</body>');
      return;
    }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(snapshotEvent(state))}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'POST' && req.url === '/event') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const event = JSON.parse(body);
          if (!event || !KNOWN_EVENT_TYPES.has(event.type)) {
            res.writeHead(400);
            res.end();
            return;
          }
          applyEvent(state, event);
          broadcast(event);
          res.writeHead(204);
          res.end();
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/state.js src/server.js test/server.test.js
git commit -m "feat: add in-memory state and HTTP/SSE event server"
```

---

## Task 5: Inline settings builder

**Files:**
- Create: `src/settingsBuilder.js`
- Test: `test/settingsBuilder.test.js`

**Interfaces:**
- Produces: `buildInlineSettings({ notifyPath: string, statuslinePath: string }): string` from `src/settingsBuilder.js`

- [ ] **Step 1: Write the failing test**

```js
// test/settingsBuilder.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInlineSettings } from '../src/settingsBuilder.js';

test('builds hooks for all five events plus a statusLine command', () => {
  const json = buildInlineSettings({ notifyPath: '/bin/orbit-notify', statuslinePath: '/bin/orbit-statusline' });
  const settings = JSON.parse(json);

  for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop']) {
    assert.ok(settings.hooks[event], `missing hook config for ${event}`);
    const [entry] = settings.hooks[event];
    assert.equal(entry.hooks[0].type, 'command');
    assert.equal(entry.hooks[0].command, '/bin/orbit-notify');
  }

  assert.equal(settings.hooks.PreToolUse[0].matcher, '*');
  assert.equal(settings.hooks.PostToolUse[0].matcher, '*');
  assert.equal(settings.hooks.UserPromptSubmit[0].matcher, undefined);

  assert.deepEqual(settings.statusLine, { type: 'command', command: '/bin/orbit-statusline' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/settingsBuilder.test.js`
Expected: FAIL with `Cannot find module '../src/settingsBuilder.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/settingsBuilder.js
function commandHook(path) {
  return { type: 'command', command: path };
}

export function buildInlineSettings({ notifyPath, statuslinePath }) {
  const matched = { matcher: '*', hooks: [commandHook(notifyPath)] };
  const unmatched = { hooks: [commandHook(notifyPath)] };

  return JSON.stringify({
    hooks: {
      UserPromptSubmit: [unmatched],
      PreToolUse: [matched],
      PostToolUse: [matched],
      Notification: [unmatched],
      Stop: [unmatched],
    },
    statusLine: commandHook(statuslinePath),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/settingsBuilder.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/settingsBuilder.js test/settingsBuilder.test.js
git commit -m "feat: build inline --settings JSON for orbit hooks"
```

---

## Task 6: `orbit-notify` hook script

**Files:**
- Create: `src/readStdin.js`
- Create: `src/httpPost.js`
- Create: `src/notifyMain.js`
- Create: `bin/orbit-notify`
- Test: `test/notifyMain.test.js`

**Interfaces:**
- Consumes: `mapHookEvent` from `src/hookMapper.js` (Task 2)
- Produces:
  - `readStdin(stream: Readable): Promise<string>` from `src/readStdin.js`
  - `postJson(port: number, path: string, bodyObj: object): Promise<void>` from `src/httpPost.js` (never rejects)
  - `runNotify({ stdin: Readable, env: object }): Promise<void>` from `src/notifyMain.js`

- [ ] **Step 1: Write the failing test**

```js
// test/notifyMain.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { runNotify } from '../src/notifyMain.js';

test('reads stdin, maps the hook event, and POSTs it to ORBIT_PORT', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.writeHead(204);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const stdin = Readable.from([JSON.stringify({ hook_event_name: 'UserPromptSubmit', user_prompt: 'fix bug' })]);
  await runNotify({ stdin, env: { ORBIT_PORT: String(port) } });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'mission_start');
  assert.equal(received[0].payload.prompt, 'fix bug');

  await new Promise((resolve) => server.close(resolve));
});

test('does nothing when ORBIT_PORT is not set', async () => {
  const stdin = Readable.from([JSON.stringify({ hook_event_name: 'Stop' })]);
  await assert.doesNotReject(runNotify({ stdin, env: {} }));
});

test('does nothing when the hook maps to null', async () => {
  const stdin = Readable.from([JSON.stringify({ hook_event_name: 'PostToolUseFailure' })]);
  await assert.doesNotReject(runNotify({ stdin, env: { ORBIT_PORT: '1' } }));
});

test('swallows malformed JSON on stdin without throwing', async () => {
  const stdin = Readable.from(['not json']);
  await assert.doesNotReject(runNotify({ stdin, env: { ORBIT_PORT: '1' } }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/notifyMain.test.js`
Expected: FAIL with `Cannot find module '../src/notifyMain.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/readStdin.js
export async function readStdin(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString('utf8');
}
```

```js
// src/httpPost.js
import http from 'node:http';

export function postJson(port, path, bodyObj) {
  return new Promise((resolve) => {
    const body = JSON.stringify(bodyObj);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve();
      }
    );
    req.on('error', () => resolve());
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });
    req.write(body);
    req.end();
  });
}
```

```js
// src/notifyMain.js
import { readStdin } from './readStdin.js';
import { postJson } from './httpPost.js';
import { mapHookEvent } from './hookMapper.js';

export async function runNotify({ stdin, env }) {
  try {
    const raw = await readStdin(stdin);
    if (!raw.trim()) return;

    const parsed = JSON.parse(raw);
    const event = mapHookEvent(parsed);
    if (!event) return;

    const port = Number(env.ORBIT_PORT);
    if (!port) return;

    await postJson(port, '/event', event);
  } catch {
    // observe-only hook: never let a mapping/network failure affect the wrapped Claude Code session
  }
}
```

```js
#!/usr/bin/env node
// bin/orbit-notify
import { runNotify } from '../src/notifyMain.js';

await runNotify({ stdin: process.stdin, env: process.env });
process.exit(0);
```

- [ ] **Step 4: Make the script executable**

Run: `chmod +x bin/orbit-notify`

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/notifyMain.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/readStdin.js src/httpPost.js src/notifyMain.js bin/orbit-notify test/notifyMain.test.js
git commit -m "feat: add orbit-notify hook script"
```

---

## Task 7: `orbit-statusline` hook script

**Files:**
- Create: `src/statuslineMain.js`
- Create: `bin/orbit-statusline`
- Test: `test/statuslineMain.test.js`

**Interfaces:**
- Consumes: `mapStatuslineEvent` from `src/statuslineMapper.js` (Task 3), `readStdin` from `src/readStdin.js` and `postJson` from `src/httpPost.js` (Task 6)
- Produces: `runStatusline({ stdin: Readable, env: object }): Promise<void>` from `src/statuslineMain.js`

- [ ] **Step 1: Write the failing test**

```js
// test/statuslineMain.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { runStatusline } from '../src/statuslineMain.js';

test('reads stdin, maps the statusline payload, and POSTs it to ORBIT_PORT', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push(JSON.parse(body));
      res.writeHead(204);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const stdin = Readable.from([
    JSON.stringify({ model: { display_name: 'Sonnet 5' }, context_window: { used_percentage: 12 } }),
  ]);
  await runStatusline({ stdin, env: { ORBIT_PORT: String(port) } });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'status_update');
  assert.equal(received[0].payload.model, 'Sonnet 5');
  assert.equal(received[0].payload.contextPct, 12);

  await new Promise((resolve) => server.close(resolve));
});

test('does nothing when ORBIT_PORT is not set', async () => {
  const stdin = Readable.from([JSON.stringify({})]);
  await assert.doesNotReject(runStatusline({ stdin, env: {} }));
});

test('swallows malformed JSON on stdin without throwing', async () => {
  const stdin = Readable.from(['not json']);
  await assert.doesNotReject(runStatusline({ stdin, env: { ORBIT_PORT: '1' } }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/statuslineMain.test.js`
Expected: FAIL with `Cannot find module '../src/statuslineMain.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/statuslineMain.js
import { readStdin } from './readStdin.js';
import { postJson } from './httpPost.js';
import { mapStatuslineEvent } from './statuslineMapper.js';

export async function runStatusline({ stdin, env }) {
  try {
    const raw = await readStdin(stdin);
    if (!raw.trim()) return;

    const parsed = JSON.parse(raw);
    const event = mapStatuslineEvent(parsed);

    const port = Number(env.ORBIT_PORT);
    if (!port) return;

    await postJson(port, '/event', event);
  } catch {
    // never let a mapping/network failure affect the wrapped Claude Code session
  }
}
```

```js
#!/usr/bin/env node
// bin/orbit-statusline
import { runStatusline } from '../src/statuslineMain.js';

await runStatusline({ stdin: process.stdin, env: process.env });
process.exit(0);
```

- [ ] **Step 4: Make the script executable**

Run: `chmod +x bin/orbit-statusline`

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/statuslineMain.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/statuslineMain.js bin/orbit-statusline test/statuslineMain.test.js
git commit -m "feat: add orbit-statusline hook script"
```

---

## Task 8: `orbit` CLI

**Files:**
- Create: `src/cliMain.js`
- Create: `bin/orbit`
- Test: `test/cliMain.test.js`

**Interfaces:**
- Consumes: `findFreePort` (Task 1), `createOrbitServer` (Task 4), `buildInlineSettings` (Task 5)
- Produces: `runOrbit(argv: string[], opts?: { claudeBin?: string, openBrowserFn?: (url: string) => void }): Promise<number>` from `src/cliMain.js`

- [ ] **Step 1: Write the failing test**

```js
// test/cliMain.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runOrbit } from '../src/cliMain.js';

test('rejects a call that does not start with "claude" and does nothing else', async () => {
  let opened = false;
  const exitCode = await runOrbit(['notclaude'], { openBrowserFn: () => { opened = true; } });
  assert.equal(exitCode, 1);
  assert.equal(opened, false);
});

test('spawns claude with inline --settings, forwards args, and propagates exit code', async () => {
  const outFile = path.join(os.tmpdir(), `orbit-fixture-out-${Date.now()}.json`);
  const fixtureScript = path.join(os.tmpdir(), `orbit-fake-claude-${Date.now()}.mjs`);
  fs.writeFileSync(
    fixtureScript,
    [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      `fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ argv: process.argv.slice(2), port: process.env.ORBIT_PORT }));`,
      'process.exit(7);',
      '',
    ].join('\n')
  );
  fs.chmodSync(fixtureScript, 0o755);

  let openedUrl = null;
  const exitCode = await runOrbit(['claude', '-p', 'hello'], {
    claudeBin: fixtureScript,
    openBrowserFn: (url) => {
      openedUrl = url;
    },
  });

  assert.equal(exitCode, 7);
  assert.match(openedUrl, /^http:\/\/localhost:\d+\/$/);

  const recorded = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(recorded.argv[0], '--settings');
  assert.equal(recorded.argv[2], '-p');
  assert.equal(recorded.argv[3], 'hello');

  const settings = JSON.parse(recorded.argv[1]);
  assert.equal(settings.hooks.PreToolUse[0].matcher, '*');
  assert.ok(settings.hooks.Stop[0].hooks[0].command.endsWith('orbit-notify'));
  assert.ok(settings.statusLine.command.endsWith('orbit-statusline'));

  const portInUrl = openedUrl.match(/:(\d+)\//)[1];
  assert.equal(recorded.port, portInUrl);

  fs.unlinkSync(outFile);
  fs.unlinkSync(fixtureScript);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cliMain.test.js`
Expected: FAIL with `Cannot find module '../src/cliMain.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/cliMain.js
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFreePort } from './portFinder.js';
import { createOrbitServer } from './server.js';
import { buildInlineSettings } from './settingsBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 4321;

function defaultOpenBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(command, platform === 'win32' ? ['', url] : [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // best-effort only: failing to open a browser must never block the Claude Code session
  }
}

export async function runOrbit(argv, { claudeBin = 'claude', openBrowserFn = defaultOpenBrowser } = {}) {
  if (argv[0] !== 'claude') {
    console.error('orbit: expected "orbit claude [args...]"');
    return 1;
  }
  const claudeArgs = argv.slice(1);

  const port = await findFreePort(DEFAULT_PORT);
  const { close } = await createOrbitServer(port);

  const notifyPath = path.join(__dirname, '..', 'bin', 'orbit-notify');
  const statuslinePath = path.join(__dirname, '..', 'bin', 'orbit-statusline');
  const settings = buildInlineSettings({ notifyPath, statuslinePath });

  openBrowserFn(`http://localhost:${port}/`);

  const exitCode = await new Promise((resolve) => {
    const child = spawn(claudeBin, ['--settings', settings, ...claudeArgs], {
      stdio: 'inherit',
      env: { ...process.env, ORBIT_PORT: String(port) },
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  await close();
  return exitCode;
}
```

```js
#!/usr/bin/env node
// bin/orbit
import { runOrbit } from '../src/cliMain.js';

const exitCode = await runOrbit(process.argv.slice(2));
process.exit(exitCode);
```

- [ ] **Step 4: Make the script executable**

Run: `chmod +x bin/orbit`

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/cliMain.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/cliMain.js bin/orbit test/cliMain.test.js
git commit -m "feat: add orbit CLI entry point"
```

---

## Task 9: End-to-end verification, TodoWrite schema check, and README

**Files:**
- Create: `README.md` update (usage section)
- Test: manual (no new automated test)

**Interfaces:**
- Consumes: everything from Tasks 1–8

- [ ] **Step 1: Run the full test suite**

Run: `node --test test/`
Expected: PASS (all tests from Tasks 1–8)

- [ ] **Step 2: Manual smoke test with the real `claude` CLI**

Run a real session to confirm the wiring works end to end:

```bash
npm link   # or: node bin/orbit claude -p "list the files in this repo"
```

While it runs, in a second terminal, confirm the browser opened `http://localhost:4321/` and shows "Orbit backend running." (the real scene is out of scope for this plan). Confirm the process exits cleanly and the port is released afterward (`lsof -i :4321` should show nothing once `claude` exits).

- [ ] **Step 3: Verify the TodoWrite payload shape against a real transcript**

Run a task that causes Claude Code to call `TodoWrite` (e.g. `orbit claude -p "make a 3-step todo list for refactoring auth, then stop"`), and inspect the transcript at the `transcript_path` reported in the hook JSON (or add a temporary `console.error(JSON.stringify(parsed))` in a local copy of `src/notifyMain.js` before the `mapHookEvent` call, run once, then remove it). Confirm the real `tool_input.todos` items use `content` and `status` fields as assumed in `normalizeTodos` (`src/hookMapper.js`). If the real field names differ, update `normalizeTodos` and its test in `test/hookMapper.test.js` to match, and re-run `node --test test/hookMapper.test.js`.

- [ ] **Step 4: Document usage**

Add to `README.md`:

```markdown
# Deep-Space-Coding-Observatory (Orbit)

Orbit wraps `claude` and exposes its activity as a local event stream for a
future browser-based visualization.

## Usage

    orbit claude [any claude arguments]

This starts a local HTTP+SSE server (default port 4321, falls back to a
free port if taken), opens a browser tab, and spawns `claude` with the same
arguments. Nothing is written to your persistent Claude Code settings —
the hook wiring only exists for the lifetime of this one process.

## Development

    npm test
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document orbit CLI usage"
```
