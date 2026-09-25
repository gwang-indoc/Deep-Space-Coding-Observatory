// src/transcriptMapper.js
import path from 'node:path';

// Turns one line of a Claude Code session transcript (JSONL) into the entries
// the dashboard's terminal panel renders. The transcript format is not a
// documented contract, so every field is read defensively and anything
// unfamiliar is skipped.

const MAX_TEXT = 4000;
const MAX_SUMMARY = 120;
const MAX_OUTPUT_LINES = 8;
const MAX_DIFF_ROWS = 20;
const MAX_LINE_CHARS = 500;

export function createMapperContext({ idPrefix = '' } = {}) {
  return { idPrefix, cwd: null, pendingTools: new Map(), seq: 0 };
}

function clip(text, max) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function relativePath(file, cwd) {
  if (typeof file !== 'string') return '';
  return cwd && file.startsWith(cwd + path.sep) ? file.slice(cwd.length + 1) : file;
}

function toolSummary(name, input, cwd) {
  let value;
  switch (name) {
    case 'Bash':
      value = input.command;
      break;
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      value = relativePath(input.file_path, cwd);
      break;
    case 'Grep':
    case 'Glob':
      value = input.pattern;
      break;
    case 'Agent':
    case 'Task':
      value = input.description;
      break;
    default:
      value = Object.values(input).find((v) => typeof v === 'string');
  }
  return typeof value === 'string' ? clip(value.replace(/\s+/g, ' ').trim(), MAX_SUMMARY) : '';
}

function resultText(block, toolUseResult) {
  if (toolUseResult && typeof toolUseResult === 'object' && ('stdout' in toolUseResult || 'stderr' in toolUseResult)) {
    return [toolUseResult.stdout, toolUseResult.stderr].filter(Boolean).join('\n');
  }
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) {
    return block.content.filter((c) => c?.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n');
  }
  return '';
}

function diffRows(toolUseResult) {
  const hunks = Array.isArray(toolUseResult?.structuredPatch) ? toolUseResult.structuredPatch : [];
  if (hunks.length > 0) {
    const rows = [];
    for (const hunk of hunks) {
      let oldNo = hunk.oldStart;
      let newNo = hunk.newStart;
      for (const line of hunk.lines ?? []) {
        const sign = line[0] === '+' || line[0] === '-' ? line[0] : ' ';
        const text = clip(line.slice(1), MAX_LINE_CHARS);
        if (sign === '-') rows.push({ sign, lineNo: oldNo++, text });
        else if (sign === '+') rows.push({ sign, lineNo: newNo++, text });
        else {
          rows.push({ sign, lineNo: newNo, text });
          oldNo++;
          newNo++;
        }
      }
    }
    return rows;
  }
  // A Write that creates a file has an empty patch; show its content as added lines.
  if (toolUseResult?.type === 'create' && typeof toolUseResult.content === 'string') {
    return toolUseResult.content
      .replace(/\n$/, '')
      .split('\n')
      .map((text, i) => ({ sign: '+', lineNo: i + 1, text: clip(text, MAX_LINE_CHARS) }));
  }
  return null;
}

function pushUserText(text, push) {
  if (typeof text !== 'string') return;
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.startsWith('<task-notification>')) {
    const summary = trimmed.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim();
    const status = trimmed.match(/<status>([^<]+)<\/status>/)?.[1] ?? 'completed';
    push({ kind: 'notice', text: summary || `Agent ${status}` });
    return;
  }
  const command = trimmed.match(/^<command-name>([^<]+)<\/command-name>/)?.[1];
  if (command) {
    push({ kind: 'prompt', text: command });
    return;
  }
  // Other harness markup (local command output, caveats) is not something the user typed.
  if (trimmed.startsWith('<')) return;
  push({ kind: 'prompt', text: clip(trimmed, MAX_TEXT) });
}

function pushToolResult(block, toolUseResult, ctx, push) {
  const toolUseId = block.tool_use_id;
  const call = ctx.pendingTools.get(toolUseId);
  ctx.pendingTools.delete(toolUseId);
  const isError = block.is_error === true;

  if (!isError && call && ['Edit', 'Write', 'MultiEdit'].includes(call.name)) {
    const rows = diffRows(toolUseResult);
    if (rows) {
      const file = relativePath(toolUseResult.filePath ?? call.input.file_path, ctx.cwd);
      push({ kind: 'diff', toolUseId, file, rows: rows.slice(0, MAX_DIFF_ROWS), more: Math.max(0, rows.length - MAX_DIFF_ROWS) });
      return;
    }
  }

  const text = resultText(block, toolUseResult);
  let all = text.split('\n').filter((line) => line.trim() !== '');
  if (!isError && call?.name === 'Read') all = [`Read ${all.length} lines`];
  if (all.length === 0) all = ['(No content)'];
  push({
    kind: 'output',
    toolUseId,
    lines: all.slice(0, MAX_OUTPUT_LINES).map((line) => clip(line, MAX_LINE_CHARS)),
    more: Math.max(0, all.length - MAX_OUTPUT_LINES),
    isError,
  });
}

function mapLine(obj, ctx) {
  if (!obj || typeof obj !== 'object' || obj.isSidechain || obj.isMeta) return [];
  if (typeof obj.cwd === 'string') ctx.cwd = obj.cwd;
  ctx.seq += 1;
  const base = `${ctx.idPrefix}${obj.uuid ?? `line-${ctx.seq}`}`;
  const content = obj.message?.content;
  const entries = [];
  const push = (entry) => entries.push({ id: `${base}:${entries.length}`, ...entry });

  if (obj.type === 'user') {
    if (typeof content === 'string') {
      pushUserText(content, push);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text') pushUserText(block.text, push);
        else if (block?.type === 'tool_result') pushToolResult(block, obj.toolUseResult, ctx, push);
      }
    }
    return entries;
  }

  if (obj.type === 'assistant' && Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        push({ kind: 'text', text: clip(block.text.trim(), MAX_TEXT) });
      } else if (block?.type === 'tool_use') {
        const input = block.input && typeof block.input === 'object' ? block.input : {};
        ctx.pendingTools.set(block.id, { name: block.name, input });
        push({ kind: 'tool', name: String(block.name ?? ''), summary: toolSummary(block.name, input, ctx.cwd) });
      }
    }
  }
  return entries;
}

export function mapTranscriptLine(obj, ctx) {
  try {
    return mapLine(obj, ctx);
  } catch {
    return [];
  }
}
