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
    assert.ok(settings.hooks.Stop[0].hooks[0].command.endsWith('orbit-notify'));
    assert.ok(settings.statusLine.command.endsWith('orbit-statusline'));

    const portInUrl = openedUrl.match(/:(\d+)\//)[1];
    assert.equal(recorded.port, portInUrl);
  } finally {
    fs.rmSync(outFile, { force: true });
    fs.rmSync(fixtureScript, { force: true });
  }
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
