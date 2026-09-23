// src/server.js
import http from 'node:http';
import { createInitialState, applyEvent, snapshotEvent } from './state.js';

const KNOWN_EVENT_TYPES = new Set([
  'file_read',
  'search',
  'file_edit',
  'run_command',
  'run_tests',
  'test_result',
  'planet_sync',
  'waiting',
  'mission_start',
  'mission_complete',
  'status_update',
]);

export function createOrbitServer(port) {
  const state = createInitialState();
  const clients = new Set();

  function broadcast(event) {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      res.write(line);
    }
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
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
      res.write(`data: ${JSON.stringify(snapshotEvent(state))}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'POST' && req.url === '/event') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const event = JSON.parse(body);
          if (!event || !KNOWN_EVENT_TYPES.has(event.type)) {
            res.writeHead(400);
            res.end();
            return;
          }
          applyEvent(state, event);
          broadcast(event);
          res.writeHead(204);
          res.end();
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
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
            server.close(r);
            if (typeof server.closeAllConnections === 'function') {
              server.closeAllConnections();
            }
          }),
      });
    });
  });
}
