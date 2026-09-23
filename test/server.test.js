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
