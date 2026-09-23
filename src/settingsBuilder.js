// Claude Code runs these `command` strings through a shell, so an unquoted path
// containing a space or shell metacharacter (e.g. an install under
// `~/My Projects/...`) would break silently. Single-quote it, escaping any
// literal single quotes it might contain.
function shellQuote(path) {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

function commandHook(path) {
  return { type: 'command', command: shellQuote(path) };
}

export function buildInlineSettings({ notifyPath, statuslinePath }) {
  const matched = { matcher: '*', hooks: [commandHook(notifyPath)] };
  const unmatched = { hooks: [commandHook(notifyPath)] };

  return JSON.stringify({
    hooks: {
      UserPromptSubmit: [unmatched],
      PreToolUse: [matched],
      PostToolUse: [matched],
      Notification: [unmatched],
      Stop: [unmatched],
    },
    statusLine: commandHook(statuslinePath),
  });
}
