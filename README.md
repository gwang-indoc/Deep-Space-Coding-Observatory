# Deep-Space-Coding-Observatory (Orbit)

Orbit wraps `claude` and exposes its activity as a local event stream for a
future browser-based visualization.

## Usage

    orbit claude [any claude arguments]

This starts a local HTTP+SSE server (default port 4321, falls back to a
free port if taken), opens a browser tab, and spawns `claude` with the same
arguments. Nothing is written to your persistent Claude Code settings —
the hook wiring only exists for the lifetime of this one process.

## Development

    npm test
