# Orbit Terminal Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering the bottom edge of the Orbit dashboard slides up a read-only panel that replays the Claude Code session transcript in a Claude-Code-like style.

**Architecture:** `orbit-notify` forwards each hook's `transcript_path`. The server validates it, tails the JSONL file (`fs.watchFile` polling), maps each line to display entries with a pure mapper, keeps the last 300 in a ring buffer, and pushes them to the browser over the existing SSE stream (`transcript_append`, plus `snapshot.payload.transcript`). The React dashboard keeps the entries in provider state and renders them in a `TerminalPanel` HUD component with a hover strip.

**Tech Stack:** Node ≥ 20 built-ins only on the backend (`node:test`); React 18 + vitest/jsdom + @testing-library/react on the frontend; plain CSS in `web/src/styles.css`.

**Spec:** `docs/superpowers/specs/2026-09-25-orbit-terminal-panel-design.md`

## Global Constraints

- Backend: **zero runtime dependencies**, Node built-ins only (`node:fs`, `node:path`, `node:os`, …).
- A hook must never disturb the Claude Code session: everything in `runNotify` stays inside its existing try/catch.
- Transcript paths are accepted only if they resolve to a `.jsonl` file under `<configDir>/projects/` (`path.sep`-bounded prefix check); `<configDir>` = `$CLAUDE_CONFIG_DIR` if set, else `~/.claude`.
- Server keeps at most **300** entries; the frontend keeps at most **300**.
- Tail polls every **500 ms**; initial read capped at the last **2 MB** of the file.
- Mapper caps: text/prompt **4000** chars, tool summary **120** chars, output **8** lines, diff **20** rows, any single rendered line **500** chars.
- `transcript_append` is server-originated only and must stay out of `KNOWN_EVENT_TYPES` (POSTing it → 400).
- Panel: hover strip **14 px** high, panel **45vh** high with **16 px** side margins, close delay **300 ms**, background `rgba(10,12,18,0.92)`, monospace **13 px**.
- UI copy (verbatim): hint `▲ terminal`, empty state `等待 Claude Code 输出…`, jump button `↓ 最新`, separator label `new session`.
- Read-only: no input from the browser. No markdown rendering. Subagent (sidechain) lines are never shown.

**Two deliberate implementation choices that refine the spec (not change behavior):**
1. Transcript entries live in their own provider state via `web/src/state/transcript.js` instead of inside `orbitReducer.js`. The reducer's every non-snapshot event runs `trackActiveTime` and ship/radar pruning; keeping transcript events out of it guarantees they never affect mode or active time (a spec requirement).
2. The slide animation is a CSS `transform` transition instead of framer-motion. framer-motion is listed in `web/package.json` but no component uses it, and a class toggle is simpler to test in jsdom (the panel stays mounted; tests read `data-open`).

## Review Focus

1. **Chinese / multi-byte text split across two polls.** A poll can land in the middle of a UTF-8 character; the entry must still read `你好世界`, not mojibake. → Task 2 test "a multi-byte character split across two appends decodes cleanly".
2. **A single enormous output line** (minified JSON, a 100 KB log line). The panel must not freeze on it; each rendered line is cut at 500 chars. → Task 1 test "cuts a very long single output line".
3. **A tool result whose `tool_use` was never seen** (the tail started mid-file after the 2 MB cap, or the call was in a skipped line). Must render as generic output, never crash. → Task 1 test "renders a result with no known tool call as plain output".
4. **The transcript file does not exist yet when the path first arrives** (Claude creates it lazily). The tail must pick it up once it appears. → Task 2 test "picks up a file created after follow()".
5. **The same path arrives with every hook event.** It must not re-read the file or duplicate entries. → Task 4 test "repeating the same transcriptPath does not duplicate entries".

---

## File Structure

| File | Responsibility |
|---|---|
| `src/transcriptMapper.js` (new) | Pure: one parsed transcript line + context → display entries |
| `src/transcriptTail.js` (new) | Follow one file at a time: poll, read appended bytes, split lines, map, emit |
| `src/notifyMain.js` (modify) | Attach `transcriptPath` to posted events (not for subagents) |
| `src/server.js` (modify) | Path acceptance, own the tail + ring buffer, broadcast `transcript_append` |
| `src/state.js` (modify) | `snapshotEvent` carries the transcript buffer |
| `web/src/state/transcript.js` (new) | Pure helpers: append with cap, read from snapshot |
| `web/src/state/eventSource.js` (modify) | Route `transcript_append` to its own callback (bypasses animation queue) |
| `web/src/state/OrbitProvider.jsx` (modify) | Hold and expose `transcriptEntries` |
| `web/src/hud/TerminalPanel.jsx` (new) | Hover strip, sliding panel, entry rendering, auto-scroll |
| `web/src/styles.css` (modify) | Panel and entry styles |
| `web/src/App.jsx` (modify) | Mount the panel |
| `README.md`, `README.zh-CN.md` (modify) | Document the panel |

### Entry contract (shared by every task)

```js
// Every entry: { id: string, kind: string, ...fields }
{ id, kind: 'prompt',    text }
{ id, kind: 'text',      text }
{ id, kind: 'tool',      name, summary }
{ id, kind: 'output',    toolUseId, lines: string[], more: number, isError: boolean }
{ id, kind: 'diff',      toolUseId, file, rows: [{ sign: ' ' | '+' | '-', lineNo: number, text }], more: number }
{ id, kind: 'notice',    text }
{ id, kind: 'separator', text }
```

---

### Task 1: Transcript line mapper

**Files:**
- Create: `src/transcriptMapper.js`
- Test: `test/transcriptMapper.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createMapperContext({ idPrefix = '' } = {}) → { idPrefix, cwd: string|null, pendingTools: Map<string,{name,input}>, seq: number }`
  - `mapTranscriptLine(obj: object, ctx) → Entry[]` — never throws; mutates `ctx` (records `cwd` and pending tool calls).
  - Entry ids are `${ctx.idPrefix}${obj.uuid}:${index}` (falls back to `line-${n}` when `uuid` is missing).

- [ ] **Step 1: Write the failing tests**

Create `test/transcriptMapper.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/transcriptMapper.test.js`
Expected: FAIL — `Cannot find module '.../src/transcriptMapper.js'`.

- [ ] **Step 3: Implement the mapper**

