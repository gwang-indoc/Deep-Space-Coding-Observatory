import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapHookEvent } from '../src/hookMapper.js';

test('UserPromptSubmit maps to mission_start using the "prompt" field', () => {
  const event = mapHookEvent({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the bug' });
  assert.equal(event.type, 'mission_start');
  assert.equal(event.payload.prompt, 'fix the bug');
});

test('UserPromptSubmit also accepts the "user_prompt" field name (backward compatibility)', () => {
  const event = mapHookEvent({ hook_event_name: 'UserPromptSubmit', user_prompt: 'fix the bug' });
  assert.equal(event.type, 'mission_start');
  assert.equal(event.payload.prompt, 'fix the bug');
});

test('PreToolUse Read maps to file_read', () => {
  const event = mapHookEvent({
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: 'src/auth/session.ts' },
  });
  assert.deepEqual(event, { type: 'file_read', ts: event.ts, payload: { file: 'src/auth/session.ts' } });
});

test('PreToolUse Grep and Glob map to search', () => {
  for (const tool_name of ['Grep', 'Glob']) {
    const event = mapHookEvent({ hook_event_name: 'PreToolUse', tool_name, tool_input: {} });
    assert.equal(event.type, 'search');
  }
});

test('PreToolUse Edit and Write map to file_edit', () => {
  for (const tool_name of ['Edit', 'Write']) {
    const event = mapHookEvent({
      hook_event_name: 'PreToolUse',
      tool_name,
      tool_input: { file_path: 'src/x.ts' },
    });
    assert.equal(event.type, 'file_edit');
    assert.equal(event.payload.file, 'src/x.ts');
  }
});

test('PreToolUse Bash without test keywords maps to run_command', () => {
  const event = mapHookEvent({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "wip"' },
  });
  assert.equal(event.type, 'run_command');
});

test('PreToolUse Bash with test keywords maps to run_tests', () => {
  for (const command of ['npm test', 'pytest -x', 'npx vitest run', 'go test ./...']) {
    const event = mapHookEvent({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
    assert.equal(event.type, 'run_tests', `expected run_tests for "${command}"`);
  }
});

test('PreToolUse TodoWrite maps to planet_sync with normalized todos', () => {
  const event = mapHookEvent({
    hook_event_name: 'PreToolUse',
    tool_name: 'TodoWrite',
    tool_input: {
      todos: [
        { content: 'Read auth.ts', status: 'completed' },
        { content: 'Fix timeout', status: 'in_progress' },
      ],
    },
  });
  assert.equal(event.type, 'planet_sync');
  assert.deepEqual(event.payload.todos, [
    { id: '0', text: 'Read auth.ts', status: 'completed' },
    { id: '1', text: 'Fix timeout', status: 'in_progress' },
  ]);
});

test('PreToolUse Agent (and legacy Task) maps to agent_start keyed by tool_use_id', () => {
  for (const tool_name of ['Agent', 'Task']) {
    const event = mapHookEvent({
      hook_event_name: 'PreToolUse',
      tool_name,
      tool_input: { description: 'Count exports', prompt: 'long prompt', subagent_type: 'Explore' },
      tool_use_id: 'toolu_1',
    });
    assert.deepEqual(event, { type: 'agent_start', ts: event.ts, payload: { id: 'toolu_1', text: 'Count exports' } });
  }
});

test('PostToolUse Agent for a foreground subagent maps to agent_end', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_input: { description: 'Count exports' },
    tool_use_id: 'toolu_1',
    tool_response: { status: 'completed', content: [] },
  });
  assert.deepEqual(event, { type: 'agent_end', ts: event.ts, payload: { id: 'toolu_1', status: 'completed' } });
});

test('PostToolUse Agent for a background launch links the planet to its agentId (it is still running)', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_input: { description: 'Count exports', run_in_background: true },
    tool_use_id: 'toolu_1',
    tool_response: { isAsync: true, status: 'async_launched', agentId: 'a1' },
  });
  assert.deepEqual(event, { type: 'agent_start', ts: event.ts, payload: { id: 'toolu_1', agentId: 'a1' } });
});

