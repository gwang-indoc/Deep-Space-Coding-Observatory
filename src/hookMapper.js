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

// There is genuine uncertainty about the real Claude Code PostToolUse payload
// shape for Bash results: it may be `tool_result` (a string) or `tool_response`
// (an object like `{ stdout, stderr, ... }`). Read defensively so either works.
function extractBashResultText(raw) {
  const result = raw.tool_response ?? raw.tool_result;
  if (result == null) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object') return [result.stdout, result.stderr].filter(Boolean).join('\n');
  return String(result);
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

// Claude Code 2.1+ has no todo tool, so subagents stand in for planets. The
// subagent tool is `Agent`; older builds call it `Task`.
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

// A background subagent reports completion by injecting a user turn such as
// `<task-notification><tool-use-id>toolu_…</tool-use-id><status>completed</status>…`.
function parseTaskNotification(prompt) {
  if (typeof prompt !== 'string' || !prompt.startsWith('<task-notification>')) return null;
  const id = prompt.match(/<tool-use-id>([^<]+)<\/tool-use-id>/)?.[1];
  if (!id) return null;
  const status = prompt.match(/<status>([^<]+)<\/status>/)?.[1] ?? 'completed';
  return { id, status };
}

export function mapHookEvent(raw) {
  const ts = Date.now();

  switch (raw?.hook_event_name) {
    case 'UserPromptSubmit': {
      const prompt = raw.prompt ?? raw.user_prompt ?? '';
      const notification = parseTaskNotification(prompt);
      if (notification) return { type: 'agent_end', ts, payload: { ...notification, resumesMission: true } };
      return { type: 'mission_start', ts, payload: { prompt } };
    }

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
      if (SUBAGENT_TOOLS.has(toolName) && raw.tool_use_id) {
        return { type: 'agent_start', ts, payload: { id: raw.tool_use_id, text: toolInput.description ?? '' } };
      }
      if (toolName === 'TodoWrite') {
        return { type: 'planet_sync', ts, payload: { todos: normalizeTodos(toolInput.todos) } };
      }
      return null;
    }

    case 'PostToolUse': {
      const toolName = raw.tool_name;
      const toolInput = raw.tool_input ?? {};
      if (SUBAGENT_TOOLS.has(toolName) && raw.tool_use_id) {
        // A background launch returns at once; its completion arrives later as a task-notification.
        if (raw.tool_response?.status === 'async_launched') return null;
        return { type: 'agent_end', ts, payload: { id: raw.tool_use_id, status: 'completed' } };
      }
      if (toolName === 'Bash' && classifyBash(toolInput.command) === 'run_tests') {
        return { type: 'test_result', ts, payload: parseTestResult(extractBashResultText(raw)) };
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