Create `src/transcriptMapper.js`:

```js
// src/transcriptMapper.js
import path from 'node:path';

// Turns one line of a Claude Code session transcript (JSONL) into the entries
// the dashboard's terminal panel renders. The transcript format is not a
// documented contract, so every field is read defensively and anything
// unfamiliar is skipped.

const MAX_TEXT = 4000;
const MAX_SUMMARY = 120;
const MAX_OUTPUT_LINES = 8;
const MAX_DIFF_ROWS = 20;
const MAX_LINE_CHARS = 500;

export function createMapperContext({ idPrefix = '' } = {}) {
  return { idPrefix, cwd: null, pendingTools: new Map(), seq: 0 };
}

function clip(text, max) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function relativePath(file, cwd) {
  if (typeof file !== 'string') return '';
  return cwd && file.startsWith(cwd + path.sep) ? file.slice(cwd.length + 1) : file;
}

function toolSummary(name, input, cwd) {
  let value;
  switch (name) {
    case 'Bash':
      value = input.command;
      break;
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      value = relativePath(input.file_path, cwd);
      break;
    case 'Grep':
    case 'Glob':
      value = input.pattern;
      break;
    case 'Agent':
    case 'Task':
      value = input.description;
      break;
    default:
      value = Object.values(input).find((v) => typeof v === 'string');
  }
  return typeof value === 'string' ? clip(value.replace(/\s+/g, ' ').trim(), MAX_SUMMARY) : '';
}

function resultText(block, toolUseResult) {
  if (toolUseResult && typeof toolUseResult === 'object' && ('stdout' in toolUseResult || 'stderr' in toolUseResult)) {
    return [toolUseResult.stdout, toolUseResult.stderr].filter(Boolean).join('\n');
  }
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) {
    return block.content.filter((c) => c?.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n');
  }
  return '';
}

function diffRows(toolUseResult) {
  const hunks = Array.isArray(toolUseResult?.structuredPatch) ? toolUseResult.structuredPatch : [];
  if (hunks.length > 0) {
    const rows = [];
    for (const hunk of hunks) {
      let oldNo = hunk.oldStart;
      let newNo = hunk.newStart;
      for (const line of hunk.lines ?? []) {
        const sign = line[0] === '+' || line[0] === '-' ? line[0] : ' ';
        const text = clip(line.slice(1), MAX_LINE_CHARS);
        if (sign === '-') rows.push({ sign, lineNo: oldNo++, text });
        else if (sign === '+') rows.push({ sign, lineNo: newNo++, text });
        else {
          rows.push({ sign, lineNo: newNo, text });
          oldNo++;
          newNo++;
        }
      }
    }
    return rows;
  }
  // A Write that creates a file has an empty patch; show its content as added lines.
  if (toolUseResult?.type === 'create' && typeof toolUseResult.content === 'string') {
    return toolUseResult.content
      .replace(/\n$/, '')
      .split('\n')
      .map((text, i) => ({ sign: '+', lineNo: i + 1, text: clip(text, MAX_LINE_CHARS) }));
  }
  return null;
}

function pushUserText(text, push) {
  if (typeof text !== 'string') return;
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.startsWith('<task-notification>')) {
    const summary = trimmed.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim();
    const status = trimmed.match(/<status>([^<]+)<\/status>/)?.[1] ?? 'completed';
    push({ kind: 'notice', text: summary || `Agent ${status}` });
    return;
  }
  const command = trimmed.match(/^<command-name>([^<]+)<\/command-name>/)?.[1];
  if (command) {
    push({ kind: 'prompt', text: command });
    return;
  }
  // Other harness markup (local command output, caveats) is not something the user typed.
  if (trimmed.startsWith('<')) return;
  push({ kind: 'prompt', text: clip(trimmed, MAX_TEXT) });
}

function pushToolResult(block, toolUseResult, ctx, push) {
  const toolUseId = block.tool_use_id;
  const call = ctx.pendingTools.get(toolUseId);
  ctx.pendingTools.delete(toolUseId);
  const isError = block.is_error === true;

  if (!isError && call && ['Edit', 'Write', 'MultiEdit'].includes(call.name)) {
    const rows = diffRows(toolUseResult);
    if (rows) {
      const file = relativePath(toolUseResult.filePath ?? call.input.file_path, ctx.cwd);
      push({ kind: 'diff', toolUseId, file, rows: rows.slice(0, MAX_DIFF_ROWS), more: Math.max(0, rows.length - MAX_DIFF_ROWS) });
      return;
    }
  }

  const text = resultText(block, toolUseResult);
  let all = text.split('\n').filter((line) => line.trim() !== '');
  if (!isError && call?.name === 'Read') all = [`Read ${all.length} lines`];
  if (all.length === 0) all = ['(No content)'];
  push({
    kind: 'output',
    toolUseId,
    lines: all.slice(0, MAX_OUTPUT_LINES).map((line) => clip(line, MAX_LINE_CHARS)),
    more: Math.max(0, all.length - MAX_OUTPUT_LINES),
    isError,
  });
}

function mapLine(obj, ctx) {
  if (!obj || typeof obj !== 'object' || obj.isSidechain || obj.isMeta) return [];
  if (typeof obj.cwd === 'string') ctx.cwd = obj.cwd;
  ctx.seq += 1;
  const base = `${ctx.idPrefix}${obj.uuid ?? `line-${ctx.seq}`}`;
  const content = obj.message?.content;
  const entries = [];
  const push = (entry) => entries.push({ id: `${base}:${entries.length}`, ...entry });

  if (obj.type === 'user') {
    if (typeof content === 'string') {
      pushUserText(content, push);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text') pushUserText(block.text, push);
        else if (block?.type === 'tool_result') pushToolResult(block, obj.toolUseResult, ctx, push);
      }
    }
    return entries;
  }

  if (obj.type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        push({ kind: 'text', text: clip(block.text.trim(), MAX_TEXT) });
      } else if (block?.type === 'tool_use') {
        const input = block.input && typeof block.input === 'object' ? block.input : {};
        ctx.pendingTools.set(block.id, { name: block.name, input });
        push({ kind: 'tool', name: String(block.name ?? ''), summary: toolSummary(block.name, input, ctx.cwd) });
      }
    }
  }
  return entries;
}

export function mapTranscriptLine(obj, ctx) {
  try {
    return mapLine(obj, ctx);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/transcriptMapper.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transcriptMapper.js test/transcriptMapper.test.js
git commit -m "feat: map transcript lines to terminal panel entries"
```

