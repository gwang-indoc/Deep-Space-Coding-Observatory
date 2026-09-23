import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postJson } from '../src/httpPost.js';

test('never rejects for a non-integer port (throws synchronously inside http.request)', async () => {
  await assert.doesNotReject(postJson(3.14, '/event', { hello: 'world' }));
});

test('never rejects for a negative port (throws synchronously inside http.request)', async () => {
  await assert.doesNotReject(postJson(-1, '/event', { hello: 'world' }));
});

test('never rejects for an out-of-range port (throws synchronously inside http.request)', async () => {
  await assert.doesNotReject(postJson(70000, '/event', { hello: 'world' }));
});

test('never rejects for a NaN port', async () => {
  await assert.doesNotReject(postJson(NaN, '/event', { hello: 'world' }));
});
