# Orbit Frontend Design Addendum

**Status:** approved, ready for implementation planning.

This addendum pins down the implementation-level decisions for the frontend
described in `docs/superpowers/specs/2026-09-22-orbit-design.md` (sections 4
and the Status HUD subsection of section 4, plus the relevant performance
constraints in section 5). That document is the source of truth for the
*visual and animation design* — event → animation mapping, camera behavior,
Idle Universe, HUD content, animation-queue timing, wake lock, and
render-pause-when-hidden. This addendum does not restate that content; it
covers repo layout, package boundaries, data flow, build/serve integration,
and testing, which the parent spec explicitly left to "a separate frontend
plan."

## 1. Repo layout & package boundaries

Move from a single root package to npm workspaces:

```
Deep-Space-Coding-Observatory/
├── package.json              # root: adds "workspaces": ["web"]
├── src/, bin/, test/          # unchanged — existing backend code
└── web/                       # new workspace package
    ├── package.json           # react, react-dom, three, @react-three/fiber,
    │                          # @react-three/drei, framer-motion; vite + vitest as devDeps
    ├── index.html
    ├── vite.config.js
    ├── src/
    │   ├── main.jsx
    │   ├── scene/
    │   │   ├── Scene.jsx          # fixed-camera R3F canvas root
    │   │   ├── CentralStar.jsx
    │   │   ├── PlanetLayer.jsx    # renders todos from planet_sync
    │   │   ├── Satellites.jsx     # file_read / file_edit, LRU-capped
    │   │   ├── Ship.jsx           # run_command / run_tests / test_result
    │   │   ├── RadarPing.jsx      # search
    │   │   ├── Nebula.jsx         # waiting
    │   │   └── IdleUniverse.jsx
    │   ├── hud/
    │   │   ├── StatusHud.jsx      # model/context/5h/7d
    │   │   └── StepList.jsx       # Planning/Reading/Editing/Testing
    │   └── lib/
    │       ├── eventSource.js     # EventSource wrapper + reconnect handling
    │       ├── animationQueue.js  # throttle/merge logic (pure, unit-tested)
    │       ├── wakeLock.js
    │       └── visibilityPause.js
    └── test/
        ├── animationQueue.test.js
        └── statusHudFormat.test.js
```

The backend package keeps its zero-runtime-dependency property; the new
dependencies (React, Three.js, R3F, drei, framer-motion, Vite, Vitest) are
scoped to `web/` only and do not appear in the root `package.json`.

## 2. Data flow

```
GET /events (SSE)
      │
      ▼
web/src/lib/eventSource.js
      │  parses `data: {...}` lines, re-subscribes on disconnect
      ▼
      ├─ type === 'status_update'  ──────────────► StatusHud (direct state update, no queue)
      │
      └─ everything else ──► animationQueue.js ──► scene components (via React state/context)
                                (800–1500ms pacing;
                                 merges bursts of the
                                 same type into a
                                 "batch" event when the
                                 backlog exceeds ~20)
```

This matches the parent spec's explicit rule: animation speed is decoupled
from event arrival speed, and `status_update` never touches the animation
queue since it only refreshes the HUD.

`animationQueue.js` is a pure module — it takes events in, exposes a
"next event to play" pull (or callback) interface, and has no DOM/Three.js
dependency. That's what makes it unit-testable per the parent spec's
testing section.

`eventSource.js` handles the reconnect/`snapshot` case: on (re)connect it
applies the initial `snapshot` event immediately (todos, `missionActive`,
`lastStatus`) bypassing the queue, exactly as the parent spec requires for
avoiding a blank screen after refresh.

## 3. Build & serve integration

- `web/package.json` gets a `build` script (`vite build`, output to
  `web/dist/`) and a `dev` script (`vite`) for local iteration.
- Root `package.json` gains a `build` script that runs the workspace build
  (`npm run build --workspace=web`), and `"workspaces": ["web"]`.
- `src/server.js`'s `GET /` handler changes from the hardcoded placeholder
  string to serving static files out of `web/dist/` (index.html, JS, CSS
  bundles) when that directory exists. Path resolution is relative to the
  package root, not `process.cwd()`, so `orbit` works regardless of the
  caller's working directory.
- **Fallback:** if `web/dist/` doesn't exist (e.g. someone runs backend
  tests or `orbit` without ever running `npm run build`), `GET /` falls
  back to today's placeholder HTML string. This keeps the existing backend
  test suite and a fresh clone's first `node --test` run working without
  forcing a frontend build step into the backend's test path.
- No dev-server proxying: the CLI always serves the production build. Devs
  who want live-reload run `vite dev` directly against the already-running
  backend's `/events` and `/event` endpoints (Vite's dev server proxies API
  requests to the backend port via `vite.config.js` `server.proxy`).

## 4. Testing strategy

- **`animationQueue.js`**: unit tests (Vitest, since `web/` is already an
  npm-dependency zone) covering: single-event pacing timing, burst-merge
  threshold (>20 queued same-type events collapse to one "batch" event),
  and that `status_update` is never accepted into the queue (it's routed
  around it, so the queue module doesn't need to special-case it — the
  caller filters before enqueueing).
- **HUD formatting**: unit tests for percentage rounding / threshold-color
  logic (pure functions extracted from `StatusHud.jsx`), not component
  rendering.
- **Manual verification**: full scene rendering, camera behavior, Idle
  Universe, wake lock, and visibility-pause are manual-acceptance only, per
  the parent spec's section 6 ("不做 3D 渲染像素级快照测试"). The
  implementation plan's final task includes an end-to-end manual checklist
  mirroring that section.
- **Backend regression**: existing `test/server.test.js` needs a new case
  confirming `GET /` still returns the placeholder string when `web/dist/`
  is absent, so the fallback path doesn't silently break.

## 5. Scope

Full MVP per the parent spec: all 8 animation event types, Idle Universe,
Status HUD, animation-queue throttling/batching, Screen Wake Lock, and
render-pause when the tab is hidden — built as one implementation plan,
task-by-task, the same way the backend plan was structured.
