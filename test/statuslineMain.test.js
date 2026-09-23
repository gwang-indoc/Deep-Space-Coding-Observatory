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
