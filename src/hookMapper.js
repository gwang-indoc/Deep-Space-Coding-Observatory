const TEST_COMMAND_PATTERN = /\b(test|jest|pytest|vitest|rspec)\b|go test/i;

function classifyBash(command) {
  return TEST_COMMAND_PATTERN.test(command || '') ? 'run_tests' : 'run_command';
}

function normalizeTodos(todos) {
  if (!Array.isArray(todos)) return [];
  return todos.map((item, index) => ({
    id: String(item.id ?? index),
    text: item.content ?? item.text ?? '',
    status: item.status ?? 'pending',
  }));
}

function parseTestResult(resultText) {
  const text = String(resultText ?? '');
  const passedMatch = text.match(/(\d+)\s+(?:passed|passing)/i);
  const failedMatch = text.match(/(\d+)\s+(?:failed|failing)/i);
  if (passedMatch || failedMatch) {
    return {
      passed: passedMatch ? Number(passedMatch[1]) : 0,
      failed: failedMatch ? Number(failedMatch[1]) : 0,
    };
  }
  return /fail/i.test(text) ? { passed: 0, failed: 1 } : { passed: 1, failed: 0 };
}

export function mapHookEvent(raw) {
  const ts = Date.now();

  switch (raw?.hook_event_name) {
    case 'UserPromptSubmit':
      return { type: 'mission_start', ts, payload: { prompt: raw.user_prompt ?? '' } };

    case 'PreToolUse': {
      const toolName = raw.tool_name;
      const toolInput = raw.tool_input ?? {};

      if (toolName === 'Read') {
        return { type: 'file_read', ts, payload: { file: toolInput.file_path ?? '' } };
      }
      if (toolName === 'Grep' || toolName === 'Glob') {
        return { type: 'search', ts, payload: {} };
      }
      if (toolName === 'Edit' || toolName === 'Write') {
        return { type: 'file_edit', ts, payload: { file: toolInput.file_path ?? '' } };
      }
      if (toolName === 'Bash') {
        return { type: classifyBash(toolInput.command), ts, payload: { command: toolInput.command ?? '' } };
      }
      if (toolName === 'TodoWrite') {
        return { type: 'planet_sync', ts, payload: { todos: normalizeTodos(toolInput.todos) } };
      }
      return null;
    }

    case 'PostToolUse': {
      const toolName = raw.tool_name;
      const toolInput = raw.tool_input ?? {};
      if (toolName === 'Bash' && classifyBash(toolInput.command) === 'run_tests') {
        return { type: 'test_result', ts, payload: parseTestResult(raw.tool_result) };
      }
      return null;
    }

    case 'Notification':
      return { type: 'waiting', ts, payload: { message: raw.message ?? '' } };

    case 'Stop':
      return { type: 'mission_complete', ts, payload: {} };

    default:
      return null;
  }
}
