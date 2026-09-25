import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTranscriptTail } from '../src/transcriptTail.js';

const tails = [];
afterEach(() => {
  while (tails.length) tails.pop().close();
});

function tmpFile(name = 'session.jsonl') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-tail-'));
  return path.join(dir, name);
}

function line(text, uuid = text) {
  return JSON.stringify({ type: 'assistant', uuid, message: { content: [{ type: 'text', text }] } }) + '\n';
}

function startTail(options = {}) {
  const got = [];
  const tail = createTranscriptTail({ onEntries: (entries) => got.push(...entries), intervalMs: 20, ...options });
  tails.push(tail);
  return { tail, got };
}

async function waitFor(check, timeoutMs = 2000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('reads the existing content synchronously on follow()', () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('one') + line('two'));
  const { tail, got } = startTail();
  tail.follow(file);
  assert.deepEqual(got.map((e) => e.text), ['one', 'two']);
});

test('emits appended lines on a later poll', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('one'));
  const { tail, got } = startTail();
  tail.follow(file);
  fs.appendFileSync(file, line('two'));
  await waitFor(() => got.length === 2);
  assert.equal(got[1].text, 'two');
});

test('a partial line waits for its newline', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, '');
  const { tail, got } = startTail();
  tail.follow(file);
  const full = line('joined');
  fs.appendFileSync(file, full.slice(0, 20));
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(got.length, 0);
  fs.appendFileSync(file, full.slice(20));
  await waitFor(() => got.length === 1);
  assert.equal(got[0].text, 'joined');
});

test('a multi-byte character split across two appends decodes cleanly', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, '');
  const { tail, got } = startTail();
  tail.follow(file);
  const bytes = Buffer.from(line('你好世界'), 'utf8');
  const cut = bytes.indexOf(Buffer.from('好', 'utf8')) + 1; // inside the 3-byte character
  fs.appendFileSync(file, bytes.subarray(0, cut));
  await new Promise((r) => setTimeout(r, 80));
  fs.appendFileSync(file, bytes.subarray(cut));
  await waitFor(() => got.length === 1);
  assert.equal(got[0].text, '你好世界');
});

test('skips blank and malformed lines', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '\n{not json\n' + line('ok'));
  const { tail, got } = startTail();
  tail.follow(file);
  assert.deepEqual(got.map((e) => e.text), ['ok']);
});

test('following the same path again is a no-op', () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('one'));
  const { tail, got } = startTail();
  tail.follow(file);
  tail.follow(file);
  assert.equal(got.length, 1);
});

test('switching files emits a separator, then the new file, with distinct ids', () => {
  const a = tmpFile('a.jsonl');
  const b = tmpFile('b.jsonl');
  fs.writeFileSync(a, line('same', 'u1'));
  fs.writeFileSync(b, line('same', 'u1'));
  const { tail, got } = startTail();
  tail.follow(a);
  tail.follow(b);
  assert.deepEqual(got.map((e) => e.kind), ['text', 'separator', 'text']);
  assert.equal(got[1].text, 'new session');
  assert.equal(new Set(got.map((e) => e.id)).size, 3);
});

test('picks up a file created after follow()', async () => {
  const file = tmpFile();
  const { tail, got } = startTail();
  tail.follow(file);
  assert.equal(got.length, 0);
  fs.writeFileSync(file, line('late'));
  await waitFor(() => got.length === 1);
  assert.equal(got[0].text, 'late');
});

test('a truncated file is re-read from the start', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('first-long-line-here'));
  const { tail, got } = startTail();
  tail.follow(file);
  fs.writeFileSync(file, line('new'));
  await waitFor(() => got.length === 2);
  assert.equal(got[1].text, 'new');
});

test('a large file is read only from its last maxInitialBytes, dropping the cut line', () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('a'.repeat(200), 'old') + line('recent'));
  const { tail, got } = startTail({ maxInitialBytes: line('recent').length + 10 });
  tail.follow(file);
  assert.deepEqual(got.map((e) => e.text), ['recent']);
});

test('close() stops polling', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('one'));
  const { tail, got } = startTail();
  tail.follow(file);
  tail.close();
  fs.appendFileSync(file, line('two'));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(got.length, 1);
});
