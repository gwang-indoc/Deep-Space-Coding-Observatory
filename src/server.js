// src/server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createInitialState, applyEvent, missionStartedAt, snapshotEvent } from './state.js';
import { createTranscriptTail } from './transcriptTail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST_DIR = path.join(__dirname, '..', 'web', 'dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function serveStatic(req, res, webDistDir) {
  const requestedPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(webDistDir, requestedPath);

  // Use a path.sep-bounded prefix check (not a bare startsWith) so a sibling
  // directory whose name happens to share the "dist" prefix (e.g. a future
  // "web/dist-evil" or "web/dist-ssr") can't be reached from here.
  if (filePath !== webDistDir && !filePath.startsWith(webDistDir + path.sep)) {
    res.writeHead(403);
    res.end();
    return true;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const KNOWN_EVENT_TYPES = new Set([
  'file_read',
  'search',
  'file_edit',
  'run_command',
  'run_tests',
  'test_result',
  'planet_sync',
  'agent_start',
  'agent_end',
  'waiting',
  'mission_start',
  'mission_complete',
  'session_end',
  'status_update',
]);

const NO_SLEEP_GUARD = { update() {}, release() {} };

const TRANSCRIPT_LIMIT = 300;

// The dashboard streams the whole session (prompts, command output, diffs), so a
// web page that rebinds its own hostname to 127.0.0.1 must not be able to read
// it. Only loopback host names are served, on any port so the Vite dev proxy
// (which forwards Host: localhost:5173) keeps working.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

// One string per transcript file, however it was reached (a symlinked
// directory, different case on a case-insensitive disk), so the tail does not
// mistake it for a new session. The directory is resolved rather than the file
// because Claude Code may report the path before the file exists.
function canonicalTranscriptPath(filePath) {
  try {
    return path.join(fs.realpathSync.native(path.dirname(filePath)), path.basename(filePath));
  } catch {
    return filePath;
  }
}

function isLoopbackHost(hostHeader) {
  if (typeof hostHeader !== 'string') return false;
  return LOOPBACK_HOSTNAMES.has(hostHeader.replace(/:\d+$/, '').toLowerCase());
}

export function defaultClaudeConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// The server accepts POSTs from anything on this machine, so a transcript path
// is only ever opened if it is a session transcript under Claude's own config.
export function isAcceptedTranscriptPath(candidate, configDir) {
  if (typeof candidate !== 'string' || candidate === '') return false;
  const resolved = path.resolve(candidate);
  const projectsDir = path.resolve(configDir, 'projects');
  return resolved.endsWith('.jsonl') && resolved.startsWith(projectsDir + path.sep);
}

export function createOrbitServer(
  port,
  { webDistDir = WEB_DIST_DIR, sleepGuard = NO_SLEEP_GUARD, configDir = defaultClaudeConfigDir(), transcriptPollMs = 500 } = {}
) {
  const state = createInitialState();
  const clients = new Set();

  function broadcast(event) {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      res.write(line);
    }
  }

  // The terminal panel's backlog: the last TRANSCRIPT_LIMIT entries, replayed in
  // every snapshot and extended by transcript_append broadcasts.
  const transcript = [];
  // The session whose transcript the tail follows, so an interrupt found there
  // ends that session's turn and no other.
  let tailedSessionId;

  function publish(event) {
    applyEvent(state, event);
    broadcast(event);
  }

  const transcriptTail = createTranscriptTail({
    intervalMs: transcriptPollMs,
    // Esc fires no hook, so the interrupt line in the transcript is what ends the turn.
    onInterrupt(interruptedAt) {
      const startedAt = missionStartedAt(state, tailedSessionId);
      // An interrupt older than the running turn is backlog, not this turn's end.
      if (startedAt != null && interruptedAt >= startedAt) {
        const event = { type: 'mission_complete', ts: Date.now(), payload: {} };
        publish(tailedSessionId ? { ...event, sessionId: tailedSessionId } : event);
      }
    },
    onEntries(entries) {
      transcript.push(...entries);
      if (transcript.length > TRANSCRIPT_LIMIT) transcript.splice(0, transcript.length - TRANSCRIPT_LIMIT);
      broadcast({ type: 'transcript_append', ts: Date.now(), payload: { entries: entries.slice(-TRANSCRIPT_LIMIT) } });
    },
  });

  const server = http.createServer((req, res) => {
    if (!isLoopbackHost(req.headers.host)) {
      res.writeHead(403);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/') {
      if (fs.existsSync(webDistDir) && serveStatic(req, res, webDistDir)) {
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>Orbit</title><body>Orbit backend running.</body>');
      return;
    }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(snapshotEvent(state, { transcript }))}\n\n`);
      clients.add(res);
      sleepGuard.update(clients.size);
      req.on('close', () => {
        clients.delete(res);
        sleepGuard.update(clients.size);
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/event') {
      // Requiring JSON forces a CORS preflight, which this server never answers,
      // so a cross-origin page cannot inject events with a "simple" text/plain POST.
      if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
        res.writeHead(415);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed || !KNOWN_EVENT_TYPES.has(parsed.type)) {
            res.writeHead(400);
            res.end();
            return;
          }
          // transcriptPath rides along with hook events but is not part of the
          // event the dashboard sees.
          const { transcriptPath, ...event } = parsed;
          publish(event);
          if (isAcceptedTranscriptPath(transcriptPath, configDir)) {
            tailedSessionId = event.sessionId;
            transcriptTail.follow(canonicalTranscriptPath(path.resolve(transcriptPath)));
          }
          res.writeHead(204);
          res.end();
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
      return;
    }

    if (req.method === 'GET' && fs.existsSync(webDistDir) && serveStatic(req, res, webDistDir)) {
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        close: () =>
          new Promise((r) => {
            // GET /events responses (SSE) never end on their own, so a graceful
            // server.close() would wait forever for them. Force-end any open SSE
            // clients and force-close all sockets so close() always settles.
            for (const res of clients) {
              res.end();
            }
            clients.clear();
            transcriptTail.close();
            sleepGuard.release();
            server.close(r);
            if (typeof server.closeAllConnections === 'function') {
              server.closeAllConnections();
            }
          }),
      });
    });
  });
}
