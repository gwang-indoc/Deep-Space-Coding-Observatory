// test/cliMain.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runOrbit, defaultOpenBrowser } from '../src/cliMain.js';

test('rejects a call that does not start with "claude" and does nothing else', async () => {
  let opened = false;
  const exitCode = await runOrbit(['notclaude'], { openBrowserFn: () => { opened = true; } });
  assert.equal(exitCode, 1);
  assert.equal(opened, false);
});

test('spawns claude with inline --settings, forwards args, and propagates exit code', async () => {
  const outFile = path.join(os.tmpdir(), `orbit-fixture-out-${Date.now()}.json`);
  const fixtureScript = path.join(os.tmpdir(), `orbit-fake-claude-${Date.now()}.mjs`);
  try {
    fs.writeFileSync(
      fixtureScript,
      [
        '#!/usr/bin/env node',
        'import fs from "node:fs";',
        `fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ argv: process.argv.slice(2), port: process.env.ORBIT_PORT }));`,
        'process.exit(7);',
        '',
      ].join('\n')
    );
    fs.chmodSync(fixtureScript, 0o755);

    let openedUrl = null;
    const exitCode = await runOrbit(['claude', '-p', 'hello'], {
      claudeBin: fixtureScript,
      openBrowserFn: (url) => {
        openedUrl = url;
      },
    });

    assert.equal(exitCode, 7);
    assert.match(openedUrl, /^http:\/\/localhost:\d+\/$/);

    const recorded = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.equal(recorded.argv[0], '--settings');
    assert.equal(recorded.argv[2], '-p');
    assert.equal(recorded.argv[3], 'hello');

    const settings = JSON.parse(recorded.argv[1]);
    assert.equal(settings.hooks.PreToolUse[0].matcher, '*');
    // Hook/statusLine commands are shell-quoted (single-quoted), so check the
    // quoted suffix rather than the bare path.
    assert.ok(settings.hooks.Stop[0].hooks[0].command.endsWith("orbit-notify'"));
    assert.ok(settings.statusLine.command.endsWith("orbit-statusline'"));

    const portInUrl = openedUrl.match(/:(\d+)\//)[1];
    assert.equal(recorded.port, portInUrl);
  } finally {
    fs.rmSync(outFile, { force: true });
    fs.rmSync(fixtureScript, { force: true });
  }
});

test('SIGINT while the child is running is absorbed by runOrbit, not the parent process', async () => {
  // Regression test for: Ctrl+C sends SIGINT to the whole foreground process group.
  // Without a SIGINT listener, Node's default behavior terminates the *parent*
  // (`orbit`) immediately, orphaning the child `claude` process. runOrbit should
  // register a no-op SIGINT listener while the child runs so the parent survives,
  // then remove it once the child exits.
  //
  // Sending process.kill(process.pid, 'SIGINT') here targets only this test process
  // (not a real process group), so it cannot prove the child receives the signal --
  // but it does prove the no-op listener genuinely suppresses Node's default
  // terminate-on-SIGINT behavior for the parent: if runOrbit did NOT register a
  // listener, this signal would kill the whole `node --test` run right here.
  const fixtureScript = path.join(os.tmpdir(), `orbit-fake-claude-sleep-${Date.now()}.mjs`);
  fs.writeFileSync(
    fixtureScript,
    [
      '#!/usr/bin/env node',
      '// Deliberately has no SIGINT handler of its own -- it just runs to completion.',
      'setTimeout(() => process.exit(0), 300);',
      '',
    ].join('\n')
  );
  fs.chmodSync(fixtureScript, 0o755);

  const sigintCountBefore = process.listenerCount('SIGINT');

  try {
    const runPromise = runOrbit(['claude'], {
      claudeBin: fixtureScript,
      openBrowserFn: () => {},
    });

    // Give the child time to spawn and runOrbit time to register its listeners.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // If runOrbit's no-op listener were missing, this line would terminate the
    // entire test process (and thus the whole `node --test` run).
    process.kill(process.pid, 'SIGINT');

    const exitCode = await runPromise;

    // The fixture itself doesn't react to SIGINT (sent only to this test process,
    // not a real process group), so it should run to completion and exit 0.
    assert.equal(exitCode, 0);
  } finally {
    fs.rmSync(fixtureScript, { force: true });
  }

  // The listeners added during the child's lifetime must be cleaned up afterward,
  // so `orbit` itself can be interrupted normally again once the child is done.
  assert.equal(process.listenerCount('SIGINT'), sigintCountBefore);
});

test('defaultOpenBrowser does not crash the process when the browser-open command does not exist', async () => {
  // Regression test for: a nonexistent/failing browser-open binary (e.g. no `xdg-open`
  // in a headless environment) emits an ASYNCHRONOUS 'error' event on the spawned
  // ChildProcess. Without a `.on('error', ...)` listener attached, that unhandled
  // 'error' event throws and crashes the whole `orbit` process -- which would also
  // crash this test run (an uncaught exception aborts `node --test`). The fact that
  // this test completes at all (rather than the whole suite dying) demonstrates the
  // listener is in place and swallowing the async spawn failure.
  const bogusCommand = 'orbit-definitely-not-a-real-binary-xyz123';

  assert.doesNotThrow(() => {
    defaultOpenBrowser('http://localhost:1234/', { command: bogusCommand });
  });

  // Give the event loop a turn so the async spawn failure (ENOENT) actually fires its
  // 'error' event before the test finishes; if it were unhandled it would surface here.
  await new Promise((resolve) => setTimeout(resolve, 100));
});
