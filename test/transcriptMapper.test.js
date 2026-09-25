import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapperContext, mapTranscriptLine } from '../src/transcriptMapper.js';

const CWD = '/Users/me/proj';

function user(content, extra = {}) {
  return { type: 'user', uuid: 'u1', cwd: CWD, message: { role: 'user', content }, ...extra };
}
function assistant(content, extra = {}) {
  return { type: 'assistant', uuid: 'a1', cwd: CWD, message: { role: 'assistant', content }, ...extra };
}
function toolUse(id, name, input) {
  return assistant([{ type: 'tool_use', id, name, input }], { uuid: `use-${id}` });
}
function toolResult(id, content, toolUseResult, extra = {}) {
  return user([{ type: 'tool_result', tool_use_id: id, content, ...extra }], { uuid: `res-${id}`, toolUseResult });
}
function strip(entries) {
  return entries.map(({ id, ...rest }) => rest);
}

test('a typed prompt becomes a prompt entry', () => {
  const ctx = createMapperContext();
  assert.deepEqual(strip(mapTranscriptLine(user('how is it going?'), ctx)), [{ kind: 'prompt', text: 'how is it going?' }]);
});

test('a slash command shows as its command name; other command markup is skipped', () => {
  const ctx = createMapperContext();
  const cmd = user('<command-name>/model</command-name>\n<command-message>model</command-message>');
  assert.deepEqual(strip(mapTranscriptLine(cmd, ctx)), [{ kind: 'prompt', text: '/model' }]);
  assert.deepEqual(mapTranscriptLine(user('<local-command-stdout>Set model</local-command-stdout>'), ctx), []);
  assert.deepEqual(mapTranscriptLine(user('<local-command-caveat>Caveat</local-command-caveat>'), ctx), []);
});

test('assistant text becomes a text entry, trimmed', () => {
  const ctx = createMapperContext();
  const out = mapTranscriptLine(assistant([{ type: 'text', text: '\nGroup 1 is complete.\n' }]), ctx);
  assert.deepEqual(strip(out), [{ kind: 'text', text: 'Group 1 is complete.' }]);
});

test('text longer than 4000 chars is cut with an ellipsis', () => {
  const ctx = createMapperContext();
  const [entry] = mapTranscriptLine(assistant([{ type: 'text', text: 'x'.repeat(5000) }]), ctx);
  assert.equal(entry.text.length, 4001);
  assert.ok(entry.text.endsWith('…'));
});

test('tool calls summarize their key argument', () => {
  const ctx = createMapperContext();
  const cases = [
    ['Bash', { command: 'npm   test\n  -- --watch' }, 'npm test -- --watch'],
    ['Read', { file_path: `${CWD}/src/app.js` }, 'src/app.js'],
    ['Edit', { file_path: '/elsewhere/x.js' }, '/elsewhere/x.js'],
    ['Grep', { pattern: 'TODO' }, 'TODO'],
    ['Glob', { pattern: '**/*.js' }, '**/*.js'],
    ['Agent', { description: 'Implement group 2', prompt: 'long' }, 'Implement group 2'],
    ['WebFetch', { url: 'https://example.com', prompt: 'x' }, 'https://example.com'],
  ];
  for (const [name, input, summary] of cases) {
    const [entry] = mapTranscriptLine(toolUse(`t-${name}`, name, input), ctx);
    assert.deepEqual({ kind: entry.kind, name: entry.name, summary: entry.summary }, { kind: 'tool', name, summary });
  }
});

test('tool summaries are cut at 120 chars', () => {
  const ctx = createMapperContext();
  const [entry] = mapTranscriptLine(toolUse('t1', 'Bash', { command: 'a'.repeat(300) }), ctx);
  assert.equal(entry.summary.length, 121);
});

test('bash output shows the first 8 non-empty lines and counts the rest', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Bash', { command: 'ls' }), ctx);
  const stdout = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n\n');
  const out = mapTranscriptLine(toolResult('t1', stdout, { stdout, stderr: '', interrupted: false }, { is_error: false }), ctx);
  assert.deepEqual(strip(out), [
    { kind: 'output', toolUseId: 't1', lines: Array.from({ length: 8 }, (_, i) => `line ${i + 1}`), more: 4, isError: false },
  ]);
});

test('an error result is flagged', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Bash', { command: 'false' }), ctx);
  const [entry] = mapTranscriptLine(toolResult('t1', 'Exit code 1', undefined, { is_error: true }), ctx);
  assert.equal(entry.isError, true);
  assert.deepEqual(entry.lines, ['Exit code 1']);
});

test('an empty result shows (No content)', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Bash', { command: 'true' }), ctx);
  const [entry] = mapTranscriptLine(toolResult('t1', '', { stdout: '', stderr: '' }), ctx);
  assert.deepEqual(entry.lines, ['(No content)']);
});

test('cuts a very long single output line', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Bash', { command: 'cat big.json' }), ctx);
  const [entry] = mapTranscriptLine(toolResult('t1', 'y'.repeat(100_000)), ctx);
  assert.equal(entry.lines[0].length, 501);
});

test('a Read result is summarized as a line count', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Read', { file_path: `${CWD}/a.js` }), ctx);
  const [entry] = mapTranscriptLine(toolResult('t1', '     1\tone\n     2\ttwo\n     3\tthree'), ctx);
  assert.deepEqual(entry.lines, ['Read 3 lines']);
});

test('renders a result with no known tool call as plain output', () => {
  const ctx = createMapperContext();
  const [entry] = mapTranscriptLine(toolResult('never-seen', 'some output'), ctx);
  assert.equal(entry.kind, 'output');
  assert.deepEqual(entry.lines, ['some output']);
});