---

### Task 2: Transcript tail

**Files:**
- Create: `src/transcriptTail.js`
- Test: `test/transcriptTail.test.js`

**Interfaces:**
- Consumes: `createMapperContext({ idPrefix })`, `mapTranscriptLine(obj, ctx)` from Task 1.
- Produces: `createTranscriptTail({ onEntries: (entries: Entry[]) => void, intervalMs = 500, maxInitialBytes = 2 * 1024 * 1024 }) → { follow(filePath: string): void, close(): void }`.
  - `follow` reads what is already in the file synchronously before returning, then keeps polling.
  - Switching files emits `{ id: 'separator:<n>', kind: 'separator', text: 'new session' }` first.
  - Each followed file gets id prefix `g<n>/` so re-following an old file never produces duplicate React keys.

- [ ] **Step 1: Write the failing tests**

Create `test/transcriptTail.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/transcriptTail.test.js`
Expected: FAIL — `Cannot find module '.../src/transcriptTail.js'`.

- [ ] **Step 3: Implement the tail**

Create `src/transcriptTail.js`:

```js
// src/transcriptTail.js
import fs from 'node:fs';
import { createMapperContext, mapTranscriptLine } from './transcriptMapper.js';

const NEWLINE = 0x0a;

// Follows one transcript file at a time and emits the entries for each newly
// appended complete line. Bytes are buffered until a newline so neither a
// half-written JSON line nor a multi-byte character split across two reads is
// ever decoded early. fs.watchFile polls, which is more reliable than fs.watch
// for appended files on macOS. Nothing here may throw into the server.
export function createTranscriptTail({ onEntries, intervalMs = 500, maxInitialBytes = 2 * 1024 * 1024 }) {
  let current = null;
  let generation = 0;

  function readNew() {
    const file = current;
    if (!file) return;
    let size;
    try {
      size = fs.statSync(file.path).size;
    } catch {
      return; // not created yet, or unreadable; the next poll retries
    }
    if (file.offset === null) {
      file.offset = size > maxInitialBytes ? size - maxInitialBytes : 0;
      file.skipFirstLine = file.offset > 0;
    } else if (size < file.offset) {
      file.offset = 0;
      file.partial = Buffer.alloc(0);
      file.skipFirstLine = false;
    }
    if (size === file.offset) return;

    const chunk = Buffer.alloc(size - file.offset);
    let bytesRead = 0;
    let fd;
    try {
      fd = fs.openSync(file.path, 'r');
      bytesRead = fs.readSync(fd, chunk, 0, chunk.length, file.offset);
    } catch {
      return;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    file.offset += bytesRead;

    const data = Buffer.concat([file.partial, chunk.subarray(0, bytesRead)]);
    const lastNewline = data.lastIndexOf(NEWLINE);
    if (lastNewline === -1) {
      file.partial = data;
      return;
    }
    file.partial = data.subarray(lastNewline + 1);
    let lines = data.subarray(0, lastNewline).toString('utf8').split('\n');
    if (file.skipFirstLine) {
      lines = lines.slice(1);
      file.skipFirstLine = false;
    }

    const entries = [];
    for (const text of lines) {
      if (!text.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        continue;
      }
      entries.push(...mapTranscriptLine(obj, file.ctx));
    }
    if (entries.length > 0) onEntries(entries);
  }

  function stopWatching() {
    if (current) fs.unwatchFile(current.path, current.listener);
  }

  function follow(filePath) {
    if (current?.path === filePath) return;
    if (current) {
      stopWatching();
      onEntries([{ id: `separator:${generation}`, kind: 'separator', text: 'new session' }]);
    }
    generation += 1;
    const listener = () => readNew();
    current = {
      path: filePath,
      offset: null,
      partial: Buffer.alloc(0),
      skipFirstLine: false,
      ctx: createMapperContext({ idPrefix: `g${generation}/` }),
      listener,
    };
    fs.watchFile(filePath, { interval: intervalMs, persistent: false }, listener);
    readNew();
  }

  function close() {
    stopWatching();
    current = null;
  }

  return { follow, close };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/transcriptTail.test.js`
Expected: all tests PASS. If the truncation test is flaky because the rewrite happens within the same mtime tick, the file sizes differ (`first-long-line-here` vs `new`), so `watchFile` still sees a change; do not add sleeps to the implementation.

- [ ] **Step 5: Commit**

```bash
git add src/transcriptTail.js test/transcriptTail.test.js
git commit -m "feat: tail the session transcript for the terminal panel"
```

---

### Task 3: Forward the transcript path from the hook

**Files:**
- Modify: `src/notifyMain.js` (the `postJson` call)
- Test: `test/notifyMain.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: POST `/event` body = the mapped event plus an optional top-level `transcriptPath: string`, present only when the hook payload has a string `transcript_path` and no `agent_id`.

- [ ] **Step 1: Write the failing tests**

Append to `test/notifyMain.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/notifyMain.test.js`
Expected: the two new tests FAIL (`transcriptPath` is `undefined` / absent from the first), existing tests PASS.

- [ ] **Step 3: Implement**

In `src/notifyMain.js`, replace

```js
    await postJson(port, '/event', event);
```

with

```js
    // The dashboard's terminal panel follows the main session's transcript only;
    // a subagent's hooks carry its own agent_id.
    const transcriptPath = parsed.agent_id ? null : parsed.transcript_path;
    await postJson(port, '/event', typeof transcriptPath === 'string' ? { ...event, transcriptPath } : event);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/notifyMain.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notifyMain.js test/notifyMain.test.js
