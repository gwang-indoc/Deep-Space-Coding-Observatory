// src/cliMain.js
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFreePort } from './portFinder.js';
import { createOrbitServer } from './server.js';
import { buildInlineSettings } from './settingsBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 4321;

// `command` is overridable only for testability (to force the "binary not found" async
// error path deterministically); real callers always get the platform default.
export function defaultOpenBrowser(url, { command } = {}) {
  const platform = process.platform;
  const resolvedCommand = command ?? (platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open');
  try {
    const child = spawn(resolvedCommand, platform === 'win32' ? ['', url] : [url], { stdio: 'ignore', detached: true });
    // best-effort only: an async spawn failure (e.g. missing `open`/`xdg-open` binary)
    // must never crash the process via an unhandled 'error' event.
    child.on('error', () => {});
    child.unref();
  } catch {
    // best-effort only: failing to open a browser must never block the Claude Code session
  }
}

export async function runOrbit(argv, { claudeBin = 'claude', openBrowserFn = defaultOpenBrowser } = {}) {
  if (argv[0] !== 'claude') {
    console.error('orbit: expected "orbit claude [args...]"');
    return 1;
  }
  const claudeArgs = argv.slice(1);

  const port = await findFreePort(DEFAULT_PORT);
  const { close } = await createOrbitServer(port);

  const notifyPath = path.join(__dirname, '..', 'bin', 'orbit-notify');
  const statuslinePath = path.join(__dirname, '..', 'bin', 'orbit-statusline');
  const settings = buildInlineSettings({ notifyPath, statuslinePath });

  openBrowserFn(`http://localhost:${port}/`);

  const exitCode = await new Promise((resolve) => {
    const child = spawn(claudeBin, ['--settings', settings, ...claudeArgs], {
      stdio: 'inherit',
      env: { ...process.env, ORBIT_PORT: String(port) },
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  await close();
  return exitCode;
}
