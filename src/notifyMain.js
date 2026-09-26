import fs from 'node:fs';
import { readStdin } from './readStdin.js';
import { postJson } from './httpPost.js';
import { mapHookEvent } from './hookMapper.js';

export async function runNotify({ stdin, env }) {
  try {
    const raw = await readStdin(stdin);
    if (!raw.trim()) return;

    const parsed = JSON.parse(raw);
    const event = mapHookEvent(parsed);
    // Debug aid: set ORBIT_DEBUG_LOG=/path/to/file to capture every raw hook payload.
    if (env.ORBIT_DEBUG_LOG) {
      fs.appendFileSync(env.ORBIT_DEBUG_LOG, JSON.stringify({ raw: parsed, mapped: event }) + '\n');
    }
    if (!event) return;

    const port = Number(env.ORBIT_PORT);
    if (!port) return;

    // Several sessions can share the dashboard, so each event names its session.
    const sessionId = parsed.session_id;
    // The dashboard's terminal panel follows the main session's transcript only;
    // a subagent's hooks carry its own agent_id.
    const transcriptPath = parsed.agent_id ? null : parsed.transcript_path;
    await postJson(port, '/event', {
      ...event,
      ...(typeof sessionId === 'string' && { sessionId }),
      ...(typeof transcriptPath === 'string' && { transcriptPath }),
    });
  } catch {
    // observe-only hook: never let a mapping/network failure affect the wrapped Claude Code session
  }
}
