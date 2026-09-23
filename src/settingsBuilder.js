function commandHook(path) {
  return { type: 'command', command: path };
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
