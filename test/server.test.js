// test/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
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

test('a snapshot carries an active waiting state so a reload still shows the prompt', async () => {
  const { port, close } = await createOrbitServer(0);

  await postEvent(port, { type: 'waiting', ts: 5000, payload: { message: 'Claude needs your permission to use Bash' } });

  const [snapshot] = await collectSseEvents(port, 1);
  assert.deepEqual(snapshot.payload.waiting, { since: 5000, message: 'Claude needs your permission to use Bash' });

  await close();
});

test('any activity event clears the waiting state, but a status_update does not', async () => {
  const { port, close } = await createOrbitServer(0);

  await postEvent(port, { type: 'waiting', ts: 5000, payload: { message: 'waiting' } });
  await postEvent(port, {
    type: 'status_update',
    ts: 5100,
    payload: { model: 'Sonnet 5', contextPct: 10, fiveHourPct: 5, fiveHourResetsAt: null, sevenDayPct: 2, sevenDayResetsAt: null },
  });
  let [snapshot] = await collectSseEvents(port, 1);
  assert.equal(snapshot.payload.waiting.since, 5000);

  await postEvent(port, { type: 'file_read', ts: 6000, payload: { file: 'a.ts' } });
  [snapshot] = await collectSseEvents(port, 1);
  assert.equal(snapshot.payload.waiting, null);

  await close();
});

test('a snapshot reports accumulated active time, excluding time spent waiting', async () => {
  const { port, close } = await createOrbitServer(0);

  await postEvent(port, { type: 'mission_start', ts: 1000, payload: {} });
  await postEvent(port, { type: 'file_read', ts: 2000, payload: { file: 'a.ts' } });
  let [snapshot] = await collectSseEvents(port, 1);
  assert.equal(snapshot.payload.activeMs, 0);
  assert.equal(snapshot.payload.activeSince, 1000);

  await postEvent(port, { type: 'waiting', ts: 5000, payload: { message: 'x' } });
  await postEvent(port, { type: 'file_read', ts: 8000, payload: { file: 'b.ts' } });
  await postEvent(port, { type: 'mission_complete', ts: 10000, payload: {} });
  [snapshot] = await collectSseEvents(port, 1);
  assert.equal(snapshot.payload.activeMs, 6000);
  assert.equal(snapshot.payload.activeSince, null);

  await close();
});

test('active time keeps accruing while a background subagent runs after the turn ends', async () => {
  const { port, close } = await createOrbitServer(0);

  await postEvent(port, { type: 'mission_start', ts: 1000, payload: {} });
  await postEvent(port, { type: 'agent_start', ts: 1100, payload: { id: 'a', text: 'A' } });
  await postEvent(port, { type: 'mission_complete', ts: 2000, payload: {} });
  let [snapshot] = await collectSseEvents(port, 1);
  assert.equal(snapshot.payload.activeSince, 1000);

  await postEvent(port, { type: 'agent_end', ts: 6000, payload: { id: 'a', status: 'completed' } });
  [snapshot] = await collectSseEvents(port, 1);
  assert.equal(snapshot.payload.activeMs, 5000);
  assert.equal(snapshot.payload.activeSince, null);

  await close();
});

test('subagent events become planets, and a new prompt clears only the finished ones', async () => {
  const { port, close } = await createOrbitServer(0);

  await postEvent(port, { type: 'mission_start', ts: 1000, payload: { prompt: 'go' } });
  await postEvent(port, { type: 'agent_start', ts: 1100, payload: { id: 'a', text: 'Task A' } });
  await postEvent(port, { type: 'agent_start', ts: 1200, payload: { id: 'b', text: 'Task B' } });
  await postEvent(port, { type: 'agent_end', ts: 1300, payload: { id: 'a', status: 'completed' } });
  let [snapshot] = await collectSseEvents(port, 1);
  assert.deepEqual(snapshot.payload.todos, [
    { id: 'a', text: 'Task A', status: 'completed' },
    { id: 'b', text: 'Task B', status: 'in_progress' },
  ]);

  await postEvent(port, { type: 'mission_complete', ts: 1400, payload: {} });
  await postEvent(port, { type: 'agent_end', ts: 1500, payload: { id: 'b', status: 'completed', resumesMission: true } });
  [snapshot] = await collectSseEvents(port, 1);
  assert.equal(snapshot.payload.missionActive, true);
  assert.equal(snapshot.payload.todos[1].status, 'completed');

  await postEvent(port, { type: 'agent_start', ts: 1600, payload: { id: 'c', text: 'Task C' } });
  await postEvent(port, { type: 'mission_start', ts: 1700, payload: { prompt: 'next' } });
  [snapshot] = await collectSseEvents(port, 1);
  assert.deepEqual(snapshot.payload.todos, [{ id: 'c', text: 'Task C', status: 'in_progress' }]);

  await close();
});

test('rejects a POST /event with an unknown type', async () => {
  const { port, close } = await createOrbitServer(0);
  const status = await postEvent(port, { type: 'not_a_real_type', ts: Date.now(), payload: {} });
  assert.equal(status, 400);
  await close();
});

test('close() resolves promptly even with an open SSE connection (does not hang)', async () => {
  const { port, close } = await createOrbitServer(0);

  // Open an SSE connection and deliberately leave it open -- never destroy the
  // response. A graceful server.close() would wait forever for this connection
  // to end on its own, since SSE responses never end by themselves.
  await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      res.on('data', () => {}); // drain, but never destroy/end the connection
      resolve();
    });
    req.on('error', reject);
  });

  const TIMEOUT = Symbol('timeout');
  const result = await Promise.race([
    close().then(() => 'closed'),
    new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), 500)),
  ]);

  assert.equal(result, 'closed', 'close() should resolve promptly instead of hanging on the open SSE connection');
});

test('GET / falls back to the placeholder when no frontend build exists', async () => {
  const { port, close } = await createOrbitServer(0, { webDistDir: '/nonexistent-web-dist-for-test' });
  try {
    const response = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }).on('error', reject);
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Orbit backend running/);
  } finally {
    await close();
  }
});

test('GET / blocks a sibling-directory traversal attempt outside webDistDir', async () => {
  const os = await import('node:os');
  const fsPromises = await import('node:fs/promises');
  const tmpRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'orbit-traversal-test-'));
  const webDistDir = path.join(tmpRoot, 'dist');
  const siblingDir = path.join(tmpRoot, 'dist-evil');
  await fsPromises.mkdir(webDistDir);
  await fsPromises.mkdir(siblingDir);
  await fsPromises.writeFile(path.join(siblingDir, 'secret.txt'), 'top secret');

  const { port, close } = await createOrbitServer(0, { webDistDir });
  try {
    const response = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/../dist-evil/secret.txt' }, (res) => {
        res.resume();
        res.on('end', () => resolve({ statusCode: res.statusCode }));
      }).on('error', reject);
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await close();
    await fsPromises.rm(tmpRoot, { recursive: true, force: true });
  }
});
