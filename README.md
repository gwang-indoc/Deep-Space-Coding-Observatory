<div align="center">

# 🛰️ Orbit

### Deep-Space-Coding-Observatory

**A local event pipeline for visualizing what Claude Code is doing, in real time.**

![node](https://img.shields.io/badge/node-%3E%3D20-3c873a?logo=node.js&logoColor=white)
![status](https://img.shields.io/badge/status-pipeline%20%2B%20dashboard-blueviolet)
![deps](https://img.shields.io/badge/dependencies-zero-informational)

</div>

---

Orbit wraps the `claude` CLI, captures its activity through session-scoped
hooks, and exposes it as a local HTTP + Server-Sent Events stream — the
backend half of a planned deep-space-themed dashboard for watching Claude
Code work. Nothing is written to your persistent Claude Code settings: the
hook wiring exists only for the lifetime of one `orbit` process.

![Orbit dashboard mid-mission: the central star with todo planets in orbit, the Status HUD top-right, and the step list showing "Editing"](docs/images/orbit-dashboard.png)

<sub>The dashboard during a session: each todo is a planet (green = done,
blue = in progress), tool calls fly out as ships, and the HUD tracks model,
context, and rate-limit usage.</sub>

> **Status:** both halves are built — the event pipeline and the
> [3D dashboard](docs/superpowers/specs/2026-09-22-orbit-frontend-design.md)
> described in the [design doc](docs/superpowers/specs/2026-09-22-orbit-design.md).
> Run `npm run build --workspace=web` before using `orbit` so `GET /` serves
> the real dashboard instead of the plain-text placeholder.

## How it works

```text
   claude (child process)
        │  hooks + statusLine, wired via an inline --settings JSON
        ▼
   orbit-notify / orbit-statusline
        │  read the hook's stdin JSON, map it to an Orbit event
        ▼
   local HTTP server  ── POST /event ──▶  in-memory state
        │                                       │
        └──────────────  GET /events  ◀─────────┘
                     (Server-Sent Events)
                              │
                              ▼
                    a future browser dashboard
```

Every Claude Code action — reading a file, editing, running a command,
running tests, updating its todo list — is mapped to one of Orbit's event
types and streamed out over SSE as it happens.

---

## Usage

```bash
orbit claude [any claude arguments]
```

This picks a free port (default `4321`, falling back automatically if
taken), starts the local server, opens a browser tab, and spawns `claude`
with your arguments passed through untouched.

## Requirements

| | |
|---|---|
| **Runtime** | Node.js >= 20 |
| **On your `PATH`** | `claude` (Claude Code) |

## Installation

```bash
npm link
```

This puts `orbit`, `orbit-notify`, and `orbit-statusline` on your `PATH`.
To skip installing entirely, run it directly instead:

```bash
node bin/orbit claude [any claude arguments]
```

---

## Known limitations

| Limitation | Details |
|---|---|
| **Status line** | Running `orbit` replaces any existing Claude Code `statusLine` configuration for the session, so your terminal status bar goes blank while `orbit` is active. A future update will chain through to your existing status line instead of overriding it. |
| **Windows** | Developed and tested on macOS. Hook-command quoting and the browser-launch fallback are not yet verified on Windows. |

## Development

```bash
npm test
```

Zero runtime dependencies — the whole pipeline is Node.js built-ins
(`http`, `net`, `child_process`) plus the native `node:test` runner.

## Building the frontend

    npm run build --workspace=web

This bundles the React Three Fiber dashboard into `web/dist/`, which
`orbit`'s server serves at `GET /`. Without a build, `GET /` falls back to
a plain-text placeholder — the backend and its tests never require a
frontend build to exist.

For live-reload frontend development, run `npm run dev --workspace=web` in
one terminal and `orbit claude [args...]` in another; the dashboard's dev
server proxies `/events` and `/event` to the running backend.

---

## Design docs

| Doc | What it covers |
|---|---|
| [`claude-observatory-design_1.md`](docs/superpowers/claude-observatory-design_1.md) | Original visual concept |
| [`2026-09-22-orbit-design.md`](docs/superpowers/specs/2026-09-22-orbit-design.md) | Full technical design |
| [`2026-09-22-orbit-event-pipeline.md`](docs/superpowers/plans/2026-09-22-orbit-event-pipeline.md) | Implementation plan for this repo's current state |
