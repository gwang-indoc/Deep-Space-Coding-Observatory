# Orbit Terminal Panel Design

**Status:** approved in conversation, awaiting written-spec review.

When the mouse reaches the bottom edge of the dashboard, a read-only panel
slides up showing what the Claude Code terminal is saying: prompts, replies,
tool calls with their output, and edit diffs, styled after the Claude Code
TUI. It lets the user follow the session from the dashboard while the real
terminal sits beside it on the same machine.

## 0. Decisions

| Question | Decision |
|---|---|
| Fidelity | **Styled reconstruction** from the session transcript JSONL, not a byte mirror of the TTY. `claude` keeps `stdio: 'inherit'`; no PTY, no `script` wrapper. |
| Interaction | Read-only. No input from the browser. |
| Trigger | Hover the bottom edge → panel slides up; leave → it slides away. |
| Data path | Backend tails the transcript file and pushes entries over the existing SSE stream (approach A). |
| Out of scope | Markdown rendering, subagent internals, the input box / permission prompts / status bar, browser input. |

## 1. Data flow

```text
hook stdin JSON ── orbit-notify ── POST /event { …event, transcriptPath }
                                            │
                                  server: accept path?
                                            │ yes
                                   transcriptTail (poll 500 ms)
                                            │ new complete lines
                                   transcriptMapper (line → entries)
                                            │
                 ring buffer (300) ── SSE: transcript_append { entries }
                                    └─ snapshot.payload.transcript
```

### 1.1 Carrying the path