test('PostToolUse Agent for a background launch without an agentId returns null', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_use_id: 'toolu_1',
    tool_response: { status: 'async_launched' },
  });
  assert.equal(event, null);
});

test('a task-notification with only a task-id ends the agent by agentId', () => {
  const prompt = [
    '<task-notification>',
    '<task-id>a1</task-id>',
    '<output-file>/tmp/a1.output</output-file>',
    '<status>completed</status>',
    '</task-notification>',
  ].join('\n');
  const event = mapHookEvent({ hook_event_name: 'UserPromptSubmit', prompt });
  assert.deepEqual(event, {
    type: 'agent_end',
    ts: event.ts,
    payload: { agentId: 'a1', status: 'completed', resumesMission: true },
  });
});

test('SubagentStop ends the agent by agentId, including one a subagent launched', () => {
  const event = mapHookEvent({ hook_event_name: 'SubagentStop', agent_id: 'a2', agent_type: 'fork' });
  assert.deepEqual(event, { type: 'agent_end', ts: event.ts, payload: { agentId: 'a2', status: 'completed' } });
});

test('UserPromptSubmit carrying a background task-notification maps to agent_end that resumes the mission', () => {
  const prompt = [
    '<task-notification>',
    '<task-id>a1</task-id>',
    '<tool-use-id>toolu_1</tool-use-id>',
    '<status>completed</status>',
    '<summary>Agent "Count exports" finished</summary>',
    '</task-notification>',
  ].join('\n');
  const event = mapHookEvent({ hook_event_name: 'UserPromptSubmit', prompt });
  assert.deepEqual(event, {
    type: 'agent_end',
    ts: event.ts,
    payload: { id: 'toolu_1', status: 'completed', resumesMission: true },
  });
});

test('PreToolUse for an unmapped tool returns null', () => {
  const event = mapHookEvent({ hook_event_name: 'PreToolUse', tool_name: 'WebFetch', tool_input: {} });
  assert.equal(event, null);
});

test('PostToolUse Bash test run with passing output (tool_result string) maps to test_result', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_result: '47 passed, 0 failed',
  });
  assert.equal(event.type, 'test_result');
  assert.deepEqual(event.payload, { passed: 47, failed: 0 });
});

test('PostToolUse Bash test run with passing output (tool_response object) maps to test_result', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: '47 passed, 0 failed', stderr: '' },
  });
  assert.equal(event.type, 'test_result');
  assert.deepEqual(event.payload, { passed: 47, failed: 0 });
});

test('PostToolUse prefers tool_response over tool_result when both are present', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    tool_response: { stdout: '3 passed, 1 failed', stderr: '' },
    tool_result: '47 passed, 0 failed',
  });
  assert.equal(event.type, 'test_result');
  assert.deepEqual(event.payload, { passed: 3, failed: 1 });
});

test('PostToolUse Bash non-test command returns null', () => {
  const event = mapHookEvent({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    tool_result: 'file1\nfile2',
  });
  assert.equal(event, null);
});

test('Notification maps to waiting', () => {
  const event = mapHookEvent({ hook_event_name: 'Notification', message: 'Waiting for input' });
  assert.equal(event.type, 'waiting');
  assert.equal(event.payload.message, 'Waiting for input');
});

test('a permission prompt maps to waiting', () => {
  const event = mapHookEvent({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' });
  assert.equal(event.type, 'waiting');
});

test('an idle reminder is ignored so a long background subagent keeps the sun lit', () => {
  const event = mapHookEvent({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'Claude is waiting for your input' });
  assert.equal(event, null);
});

test('Stop maps to mission_complete', () => {
  const event = mapHookEvent({ hook_event_name: 'Stop' });
  assert.equal(event.type, 'mission_complete');
});

test('unknown hook_event_name returns null', () => {
  assert.equal(mapHookEvent({ hook_event_name: 'PostToolUseFailure' }), null);
});
