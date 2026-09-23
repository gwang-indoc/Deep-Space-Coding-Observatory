import { readStdin } from './readStdin.js';
import { postJson } from './httpPost.js';
import { mapStatuslineEvent } from './statuslineMapper.js';

export async function runStatusline({ stdin, env }) {
  try {
    const raw = await readStdin(stdin);
    if (!raw.trim()) return;

    const parsed = JSON.parse(raw);
    const event = mapStatuslineEvent(parsed);

    const port = Number(env.ORBIT_PORT);
    if (!port) return;

    await postJson(port, '/event', event);
  } catch {
    // never let a mapping/network failure affect the wrapped Claude Code session
  }
}