test('an Edit result renders its structuredPatch as a numbered diff', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Edit', { file_path: `${CWD}/tasks.md` }), ctx);
  const patch = [{ oldStart: 5, oldLines: 3, newStart: 5, newLines: 3, lines: [' keep', '-- [ ] 1.1', '+- [x] 1.1', ' tail'] }];
  const out = mapTranscriptLine(
    toolResult('t1', 'The file has been updated.', { filePath: `${CWD}/tasks.md`, structuredPatch: patch }),
    ctx
  );
  assert.deepEqual(strip(out), [
    {
      kind: 'diff',
      toolUseId: 't1',
      file: 'tasks.md',
      rows: [
        { sign: ' ', lineNo: 5, text: 'keep' },
        { sign: '-', lineNo: 6, text: '- [ ] 1.1' },
        { sign: '+', lineNo: 6, text: '- [x] 1.1' },
        { sign: ' ', lineNo: 7, text: 'tail' },
      ],
      more: 0,
    },
  ]);
});

test('a Write that creates a file renders its content as added lines, capped at 20 rows', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Write', { file_path: `${CWD}/new.js` }), ctx);
  const content = Array.from({ length: 25 }, (_, i) => `l${i + 1}`).join('\n') + '\n';
  const [entry] = mapTranscriptLine(
    toolResult('t1', 'File created', { type: 'create', filePath: `${CWD}/new.js`, content, structuredPatch: [] }),
    ctx
  );
  assert.equal(entry.kind, 'diff');
  assert.equal(entry.rows.length, 20);
  assert.deepEqual(entry.rows[0], { sign: '+', lineNo: 1, text: 'l1' });
  assert.equal(entry.more, 5);
});

test('a background agent task-notification becomes a notice', () => {
  const ctx = createMapperContext();
  const prompt = [
    '<task-notification>',
    '<tool-use-id>toolu_1</tool-use-id>',
    '<status>completed</status>',
    '<summary>Agent "Review group 1" finished</summary>',
    '</task-notification>',
  ].join('\n');
  assert.deepEqual(strip(mapTranscriptLine(user(prompt), ctx)), [{ kind: 'notice', text: 'Agent "Review group 1" finished' }]);
  const bare = '<task-notification><status>failed</status></task-notification>';
  assert.deepEqual(strip(mapTranscriptLine(user(bare), ctx)), [{ kind: 'notice', text: 'Agent failed' }]);
});

test('skips thinking, system, attachment, meta and sidechain lines', () => {
  const ctx = createMapperContext();
  assert.deepEqual(mapTranscriptLine(assistant([{ type: 'thinking', thinking: 'hmm' }]), ctx), []);
  assert.deepEqual(mapTranscriptLine({ type: 'system', uuid: 's', content: 'x' }, ctx), []);
  assert.deepEqual(mapTranscriptLine({ type: 'attachment', uuid: 'x' }, ctx), []);
  assert.deepEqual(mapTranscriptLine(user([{ type: 'text', text: 'skill body' }], { isMeta: true }), ctx), []);
  assert.deepEqual(mapTranscriptLine(assistant([{ type: 'text', text: 'sub' }], { isSidechain: true }), ctx), []);
  assert.deepEqual(mapTranscriptLine(null, ctx), []);
  assert.deepEqual(mapTranscriptLine({ type: 'assistant', message: { content: [{ type: 'text', text: 42 }] } }, ctx), []);
});

test('ids are stable, unique per block and carry the context prefix', () => {
  const ctx = createMapperContext({ idPrefix: 'g2/' });
  const out = mapTranscriptLine(
    assistant([
      { type: 'text', text: 'one' },
      { type: 'tool_use', id: 't9', name: 'Bash', input: { command: 'ls' } },
    ]),
    ctx
  );
  assert.deepEqual(out.map((e) => e.id), ['g2/a1:0', 'g2/a1:1']);
});

test('a tool entry carries its tool_use id so the panel can attach its result', () => {
  const ctx = createMapperContext();
  const [entry] = mapTranscriptLine(toolUse('toolu_9', 'Bash', { command: 'ls' }), ctx);
  assert.equal(entry.toolUseId, 'toolu_9');
});

test('an image Read says so instead of counting zero lines', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Read', { file_path: `${CWD}/shot.png` }), ctx);
  const [entry] = mapTranscriptLine(
    toolResult('t1', [{ type: 'image', source: { type: 'base64', data: 'iVBOR' } }], { type: 'image', file: { type: 'image/png' } }),
    ctx
  );
  assert.deepEqual(entry.lines, ['Read image']);
});

test('a text Read uses the line count Claude Code reports', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Read', { file_path: `${CWD}/a.js` }), ctx);
  const [entry] = mapTranscriptLine(
    toolResult('t1', '     1\tone\n     2\t\n     3\tthree\n\n<system-reminder>\nWhenever you read a file…\n</system-reminder>', { type: 'text', file: { numLines: 3 } }),
    ctx
  );
  assert.deepEqual(entry.lines, ['Read 3 lines']);
});

test('a "\\ No newline at end of file" marker neither shows nor shifts line numbers', () => {
  const ctx = createMapperContext();
  mapTranscriptLine(toolUse('t1', 'Edit', { file_path: `${CWD}/a.txt` }), ctx);
  const patch = [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-old', '\\ No newline at end of file', '+new', '+more'] }];
  const [entry] = mapTranscriptLine(toolResult('t1', 'ok', { filePath: `${CWD}/a.txt`, structuredPatch: patch }), ctx);
  assert.deepEqual(entry.rows, [
    { sign: '-', lineNo: 1, text: 'old' },
    { sign: '+', lineNo: 1, text: 'new' },
    { sign: '+', lineNo: 2, text: 'more' },
  ]);
});