git commit -m "feat: forward the session transcript path with hook events"
```

---

### Task 4: Server follows the transcript and streams entries

**Files:**
- Modify: `src/server.js` (imports, new exports, `createOrbitServer` options, POST `/event` handler, `/events` snapshot, `close()`)
- Modify: `src/state.js` (`snapshotEvent`)
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `createTranscriptTail({ onEntries, intervalMs })` from Task 2; POST bodies with optional `transcriptPath` from Task 3.
- Produces:
  - `export function defaultClaudeConfigDir(env = process.env) → string`
  - `export function isAcceptedTranscriptPath(candidate: unknown, configDir: string) → boolean`
  - `createOrbitServer(port, { webDistDir, sleepGuard, configDir = defaultClaudeConfigDir(), transcriptPollMs = 500 })`
  - SSE event `{ type: 'transcript_append', ts: number, payload: { entries: Entry[] } }`
  - `snapshotEvent(state, { transcript = [] } = {})` → `payload.transcript: Entry[]` (at most 300)

- [ ] **Step 1: Write the failing tests**

Add to the imports at the top of `test/server.test.js`:

```js
import fs from 'node:fs';
import os from 'node:os';
import { isAcceptedTranscriptPath } from '../src/server.js';
```

(Merge `isAcceptedTranscriptPath` into the existing `import { createOrbitServer } from '../src/server.js';` line.)

Append these tests:

```js
function makeConfigDir() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-config-'));
  fs.mkdirSync(path.join(configDir, 'projects', 'p'), { recursive: true });
  return configDir;
}

function transcriptLine(text, uuid) {
  return JSON.stringify({ type: 'assistant', uuid, message: { content: [{ type: 'text', text }] } }) + '\n';
}

async function snapshotOf(port) {
  const [snapshot] = await collectSseEvents(port, 1);
  return snapshot;
}

test('isAcceptedTranscriptPath only accepts .jsonl files under <configDir>/projects', () => {
  const configDir = '/home/me/.claude';
  assert.equal(isAcceptedTranscriptPath('/home/me/.claude/projects/p/s.jsonl', configDir), true);
  assert.equal(isAcceptedTranscriptPath('/home/me/.claude/projects/p/s.json', configDir), false);
  assert.equal(isAcceptedTranscriptPath('/home/me/.claude/projects-evil/p/s.jsonl', configDir), false);
  assert.equal(isAcceptedTranscriptPath('/home/me/.claude/projects/../secrets.jsonl', configDir), false);
  assert.equal(isAcceptedTranscriptPath('/etc/passwd', configDir), false);
  assert.equal(isAcceptedTranscriptPath(undefined, configDir), false);
  assert.equal(isAcceptedTranscriptPath(42, configDir), false);
});

test('a posted transcriptPath streams transcript_append after the event itself', async () => {
  const configDir = makeConfigDir();
  const file = path.join(configDir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(file, transcriptLine('hello from claude', 'u1'));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });
  const collected = collectSseEvents(port, 3);
  await new Promise((resolve) => setTimeout(resolve, 20));

  await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: { prompt: 'hi' }, transcriptPath: file });

  const events = await collected;
  assert.deepEqual(events.map((e) => e.type), ['snapshot', 'mission_start', 'transcript_append']);
  assert.equal('transcriptPath' in events[1], false);
  assert.equal(events[2].payload.entries[0].text, 'hello from claude');
  await close();
});

test('the snapshot carries the transcript so a reload keeps it', async () => {
  const configDir = makeConfigDir();
  const file = path.join(configDir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(file, transcriptLine('one', 'u1') + transcriptLine('two', 'u2'));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });

  await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: {}, transcriptPath: file });

  const snapshot = await snapshotOf(port);
  assert.deepEqual(snapshot.payload.transcript.map((e) => e.text), ['one', 'two']);
  await close();
});

test('the transcript buffer keeps only the last 300 entries', async () => {
  const configDir = makeConfigDir();
  const file = path.join(configDir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(file, Array.from({ length: 320 }, (_, i) => transcriptLine(`m${i}`, `u${i}`)).join(''));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });

  await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: {}, transcriptPath: file });

  const { transcript } = (await snapshotOf(port)).payload;
  assert.equal(transcript.length, 300);
  assert.equal(transcript[0].text, 'm20');
  assert.equal(transcript[299].text, 'm319');
  await close();
});

test('repeating the same transcriptPath does not duplicate entries', async () => {
  const configDir = makeConfigDir();
  const file = path.join(configDir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(file, transcriptLine('only once', 'u1'));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });

  await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: {}, transcriptPath: file });
  await postEvent(port, { type: 'search', ts: Date.now(), payload: {}, transcriptPath: file });
  await new Promise((resolve) => setTimeout(resolve, 60));

  const { transcript } = (await snapshotOf(port)).payload;
  assert.deepEqual(transcript.map((e) => e.text), ['only once']);
  await close();
});

test('a transcriptPath outside <configDir>/projects is ignored but the event still applies', async () => {
  const configDir = makeConfigDir();
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-out-')), 's.jsonl');
  fs.writeFileSync(outside, transcriptLine('secret', 'u1'));
  const { port, close } = await createOrbitServer(0, { configDir, transcriptPollMs: 20 });

  const status = await postEvent(port, { type: 'mission_start', ts: Date.now(), payload: {}, transcriptPath: outside });
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(status, 204);
  const snapshot = await snapshotOf(port);
  assert.deepEqual(snapshot.payload.transcript, []);
  assert.equal(snapshot.payload.missionActive, true);
  await close();
});

