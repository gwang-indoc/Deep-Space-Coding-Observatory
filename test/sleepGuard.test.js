// test/sleepGuard.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSleepGuard } from '../src/sleepGuard.js';

function fakeSpawn() {
  const calls = [];
  const spawn = (cmd, args) => {
    const child = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    calls.push({ cmd, args, child });
    return child;
  };
  return { spawn, calls };
}

test('runs caffeinate on macOS while viewers are connected, tied to this pid', () => {
  const { spawn, calls } = fakeSpawn();
  const guard = createSleepGuard({ platform: 'darwin', spawn, pid: 4242 });
  guard.update(1);
  guard.update(2); // a second tab reuses the same caffeinate
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'caffeinate');
  assert.deepEqual(calls[0].args, ['-d', '-i', '-w', '4242']);
});

test('stops caffeinate when the last viewer disconnects', () => {
  const { spawn, calls } = fakeSpawn();
  const guard = createSleepGuard({ platform: 'darwin', spawn, pid: 1 });
  guard.update(1);
  guard.update(0);
  assert.equal(calls[0].child.killed, true);
  guard.update(1);
  assert.equal(calls.length, 2);
});

test('respawns if caffeinate exits on its own', () => {
  const { spawn, calls } = fakeSpawn();
  const guard = createSleepGuard({ platform: 'darwin', spawn, pid: 1 });
  guard.update(1);
  calls[0].child.emit('exit', 0);
  guard.update(1);
  assert.equal(calls.length, 2);
});

test('does nothing off macOS', () => {
  const { spawn, calls } = fakeSpawn();
  const guard = createSleepGuard({ platform: 'linux', spawn, pid: 1 });
  guard.update(1);
  assert.equal(calls.length, 0);
});

test('survives a spawn error (missing binary)', () => {
  const guard = createSleepGuard({
    platform: 'darwin',
    spawn: () => {
      throw new Error('ENOENT');
    },
    pid: 1,
  });
  assert.doesNotThrow(() => guard.update(1));
});
