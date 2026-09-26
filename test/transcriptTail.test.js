import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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

test('a truncated file is followed afresh: separator, then its content with new ids', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('first-long-line-here', 'u1') + line('second', 'u2'));
  const { tail, got } = startTail();
  tail.follow(file);
  fs.writeFileSync(file, line('first-long-line-here', 'u1'));
  await waitFor(() => got.length === 4);
  assert.deepEqual(got.map((e) => e.kind), ['text', 'text', 'separator', 'text']);
  assert.equal(got[3].text, 'first-long-line-here');
  assert.equal(new Set(got.map((e) => e.id)).size, 4);
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

test('an append made while the fs thread pool is busy is still picked up', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('one'));
  // Occupy libuv's thread pool so any asynchronous baseline stat lands after the append.
  for (let i = 0; i < 8; i++) crypto.pbkdf2(String(i), 's', 200_000, 64, 'sha512', () => {});
  const { tail, got } = startTail();
  tail.follow(file);
  fs.appendFileSync(file, line('two'));
  await waitFor(() => got.length === 2, 3000);
  assert.equal(got[1].text, 'two');
});

test('a large file whose window starts exactly on a line keeps that line', () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('a'.repeat(200), 'old') + line('recent'));
  const { tail, got } = startTail({ maxInitialBytes: Buffer.byteLength(line('recent')) });
  tail.follow(file);
  assert.deepEqual(got.map((e) => e.text), ['recent']);
});

test('an unterminated line past maxPartialBytes is dropped, and the next line still arrives', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, '');
  const { tail, got } = startTail({ maxPartialBytes: 64 });
  tail.follow(file);
  const huge = line('z'.repeat(300), 'huge');
  fs.appendFileSync(file, huge.slice(0, 150));
  await new Promise((r) => setTimeout(r, 80));
  fs.appendFileSync(file, huge.slice(150) + line('after'));
  await waitFor(() => got.length >= 1);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(got.map((e) => e.text), ['after']);
});

test('switching files first reads what was appended to the old one', () => {
  const a = tmpFile('a.jsonl');
  const b = tmpFile('b.jsonl');
  fs.writeFileSync(a, line('one'));
  fs.writeFileSync(b, line('other'));
  const { tail, got } = startTail({ intervalMs: 60_000 });
  tail.follow(a);
  fs.appendFileSync(a, line('last words'));
  tail.follow(b);
  assert.deepEqual(got.map((e) => e.text), ['one', 'last words', 'new session', 'other']);
});

function interruptLine(text, timestamp, uuid = timestamp) {
  return JSON.stringify({ type: 'user', uuid, timestamp, message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n';
}

test('reports each user interrupt with its timestamp', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, line('working') + interruptLine('[Request interrupted by user]', '2026-09-25T10:00:00.000Z'));
  const interrupts = [];
  const { tail } = startTail({ onInterrupt: (ts) => interrupts.push(ts) });
  tail.follow(file);
  assert.deepEqual(interrupts, [Date.parse('2026-09-25T10:00:00.000Z')]);

  fs.appendFileSync(file, interruptLine('[Request interrupted by user for tool use]', '2026-09-25T10:05:00.000Z'));
  await waitFor(() => interrupts.length === 2);
  assert.equal(interrupts[1], Date.parse('2026-09-25T10:05:00.000Z'));
});