test('POSTing a transcript_append is rejected', async () => {
  const { port, close } = await createOrbitServer(0, { configDir: makeConfigDir() });
  const status = await postEvent(port, { type: 'transcript_append', ts: Date.now(), payload: { entries: [] } });
  assert.equal(status, 400);
  await close();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL — `isAcceptedTranscriptPath` is not exported (SyntaxError on import), so the whole file fails.

- [ ] **Step 3: Update `snapshotEvent` in `src/state.js`**

Replace the `snapshotEvent` function with:

```js
export function snapshotEvent(state, { transcript = [] } = {}) {
  return {
    type: 'snapshot',
    ts: Date.now(),
    payload: {
      todos: state.todos,
      missionActive: state.missionActive,
      lastStatus: state.lastStatus,
      waiting: state.waiting,
      activeMs: state.activeMs,
      activeSince: state.activeSince,
      transcript,
    },
  };
}
```

- [ ] **Step 4: Update `src/server.js`**

4a. Imports — add below the existing imports:

```js
import os from 'node:os';
import { createTranscriptTail } from './transcriptTail.js';
```

4b. Below `const NO_SLEEP_GUARD = …;` add:

```js
const TRANSCRIPT_LIMIT = 300;

export function defaultClaudeConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// The server accepts POSTs from anything on this machine, so a transcript path
// is only ever opened if it is a session transcript under Claude's own config.
export function isAcceptedTranscriptPath(candidate, configDir) {
  if (typeof candidate !== 'string' || candidate === '') return false;
  const resolved = path.resolve(candidate);
  const projectsDir = path.resolve(configDir, 'projects');
  return resolved.endsWith('.jsonl') && resolved.startsWith(projectsDir + path.sep);
}
```

4c. Change the signature and add the tail right after `const clients = new Set();` and the `broadcast` function:

```js
export function createOrbitServer(
  port,
  { webDistDir = WEB_DIST_DIR, sleepGuard = NO_SLEEP_GUARD, configDir = defaultClaudeConfigDir(), transcriptPollMs = 500 } = {}
) {
```

and after `function broadcast(event) { … }`:

```js
  // The terminal panel's backlog: the last TRANSCRIPT_LIMIT entries, replayed in
  // every snapshot and extended by transcript_append broadcasts.
  const transcript = [];
  const transcriptTail = createTranscriptTail({
    intervalMs: transcriptPollMs,
    onEntries(entries) {
      transcript.push(...entries);
      if (transcript.length > TRANSCRIPT_LIMIT) transcript.splice(0, transcript.length - TRANSCRIPT_LIMIT);
      broadcast({ type: 'transcript_append', ts: Date.now(), payload: { entries: entries.slice(-TRANSCRIPT_LIMIT) } });
    },
  });
```

4d. In the `GET /events` handler, replace

```js
      res.write(`data: ${JSON.stringify(snapshotEvent(state))}\n\n`);
```

with

```js
      res.write(`data: ${JSON.stringify(snapshotEvent(state, { transcript }))}\n\n`);
```

4e. In the `POST /event` handler, replace the body of the `try` block with:

```js
          const parsed = JSON.parse(body);
          if (!parsed || !KNOWN_EVENT_TYPES.has(parsed.type)) {
            res.writeHead(400);
            res.end();
            return;
          }
          // transcriptPath rides along with hook events but is not part of the
          // event the dashboard sees.
          const { transcriptPath, ...event } = parsed;
          applyEvent(state, event);
          broadcast(event);
          if (isAcceptedTranscriptPath(transcriptPath, configDir)) {
            transcriptTail.follow(path.resolve(transcriptPath));
          }
          res.writeHead(204);
          res.end();
```

4f. In `close()`, add `transcriptTail.close();` right before `sleepGuard.release();`.

- [ ] **Step 5: Run the backend suite**

Run: `npm test`
Expected: all backend tests PASS (including the existing server tests, whose snapshots now also carry `transcript: []`).

- [ ] **Step 6: Commit**

```bash
git add src/server.js src/state.js test/server.test.js
git commit -m "feat: stream the session transcript to the dashboard"
```

---

### Task 5: Frontend transcript state

**Files:**
- Create: `web/src/state/transcript.js`
- Modify: `web/src/state/eventSource.js`
- Modify: `web/src/state/OrbitProvider.jsx`
- Test: `web/test/transcript.test.js`, `web/test/eventSource.test.js`

**Interfaces:**
- Consumes: SSE `snapshot.payload.transcript` and `transcript_append.payload.entries` from Task 4.
- Produces:
  - `export const TRANSCRIPT_LIMIT = 300`
  - `export function appendTranscript(entries: Entry[], incoming: unknown) → Entry[]` (returns `entries` unchanged when `incoming` is not a non-empty array)
  - `export function transcriptFromSnapshot(payload: unknown) → Entry[]`
  - `createEventStream({ …, onTranscriptAppend })` — called with the event's `payload`; `transcript_append` never reaches `onQueueableEvent`.
  - `useOrbit()` now also returns `transcriptEntries: Entry[]`.

- [ ] **Step 1: Write the failing tests**

Create `web/test/transcript.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { TRANSCRIPT_LIMIT, appendTranscript, transcriptFromSnapshot } from '../src/state/transcript.js';

const entry = (i) => ({ id: `e${i}`, kind: 'text', text: `t${i}` });

describe('transcript state', () => {
  it('reads the snapshot transcript, or nothing from an older server', () => {
    expect(transcriptFromSnapshot({ transcript: [entry(1)] })).toEqual([entry(1)]);
    expect(transcriptFromSnapshot({ todos: [] })).toEqual([]);
    expect(transcriptFromSnapshot(undefined)).toEqual([]);
  });

  it('appends entries in order', () => {
    expect(appendTranscript([entry(1)], [entry(2), entry(3)])).toEqual([entry(1), entry(2), entry(3)]);
  });

  it('keeps only the newest TRANSCRIPT_LIMIT entries', () => {
    const existing = Array.from({ length: TRANSCRIPT_LIMIT }, (_, i) => entry(i));
    const next = appendTranscript(existing, [entry('new')]);
    expect(next).toHaveLength(TRANSCRIPT_LIMIT);
    expect(next[0]).toEqual(entry(1));
    expect(next[TRANSCRIPT_LIMIT - 1]).toEqual(entry('new'));
  });

  it('returns the same array when there is nothing to add', () => {
    const existing = [entry(1)];
    expect(appendTranscript(existing, [])).toBe(existing);
    expect(appendTranscript(existing, undefined)).toBe(existing);
  });
});
```

Append inside the `describe('createEventStream', …)` block of `web/test/eventSource.test.js`:

```js
  it('routes transcript_append to onTranscriptAppend, not the animation queue', () => {
    const appended = [];
    const queued = [];
    createEventStream({
      onTranscriptAppend: (p) => appended.push(p),
      onQueueableEvent: (e) => queued.push(e),
      EventSourceImpl: FakeEventSource,
    });
    FakeEventSource.instances[0].emit({ type: 'transcript_append', ts: 1, payload: { entries: [{ id: 'a' }] } });
    expect(appended).toEqual([{ entries: [{ id: 'a' }] }]);
    expect(queued).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=web -- transcript eventSource`
Expected: `transcript.test.js` FAILS (module not found); the new eventSource test FAILS (`appended` is empty, `queued` has the event).

- [ ] **Step 3: Implement**

Create `web/src/state/transcript.js`:

```js
// The terminal panel's backlog. Kept out of the orbit reducer so transcript
// traffic never touches mode, active time or the animation queue.
export const TRANSCRIPT_LIMIT = 300;

export function appendTranscript(entries, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return entries;
  const next = entries.concat(incoming);
  return next.length > TRANSCRIPT_LIMIT ? next.slice(-TRANSCRIPT_LIMIT) : next;
}

export function transcriptFromSnapshot(payload) {
  return Array.isArray(payload?.transcript) ? payload.transcript.slice(-TRANSCRIPT_LIMIT) : [];
}
```

In `web/src/state/eventSource.js`, add `onTranscriptAppend,` to the destructured options (after `onStatusUpdate,`) and, after the `status_update` branch, add:

```js
    if (event.type === 'transcript_append') {
      onTranscriptAppend?.(event.payload);
      return;
    }
```

In `web/src/state/OrbitProvider.jsx`:

- add the import `import { appendTranscript, transcriptFromSnapshot } from './transcript.js';`
- add state below `const [recentLog, setRecentLog] = useState([]);`:

```js
  const [transcriptEntries, setTranscriptEntries] = useState([]);
```

- in `createEventStream({ … })`, extend `onSnapshot` and add `onTranscriptAppend`:

```js
        onSnapshot: (payload) => {
          dispatch({ type: 'snapshot', ts: Date.now(), payload });
          if (payload.lastStatus) setLastStatus(payload.lastStatus);
          setTranscriptEntries(transcriptFromSnapshot(payload));
        },
        onStatusUpdate: (payload) => setLastStatus(payload),
        onTranscriptAppend: (payload) => setTranscriptEntries((prev) => appendTranscript(prev, payload?.entries)),
        onQueueableEvent: (event) => queueRef.current.push(event),
```

- add `transcriptEntries` to the context value:

```jsx
    <OrbitContext.Provider value={{ orbitState, lastStatus, renderingPaused, activeStep, recentLog, transcriptEntries }}>
```

- [ ] **Step 4: Run the frontend suite**

Run: `npm test --workspace=web`
Expected: all frontend tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/state/transcript.js web/src/state/eventSource.js web/src/state/OrbitProvider.jsx web/test/transcript.test.js web/test/eventSource.test.js
git commit -m "feat: keep the streamed transcript in dashboard state"
```

---

### Task 6: TerminalPanel component

**Files:**
- Create: `web/src/hud/TerminalPanel.jsx`
- Modify: `web/src/styles.css` (append a section)
- Test: `web/test/TerminalPanel.test.jsx`

**Interfaces:**
- Consumes: the Entry contract (see File Structure).
- Produces: `export default function TerminalPanel({ entries: Entry[] })`, `export const CLOSE_DELAY_MS = 300`. Test ids: `terminal-trigger`, `terminal-panel` (with `data-open="true"|"false"`), `terminal-panel-body`.

- [ ] **Step 1: Write the failing tests**

Create `web/test/TerminalPanel.test.jsx`:

```jsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import TerminalPanel, { CLOSE_DELAY_MS } from '../src/hud/TerminalPanel.jsx';

const ENTRIES = [
  { id: '1', kind: 'prompt', text: 'how is it going?' },
  { id: '2', kind: 'text', text: 'Group 1 is complete.' },
  { id: '3', kind: 'tool', name: 'Bash', summary: 'npm test' },
  { id: '4', kind: 'output', toolUseId: 't', lines: ['ok 1', 'ok 2'], more: 3, isError: false },
  { id: '5', kind: 'output', toolUseId: 'u', lines: ['Exit code 1'], more: 0, isError: true },
  {
    id: '6',
    kind: 'diff',
    toolUseId: 'v',
    file: 'tasks.md',
    rows: [
      { sign: '-', lineNo: 5, text: '- [ ] 1.1' },
      { sign: '+', lineNo: 5, text: '- [x] 1.1' },
      { sign: ' ', lineNo: 6, text: 'context' },
    ],
    more: 0,
  },
  { id: '7', kind: 'notice', text: 'Agent "Review" finished' },
  { id: '8', kind: 'separator', text: 'new session' },
  { id: '9', kind: 'mystery', text: 'should not render' },
];

describe('TerminalPanel', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is closed by default and shows the hint', () => {
    render(<TerminalPanel entries={[]} />);
    expect(screen.getByTestId('terminal-panel').getAttribute('data-open')).toBe('false');
    expect(screen.getByText('▲ terminal')).toBeTruthy();
  });

  it('opens when the pointer enters the bottom strip', () => {
    render(<TerminalPanel entries={[]} />);
    fireEvent.mouseEnter(screen.getByTestId('terminal-trigger'));
    expect(screen.getByTestId('terminal-panel').getAttribute('data-open')).toBe('true');
    expect(screen.queryByText('▲ terminal')).toBeNull();
  });

  it('closes 300 ms after the pointer leaves, and re-entering cancels the close', () => {
    vi.useFakeTimers();
    render(<TerminalPanel entries={[]} />);
    const panel = screen.getByTestId('terminal-panel');
    fireEvent.mouseEnter(screen.getByTestId('terminal-trigger'));
    fireEvent.mouseLeave(panel);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS - 50));
    expect(panel.getAttribute('data-open')).toBe('true');
    fireEvent.mouseEnter(panel);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS));
    expect(panel.getAttribute('data-open')).toBe('true');
    fireEvent.mouseLeave(panel);
    act(() => vi.advanceTimersByTime(CLOSE_DELAY_MS));
    expect(panel.getAttribute('data-open')).toBe('false');
  });

  it('shows the empty state before any output', () => {
    render(<TerminalPanel entries={[]} />);
    expect(screen.getByText('等待 Claude Code 输出…')).toBeTruthy();
  });

  it('renders each entry kind in its Claude Code style', () => {
    const { container } = render(<TerminalPanel entries={ENTRIES} />);
    expect(container.querySelector('.term-entry--prompt').textContent).toBe('❯how is it going?');
    expect(container.querySelector('.term-entry--text').textContent).toBe('●Group 1 is complete.');
    const tool = container.querySelector('.term-entry--tool');
    expect(tool.querySelector('strong').textContent).toBe('Bash');
    expect(tool.textContent).toBe('●Bash(npm test)');
    const [ok, err] = container.querySelectorAll('.term-entry--output');
    expect(ok.textContent).toContain('⎿ok 1');
    expect(ok.textContent).toContain('… +3 lines');
    expect(ok.classList.contains('term-entry--error')).toBe(false);
    expect(err.classList.contains('term-entry--error')).toBe(true);
    expect(container.querySelector('.term-diff-row--del').textContent).toBe('5-- [ ] 1.1');
    expect(container.querySelector('.term-diff-row--add').textContent).toBe('5+- [x] 1.1');
    expect(container.querySelector('.term-diff-row--ctx')).toBeTruthy();
    expect(container.querySelector('.term-entry--notice').textContent).toBe('●Agent "Review" finished');
    expect(container.querySelector('.term-entry--separator').textContent).toBe('new session');
    expect(screen.queryByText('should not render')).toBeNull();
  });

  it('stops following when scrolled up and offers a jump back to the latest', () => {
    render(<TerminalPanel entries={ENTRIES} />);
    const body = screen.getByTestId('terminal-panel-body');
    Object.defineProperty(body, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(body, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(body, 'scrollTop', { value: 100, writable: true, configurable: true });
    fireEvent.scroll(body);
    const jump = screen.getByText('↓ 最新');
    fireEvent.click(jump);
    expect(body.scrollTop).toBe(1000);
    expect(screen.queryByText('↓ 最新')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace=web -- TerminalPanel`
Expected: FAIL — cannot resolve `../src/hud/TerminalPanel.jsx`.

- [ ] **Step 3: Implement the component**

Create `web/src/hud/TerminalPanel.jsx`:

```jsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const CLOSE_DELAY_MS = 300;
// Within this distance of the bottom counts as "at the latest output".
const FOLLOW_THRESHOLD_PX = 24;

function diffRowClass(sign) {
  if (sign === '+') return 'add';
  if (sign === '-') return 'del';
  return 'ctx';
}

function Entry({ entry }) {
  switch (entry.kind) {
    case 'prompt':
      return (
        <div className="term-entry term-entry--prompt">
          <span className="term-marker">❯</span>
          {entry.text}
        </div>
      );
    case 'text':
      return (
        <div className="term-entry term-entry--text">
          <span className="term-marker">●</span>
          {entry.text}
        </div>
      );
    case 'tool':
      return (
        <div className="term-entry term-entry--tool">
          <span className="term-marker">●</span>
          <strong>{entry.name}</strong>({entry.summary})
        </div>
      );
    case 'output':
      return (
        <div className={`term-entry term-entry--output${entry.isError ? ' term-entry--error' : ''}`}>
          {entry.lines.map((line, i) => (
            <div key={i} className="term-output-line">
              <span className="term-elbow">{i === 0 ? '⎿' : ''}</span>
              {line}
            </div>
          ))}
          {entry.more > 0 && (
            <div className="term-output-line term-more">
              <span className="term-elbow" />… +{entry.more} lines
            </div>
          )}
        </div>
      );
    case 'diff':
      return (
        <div className="term-entry term-entry--diff">
          {entry.rows.map((row, i) => (
            <div key={i} className={`term-diff-row term-diff-row--${diffRowClass(row.sign)}`}>
              <span className="term-diff-lineno">{row.lineNo}</span>
              <span className="term-diff-sign">{row.sign}</span>
              {row.text}
            </div>
          ))}
          {entry.more > 0 && <div className="term-output-line term-more">… +{entry.more} lines</div>}
        </div>
      );
    case 'notice':
      return (
        <div className="term-entry term-entry--notice">
          <span className="term-marker">●</span>
          {entry.text}
        </div>
      );
    case 'separator':
      return <div className="term-entry term-entry--separator">{entry.text}</div>;
    default:
      return null;
  }
}

// A read-only replay of the session transcript that slides up from the bottom
// edge while the pointer is over it.
export default function TerminalPanel({ entries }) {
  const [open, setOpen] = useState(false);
  const [following, setFollowing] = useState(true);
  const closeTimer = useRef(null);
  const bodyRef = useRef(null);

  function cancelClose() {
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }
  function show() {
    cancelClose();
    setOpen(true);
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }
  useEffect(() => cancelClose, []);

  function scrollToBottom() {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }
  useLayoutEffect(() => {
    if (following) scrollToBottom();
  }, [entries, open, following]);

  function onScroll() {
    const el = bodyRef.current;
    setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX);
  }
  function jumpToLatest() {
    setFollowing(true);
    scrollToBottom();
  }

  return (
    <>
      <div className="terminal-trigger" data-testid="terminal-trigger" onMouseEnter={show} onMouseLeave={scheduleClose}>
        {!open && <span className="terminal-trigger__hint">▲ terminal</span>}
      </div>
      <div
        className={`terminal-panel${open ? ' terminal-panel--open' : ''}`}
        data-testid="terminal-panel"
        data-open={open}
        aria-hidden={!open}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
      >
        <div className="terminal-panel__body" data-testid="terminal-panel-body" ref={bodyRef} onScroll={onScroll}>
          {entries.length === 0 ? (
            <div className="terminal-panel__empty">等待 Claude Code 输出…</div>
          ) : (
            entries.map((entry) => <Entry key={entry.id} entry={entry} />)
          )}
        </div>
        {!following && (
          <button type="button" className="terminal-panel__jump" onClick={jumpToLatest}>
            ↓ 最新
          </button>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add the styles**

Append to `web/src/styles.css`:

```css
/* ---- Terminal panel: the session transcript, slid up from the bottom edge ---- */

.terminal-trigger {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 14px;
  z-index: 20;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  pointer-events: auto;
}

.terminal-trigger__hint {
  padding-bottom: 1px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(203, 213, 245, 0.35);
}

.terminal-panel {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 0;
  height: 45vh;
  z-index: 30;
  display: flex;
  flex-direction: column;
  background: rgba(10, 12, 18, 0.92);
  border: 1px solid rgba(140, 160, 200, 0.25);
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  backdrop-filter: blur(6px);
  transform: translateY(105%);
  transition: transform 200ms ease-out;
  pointer-events: none;
}

.terminal-panel--open {
  transform: translateY(0);
  pointer-events: auto;
}

.terminal-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 14px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #e8ecf5;
}

.terminal-panel__empty {
  margin-top: 12px;
  color: #6b7a99;
}

.terminal-panel__jump {
  position: absolute;
  right: 20px;
  bottom: 14px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(140, 160, 200, 0.35);
  background: rgba(20, 26, 40, 0.95);
  color: #cbd5f5;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  cursor: pointer;
}

.term-entry {
  margin-top: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.term-marker {
  display: inline-block;
  width: 18px;
}

.term-entry--prompt {
  color: #aab4c8;
}

.term-entry--tool strong {
  font-weight: 700;
}

.term-entry--notice .term-marker {
  color: #4ade80;
}

.term-entry--output,
.term-entry--diff {
  margin-top: 2px;
  padding-left: 18px;
}

.term-output-line {
  color: #8ea2c6;
}

.term-elbow {
  display: inline-block;
  width: 18px;
  color: #6b7a99;
}

.term-more {
  color: #6b7a99;
}

.term-entry--error .term-output-line {
  color: #f87171;
}

.term-diff-row--del {
  background: rgba(127, 29, 29, 0.75);
}

.term-diff-row--add {
  background: rgba(20, 83, 45, 0.75);
}

.term-diff-lineno {
  display: inline-block;
  min-width: 3ch;
  margin-right: 1ch;
  text-align: right;
  color: #6b7a99;
}

.term-diff-row--del .term-diff-lineno {
  color: #fca5a5;
}

.term-diff-row--add .term-diff-lineno {
  color: #86efac;
}

.term-diff-sign {
  display: inline-block;
  width: 2ch;
}

.term-entry--separator {
  margin-top: 16px;
  padding-top: 4px;
  border-top: 1px solid rgba(140, 160, 200, 0.2);
  text-align: center;
  font-size: 11px;
  color: #6b7a99;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace=web -- TerminalPanel`
Expected: all TerminalPanel tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/hud/TerminalPanel.jsx web/src/styles.css web/test/TerminalPanel.test.jsx
git commit -m "feat: add the hover terminal panel HUD"
```

---

### Task 7: Mount the panel, document it, verify end to end

**Files:**
- Modify: `web/src/App.jsx`
- Modify: `web/test/App.test.jsx`
- Modify: `README.md` (after line 125, the HUD paragraph; and after line 158, the snapshot paragraph)
- Modify: `README.zh-CN.md` (after line 120; and after line 152)

**Interfaces:**
- Consumes: `transcriptEntries` from `useOrbit()` (Task 5); `TerminalPanel` (Task 6).
- Produces: the shipped feature.

- [ ] **Step 1: Write the failing test**

In `web/test/App.test.jsx`, add inside the `describe('App', …)` block:

```jsx
  it('mounts the terminal panel with its bottom-edge trigger', () => {
    render(<App />);
    expect(screen.getByTestId('terminal-trigger')).toBeTruthy();
    expect(screen.getByTestId('terminal-panel').getAttribute('data-open')).toBe('false');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace=web -- App`
Expected: the new test FAILS (`Unable to find an element by: [data-testid="terminal-trigger"]`).

- [ ] **Step 3: Mount the panel**

In `web/src/App.jsx`:

- add `import TerminalPanel from './hud/TerminalPanel.jsx';` after the `MilestoneToast` import;
- change the `useOrbit()` destructuring to
  `const { orbitState, lastStatus, renderingPaused, activeStep, recentLog, transcriptEntries } = useOrbit();`
- add as the last child of the HUD overlay `<div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>`, after the `milestone-toast-slot` div:

```jsx
        <TerminalPanel entries={transcriptEntries} />
```

- [ ] **Step 4: Run the full suites**

Run: `npm test && npm test --workspace=web`
Expected: every backend and frontend test PASSES.

- [ ] **Step 5: Document it**

In `README.md`, after the paragraph ending "The **Step list** (bottom-left) shows what Claude is doing right now." add:

```markdown
Move the mouse to the **bottom edge** and the **terminal panel** slides up: a
read-only replay of the session in Claude Code's own style, with your prompts,
Claude's replies, each tool call with its output, and red/green edit diffs.
Move away and it slides back down.
```

After the paragraph starting "New browser tabs first receive a snapshot" add:

```markdown
The terminal panel is fed by the session transcript: hook events carry its
path, the server tails that JSONL file (only files under `~/.claude/projects/`
are accepted) and streams the last 300 entries as `transcript_append` events.
```

In `README.zh-CN.md`, after the line ending "**步骤列表**（左下角）显示 Claude 此刻在做什么。" add:

```markdown
把鼠标移到画面**底部边缘**，**终端面板**会从下往上滑出：它以 Claude Code 的样式只读回放本次会话，
包括你的输入、Claude 的回复、每次工具调用及其输出，以及红绿配色的编辑 diff。鼠标移开后面板自动收起。
```

After the line "新打开的浏览器标签页会先收到一份快照，所以刷新后状态不会丢。" add:

```markdown
终端面板的内容来自会话记录：hook 事件带上记录文件的路径，服务器跟读这个 JSONL 文件
（只接受 `~/.claude/projects/` 下的文件），并以 `transcript_append` 事件推送最近 300 条内容。
```

- [ ] **Step 6: Build and verify in the real app**

Run: `npm run build`
Expected: Vite build succeeds.

Then, from a separate terminal in a scratch directory, run `node <repo>/bin/orbit claude`, send one prompt that makes Claude run a Bash command and edit a file (for example: "run `ls` then add a line `hello` to notes.txt"). In the dashboard:

1. Before hovering: the faint `▲ terminal` hint is centered on the bottom edge; the corner HUDs are still clickable.
2. Hover the bottom edge: the panel slides up and shows `❯` your prompt, `● Bash(ls)` with `⎿` output, `● Edit(notes.txt)` / `● Write(notes.txt)` with a green diff, and Claude's `●` reply.
3. Scroll up in the panel: `↓ 最新` appears; click it to jump back.
4. Move the mouse away: the panel slides down after ~300 ms.
5. Reload the tab and hover again: the same entries are still there (snapshot).

Capture a screenshot with the Playwright MCP (`browser_navigate` to the printed dashboard URL, `browser_hover` near the bottom center, `browser_take_screenshot`) and check it against points 1–2.

- [ ] **Step 7: Commit**

```bash
git add web/src/App.jsx web/test/App.test.jsx README.md README.zh-CN.md
git commit -m "feat: show the terminal panel on the dashboard"
```
