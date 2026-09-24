// src/cliMain.js
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFreePort } from './portFinder.js';
import { createOrbitServer } from './server.js';
import { createSleepGuard } from './sleepGuard.js';
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
    // must never crash the process via an unhandled 'error' event -- but it's still
    // worth telling the user so they aren't left staring at nothing.
    child.on('error', () => {
      console.error('orbit: could not open a browser automatically — visit ' + url);
    });
    child.unref();
  } catch {
    // best-effort only: failing to open a browser must never block the Claude Code session
    console.error('orbit: could not open a browser automatically — visit ' + url);
  }
}

export async function runOrbit(argv, { claudeBin = 'claude', openBrowserFn = defaultOpenBrowser } = {}) {
  if (argv[0] !== 'claude') {
    console.error('orbit: expected "orbit claude [args...]"');
    return 1;
  }
  const claudeArgs = argv.slice(1);

  const port = await findFreePort(DEFAULT_PORT);
  const { close } = await createOrbitServer(port, { sleepGuard: createSleepGuard() });

  const notifyPath = path.join(__dirname, '..', 'bin', 'orbit-notify');
  const statuslinePath = path.join(__dirname, '..', 'bin', 'orbit-statusline');
  const settings = buildInlineSettings({ notifyPath, statuslinePath });

  const url = `http://localhost:${port}/`;
  // Print the URL unconditionally (before attempting to open a browser) so
  // headless/SSH users can still find the dashboard even if no browser can be
  // launched. This must never throw or delay startup.
  console.error(`orbit: dashboard at ${url}`);
  openBrowserFn(url);

  const exitCode = await new Promise((resolve) => {
    const child = spawn(claudeBin, ['--settings', settings, ...claudeArgs], {
      stdio: 'inherit',
      env: { ...process.env, ORBIT_PORT: String(port) },
    });

    // A terminal Ctrl+C (SIGINT) or Ctrl+\ (SIGQUIT) is delivered to the whole
    // foreground process group, including this parent. Node terminates a process
    // immediately on SIGINT/SIGQUIT unless a listener is registered for it -- so
    // without these no-op listeners, `orbit` itself would die immediately while
    // `claude` (which handles SIGINT for its own turn-interruption semantics)
    // keeps running as an orphan. Registering ANY listener suppresses the default
    // terminate behavior, letting the parent stay alive until the child exits.
    const noop = () => {};
    const onSigterm = () => child.kill('SIGTERM');
    const onSighup = () => child.kill('SIGHUP');
    process.on('SIGINT', noop);
    process.on('SIGQUIT', noop);
    // SIGTERM/SIGHUP aren't necessarily delivered to the child the way
    // terminal-generated signals are, so forward them explicitly.
    process.on('SIGTERM', onSigterm);
    process.on('SIGHUP', onSighup);

    function cleanupSignalHandlers() {
      process.removeListener('SIGINT', noop);
      process.removeListener('SIGQUIT', noop);
      process.removeListener('SIGTERM', onSigterm);
      process.removeListener('SIGHUP', onSighup);
    }

    child.on('exit', (code, signal) => {
      cleanupSignalHandlers();
      if (code !== null) {
        resolve(code);
      } else {
        const signalNum = os.constants.signals[signal];
        resolve(128 + (typeof signalNum === 'number' ? signalNum : 1));
      }
    });
    child.on('error', (err) => {
      cleanupSignalHandlers();
      console.error('orbit: failed to start claude: ' + err.message + (err.code ? ` (${err.code})` : ''));
      resolve(1);
    });
  });

  await close();
  return exitCode;
}
