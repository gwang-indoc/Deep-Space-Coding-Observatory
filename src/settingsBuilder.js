// Claude Code runs these `command` strings through a shell, so an unquoted path
// containing a space or shell metacharacter (e.g. an install under
// `~/My Projects/...`) would break silently. Single-quote it, escaping any
// literal single quotes it might contain.
function shellQuote(path) {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

// Claude Code can relaunch a session on its own (a fork, a background resume)
// with the same --settings but without orbit's environment, so each command
// carries the dashboard port itself instead of relying on an inherited ORBIT_PORT.
function commandHook(path, port) {
  return { type: 'command', command: `ORBIT_PORT=${Number(port)} ${shellQuote(path)}` };
}

export function buildInlineSettings({ notifyPath, statuslinePath, port }) {
  const matched = { matcher: '*', hooks: [commandHook(notifyPath, port)] };
  const unmatched = { hooks: [commandHook(notifyPath, port)] };

  return JSON.stringify({
    hooks: {
      UserPromptSubmit: [unmatched],
      PreToolUse: [matched],
      PostToolUse: [matched],
      PostToolUseFailure: [matched],
      Notification: [unmatched],
      Stop: [unmatched],
      SubagentStop: [unmatched],
      StopFailure: [unmatched],
      SessionEnd: [unmatched],
    },
    statusLine: commandHook(statuslinePath, port),
  });
}