- `runNotify` adds the hook payload's `transcript_path` to the posted event as
  a top-level `transcriptPath` field, **except** when the payload has an
  `agent_id` (a subagent's hook), so the panel follows only the main session.
- Only events that `mapHookEvent` maps are posted, so the path first arrives
  with the first `UserPromptSubmit`. After that the tail polls on its own, so
  unmapped tools still show up. (A `--resume` session with no prompt yet shows
  nothing until the first prompt; acceptable.)
- The server strips `transcriptPath` before `applyEvent`/`broadcast` handling
  of the event itself; the field is not part of the event contract the
  dashboard sees.

### 1.2 Path acceptance (security)

The server listens on `127.0.0.1` and accepts any local POST, so the path is
validated before it is ever opened:

- resolved with `path.resolve`, must end in `.jsonl`;
- must lie under `<configDir>/projects/` using a `path.sep`-bounded prefix
  check, where `<configDir>` is `$CLAUDE_CONFIG_DIR` if set, else
  `~/.claude`;
- anything else is silently ignored.

### 1.3 `src/transcriptTail.js`

`createTranscriptTail({ onEntries, intervalMs = 500, maxInitialBytes })`
returns `{ follow(filePath), close() }`.

- `follow(p)` with the current path is a no-op. With a new path it stops the
  old watcher, emits a `{ kind: 'separator', text: 'new session' }` entry if a
  previous file was being followed, and starts on the new file.
- Reading starts at byte 0 so a `--resume` session shows its history; the ring
  buffer keeps only the last 300 entries anyway. To avoid parsing huge files,
  if the file is larger than `maxInitialBytes` (default 2 MB) reading starts
  at `size - maxInitialBytes` and the first (partial) line is discarded.
- Polls with `fs.watchFile` (more reliable than `fs.watch` on macOS for
  appended files). On change, reads `[offset, size)`, prepends any buffered
  partial line, splits on `\n`, keeps the trailing partial line in the buffer,
  and advances `offset`.
- If the file shrinks (truncated/replaced), resets `offset` to 0 and clears
  the partial buffer.
- Read errors (missing file, permissions) are swallowed; the next poll
  retries. Nothing here may throw into the server.
- `close()` unwatches; called from the server's `close()`.

### 1.4 `src/transcriptMapper.js`

Pure: `mapTranscriptLine(obj, ctx) → Entry[]`, where `ctx` carries `cwd` (for
relative paths) and a `pendingTools` map `tool_use_id → { name, input }` so a
result can be rendered in the context of its call.

Entry shape (plain JSON, rendered by the frontend):

```js
{ id, kind, ... }
// kind: 'prompt'    { text }
//       'text'      { text }
//       'tool'      { name, summary }
//       'output'    { toolUseId, lines: string[], more: number, isError }
//       'diff'      { toolUseId, file, rows: [{ sign: ' '|'+'|'-', lineNo, text }], more }
//       'notice'    { text }            // e.g. Agent "…" finished
//       'separator' { text }
```

`id` is `<line uuid>:<index>` so React keys are stable across snapshot and
append.

| Transcript line | Entries |
|---|---|
| `user`, string content or `text` blocks, not a task-notification, not `isMeta` | `prompt` |
| `user` content starting with `<task-notification>` | `notice`: `Agent "<summary>" finished` (falls back to status) |
| `assistant` `text` block | `text` |
| `assistant` `tool_use` block | `tool`; `summary` = `Bash`→`command`, `Read`/`Edit`/`Write`→`file_path` relative to cwd, `Grep`/`Glob`→`pattern`, `Agent`/`Task`→`description`, otherwise the first string-valued input field; truncated to 120 chars |
| `user` `tool_result` for an `Edit`/`Write`/`MultiEdit` call with `toolUseResult.structuredPatch` | `diff`, hunks flattened to rows with line numbers, max 20 rows, `more` = remainder |
| any other `tool_result` | `output`: text from `toolUseResult.stdout`/`stderr` or the block's content, first 8 non-empty lines, `more` = remainder, `isError` from `is_error` |
| `thinking`, `system`, `attachment`, `isSidechain: true`, unknown types | nothing |

Any `text`/`prompt` longer than 4000 chars is cut with `…`. A line that fails
`JSON.parse` or throws during mapping yields nothing and is skipped.

### 1.5 Server changes (`src/server.js`)

- Owns one `transcriptTail` and a 300-entry ring buffer.
- On a valid POST whose body has an accepted `transcriptPath`, calls
  `tail.follow(path)`.
- `onEntries(entries)` appends to the buffer and broadcasts
  `{ type: 'transcript_append', ts, payload: { entries } }`.
- `snapshotEvent` gains `payload.transcript` (the buffer).
- `transcript_append` is server-originated only; it is **not** added to
  `KNOWN_EVENT_TYPES`, so it cannot be POSTed.

## 2. Frontend

### 2.1 State

`web/src/state/orbitReducer.js` keeps `transcriptEntries`:

- `snapshot` → replace with `payload.transcript ?? []`;
- `transcript_append` → append, keep the last 300;
- nothing else touches it.

`OrbitProvider` exposes it alongside the existing values. Transcript events do
not go through the animation queue and do not affect mode or active time.

### 2.2 `web/src/hud/TerminalPanel.jsx`

**Trigger**

- An invisible hover strip: `position: absolute; left: 0; right: 0; bottom: 0;
  height: 14px; pointer-events: auto`. The bottom-corner HUDs sit 16 px up, so
  the strip does not overlap them.
- A faint `▲ terminal` hint centered on the bottom edge while closed.
- Entering the strip opens the panel. The panel stays open while hovered.
  Leaving the panel schedules a close after **300 ms**, cancelled by
  re-entering the strip or panel.
- Slide animation with framer-motion (`y: 100% → 0`, ~200 ms).

**Look**

- `left/right: 16px; bottom: 0; height: 45vh`, above the HUDs (higher
  z-index), `background: rgba(10,12,18,0.92)`, `backdrop-filter: blur(6px)`,
  rounded top corners, thin top border matching the existing HUD panels.
- Monospace 13 px. Styling per kind, modeled on the Claude Code TUI:
  - `prompt`: `❯ ` + light grey text;
  - `text`: white `●` + text, `white-space: pre-wrap`;
  - `tool`: white `●` + **Name**`(summary)`;
  - `output`: indented `⎿ ` + grey lines, `… +N lines` when `more > 0`; red
    text when `isError`;
  - `diff`: indented rows, `-` rows on a dark red background with a red line
    number, `+` rows on a dark green background with a green line number,
    context rows plain;
  - `notice`: green `●` + text;
  - `separator`: centered dim rule with the label.
- Empty state: `等待 Claude Code 输出…`.

**Scrolling**

- Sticks to the bottom as entries arrive.
- If the user scrolls up (more than ~24 px from the bottom), following stops
  and a `↓ 最新` button appears bottom-right; clicking it scrolls to the
  bottom and resumes following.
- At most 300 entries are rendered; no virtualization needed.

### 2.3 `App.jsx`

Mount `<TerminalPanel entries={transcriptEntries} />` inside the existing HUD
overlay (`pointer-events: none` container; the panel and strip opt back in).

## 3. Error handling

- Hook side: adding `transcriptPath` stays inside `runNotify`'s existing
  try/catch; a hook must never disturb the Claude Code session.
- Server side: invalid paths are ignored; tail read errors retry on the next
  poll; mapper errors skip the line. None of them fail the POST that carried
  the path.
- Frontend: unknown entry kinds render nothing.

## 4. Testing

Backend (`node:test`, zero runtime deps):

- `test/transcriptMapper.test.js`: fixtures shaped like real transcript lines
  — prompt, assistant text, each tool summary rule, Bash output truncation
  with `more`, error output, Edit `structuredPatch` diff with line numbers and
  row cap, task-notification, and the skipped kinds (thinking, system,
  attachment, sidechain, bad JSON).
- `test/transcriptTail.test.js`: temp files — initial read, append, partial
  line completed by a later append, file switch emits a separator, truncation
  resets, large-file start offset, missing file does not throw.
- `test/server.test.js`: a POST carrying an accepted `transcriptPath` leads to
  an SSE `transcript_append`; the snapshot includes `transcript`; a path
  outside `<configDir>/projects/` or not ending in `.jsonl` is ignored;
  POSTing `transcript_append` is rejected with 400.
- `test/notifyMain.test.js`: `transcriptPath` is attached; it is omitted when
  the payload has `agent_id`.

Frontend (vitest + jsdom):

- reducer: snapshot replaces, append accumulates, 300-entry cap.
- `TerminalPanel`: closed by default; mouseenter on the strip opens it;
  mouseleave closes it after 300 ms (fake timers) and re-entering cancels;
  each entry kind renders with its class/marker; empty state.

End to end: `npm run build`, run `orbit claude`, drive a short session, and
check the hover panel with a Playwright screenshot.

## 5. Files

| File | Change |
|---|---|
| `src/notifyMain.js` | attach `transcriptPath` (not for subagents) |
| `src/transcriptTail.js` | new |
| `src/transcriptMapper.js` | new |
| `src/server.js` | path acceptance, tail, ring buffer, `transcript_append`, snapshot field |
| `src/state.js` | `snapshotEvent` accepts the transcript buffer |
| `web/src/state/orbitReducer.js`, `OrbitProvider.jsx` | `transcriptEntries` |
| `web/src/hud/TerminalPanel.jsx` | new |
| `web/src/App.jsx` | mount the panel |
| `README.md`, `README.zh-CN.md` | one row in the sky guide / how-it-works |
| tests as listed in section 4 | new / extended |
