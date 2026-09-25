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

test('resolves without throwing when ORBIT_PORT points at an unreachable server (connection refused)', async () => {
  // Open a real server to claim an ephemeral port, then close it immediately so
  // nothing is listening on it. This genuinely exercises postJson's ECONNREFUSED
  // path end-to-end, rather than relying on documented behavior alone.
  const server = http.createServer((req, res) => res.end());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));

  const stdin = Readable.from([JSON.stringify({ hook_event_name: 'UserPromptSubmit', user_prompt: 'fix bug' })]);
  await assert.doesNotReject(runNotify({ stdin, env: { ORBIT_PORT: String(port) } }));
});

async function captureOnePost(hookPayload) {
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
  await runNotify({ stdin: Readable.from([JSON.stringify(hookPayload)]), env: { ORBIT_PORT: String(port) } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => server.close(resolve));
  return received;
}

test('attaches the hook transcript_path as transcriptPath', async () => {
  const received = await captureOnePost({
    hook_event_name: 'UserPromptSubmit',
    prompt: 'hi',
    transcript_path: '/Users/me/.claude/projects/p/s.jsonl',
  });
  assert.equal(received[0].type, 'mission_start');
  assert.equal(received[0].transcriptPath, '/Users/me/.claude/projects/p/s.jsonl');
});

test('omits transcriptPath for a subagent hook', async () => {
  const received = await captureOnePost({
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: 'a.js' },
    agent_id: 'agent-1',
    transcript_path: '/Users/me/.claude/projects/p/s.jsonl',
  });
  assert.equal(received[0].type, 'file_read');
  assert.equal('transcriptPath' in received[0], false);
});
