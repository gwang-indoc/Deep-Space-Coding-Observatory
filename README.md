# Deep-Space-Coding-Observatory (Orbit)

Orbit wraps `claude` and exposes its activity as a local event stream for a
future browser-based visualization.

## Usage

    orbit claude [any claude arguments]

This starts a local HTTP+SSE server (default port 4321, falls back to a
free port if taken), opens a browser tab, and spawns `claude` with the same
arguments. Nothing is written to your persistent Claude Code settings —
the hook wiring only exists for the lifetime of this one process.

## Requirements

Node.js >= 20.

## Getting `orbit` on your PATH

Run `npm link` from this directory to install the `orbit`, `orbit-notify`,
and `orbit-statusline` bin entries onto your PATH. Alternatively, skip
installing entirely and run it directly:

    node bin/orbit claude [any claude arguments]

## Known limitations

Running `orbit` replaces any existing Claude Code `statusLine` configuration
for the session, so the terminal status bar goes blank while `orbit` is
active. This will be addressed in a future update.

## Development

    npm test
