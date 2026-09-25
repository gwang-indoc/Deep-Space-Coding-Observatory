// test/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createOrbitServer, isAcceptedTranscriptPath } from '../src/server.js';

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

test('tells the sleep guard how many dashboards are connected', async () => {
  const counts = [];
  let released = false;
  const sleepGuard = { update: (n) => counts.push(n), release: () => { released = true; } };
  const { port, close } = await createOrbitServer(0, { sleepGuard });

  await collectSseEvents(port, 1); // connects, reads the snapshot, disconnects
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(counts, [1, 0]);

  await close();
  assert.equal(released, true);
});

function makeConfigDir() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-config-'));
  fs.mkdirSync(path.join(configDir, 'projects', 'p'), { recursive: true });
  return configDir;
}

function transcriptLine(text, uuid) {
  return JSON.stringify({ type: 'assistant', uuid, message: { content: [{ type: 'text', text }] } }) + '\n';
}

async function snapshotOf(port) {
  const [snapshot] = await collectSseEvents(port, 1);
  return snapshot;
}

test('isAcceptedTranscriptPath only accepts .jsonl files under <configDir>/projects', () => {
  const configDir = '/home/me/.claude';
  assert.equal(isAcceptedTranscriptPath('/home/me/.claude/projects/p/s.jsonl', configDir), true);
  assert.equal(isAcceptedTranscriptPath('/home/me/.claude/projects/p/s.json', configDir), false);
  assert.equal(isAcceptedTranscriptPath('/home/me/.claude/projects-evil/p/s.jsonl', configDir), false);
  assert.equal(isAcceptedTranscriptPath('/home/me/.claude/projects/../secrets.jsonl', configDir), false);
  assert.equal(isAcceptedTranscriptPath('/etc/passwd', configDir), false);
  assert.equal(isAcceptedTranscriptPath(undefined, configDir), false);
  assert.equal(isAcceptedTranscriptPath(42, configDir), false);
});

test('a posted transcriptPath streams transcript_append after the event itself', async () => {
  const configDir = makeConfigDir();
  const file = path.join(configDir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(file, transcriptLine('hello from claude', 'u1'));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });
  const collected = collectSseEvents(port, 3);
  await new Promise((resolve) => setTimeout(resolve, 20));

  await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: { prompt: 'hi' }, transcriptPath: file });

  const events = await collected;
  assert.deepEqual(events.map((e) => e.type), ['snapshot', 'mission_start', 'transcript_append']);
  assert.equal('transcriptPath' in events[1], false);
  assert.equal(events[2].payload.entries[0].text, 'hello from claude');
  await close();
});

test('the snapshot carries the transcript so a reload keeps it', async () => {
  const configDir = makeConfigDir();
  const file = path.join(configDir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(file, transcriptLine('one', 'u1') + transcriptLine('two', 'u2'));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });

  await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: {}, transcriptPath: file });

  const snapshot = await snapshotOf(port);
  assert.deepEqual(snapshot.payload.transcript.map((e) => e.text), ['one', 'two']);
  await close();
});

test('the transcript buffer keeps only the last 300 entries', async () => {
  const configDir = makeConfigDir();
  const file = path.join(configDir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(file, Array.from({ length: 320 }, (_, i) => transcriptLine(`m${i}`, `u${i}`)).join(''));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });

  await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: {}, transcriptPath: file });

  const { transcript } = (await snapshotOf(port)).payload;
  assert.equal(transcript.length, 300);
  assert.equal(transcript[0].text, 'm20');
  assert.equal(transcript[299].text, 'm319');
  await close();
});

test('repeating the same transcriptPath does not duplicate entries', async () => {
  const configDir = makeConfigDir();
  const file = path.join(configDir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(file, transcriptLine('only once', 'u1'));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });

  await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: {}, transcriptPath: file });
  await postEvent(port, { type: 'search', ts: Date.now(), payload: {}, transcriptPath: file });
  await new Promise((resolve) => setTimeout(resolve, 60));

  const { transcript } = (await snapshotOf(port)).payload;
  assert.deepEqual(transcript.map((e) => e.text), ['only once']);
  await close();
});

test('a transcriptPath outside <configDir>/projects is ignored but the event still applies', async () => {
  const configDir = makeConfigDir();
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-out-')), 's.jsonl');
  fs.writeFileSync(outside, transcriptLine('secret', 'u1'));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });

  const status = await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: {}, transcriptPath: outside });
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(status, 204);
  const snapshot = await snapshotOf(port);
  assert.deepEqual(snapshot.payload.transcript, []);
  assert.equal(snapshot.payload.missionActive, true);
  await close();
});

test('POSTing a transcript_append is rejected', async () => {
  const { port, close } = await createOrbitServer(0, { configDir: makeConfigDir() });
  const status = await postEvent(port, { type: 'transcript_append', ts: Date.now(), payload: { entries: [] } });
  assert.equal(status, 400);
  await close();
});
