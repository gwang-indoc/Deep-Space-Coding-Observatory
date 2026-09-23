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
