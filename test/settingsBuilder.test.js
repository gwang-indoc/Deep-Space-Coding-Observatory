import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInlineSettings } from '../src/settingsBuilder.js';

test('builds hooks for all five events plus a statusLine command', () => {
  const json = buildInlineSettings({ notifyPath: '/bin/orbit-notify', statuslinePath: '/bin/orbit-statusline', port: 4321 });
  const settings = JSON.parse(json);

  for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop']) {
    assert.ok(settings.hooks[event], `missing hook config for ${event}`);
    const [entry] = settings.hooks[event];
    assert.equal(entry.hooks[0].type, 'command');
    assert.equal(entry.hooks[0].command, "ORBIT_PORT=4321 '/bin/orbit-notify'");
  }

  assert.equal(settings.hooks.PreToolUse[0].matcher, '*');
  assert.equal(settings.hooks.PostToolUse[0].matcher, '*');
  assert.equal(settings.hooks.UserPromptSubmit[0].matcher, undefined);

  assert.deepEqual(settings.statusLine, { type: 'command', command: "ORBIT_PORT=4321 '/bin/orbit-statusline'" });
});

test('shell-quotes command paths containing spaces', () => {
  const json = buildInlineSettings({
    notifyPath: '/Users/x/My Projects/orbit-notify',
    statuslinePath: '/Users/x/My Projects/orbit-statusline',
    port: 4321,
  });
  const settings = JSON.parse(json);

  assert.equal(settings.hooks.Stop[0].hooks[0].command, "ORBIT_PORT=4321 '/Users/x/My Projects/orbit-notify'");
  assert.equal(settings.statusLine.command, "ORBIT_PORT=4321 '/Users/x/My Projects/orbit-statusline'");
});

test('shell-quotes command paths containing a literal single quote', () => {
  const json = buildInlineSettings({
    notifyPath: "/Users/x/it's-orbit/orbit-notify",
    statuslinePath: '/bin/orbit-statusline',
    port: 4321,
  });
  const settings = JSON.parse(json);

  assert.equal(settings.hooks.Stop[0].hooks[0].command, "ORBIT_PORT=4321 '/Users/x/it'\\''s-orbit/orbit-notify'");
});

// Claude Code can relaunch a session itself (fork, resume in the background)
// with the same --settings but without orbit's environment, so the port has to
// travel inside the hook commands.
test('the hook commands carry the dashboard port themselves', () => {
  const settings = JSON.parse(buildInlineSettings({ notifyPath: '/bin/orbit-notify', statuslinePath: '/bin/orbit-statusline', port: 57603 }));
  assert.equal(settings.hooks.UserPromptSubmit[0].hooks[0].command, "ORBIT_PORT=57603 '/bin/orbit-notify'");
  assert.equal(settings.statusLine.command, "ORBIT_PORT=57603 '/bin/orbit-statusline'");
});
