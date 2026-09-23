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
