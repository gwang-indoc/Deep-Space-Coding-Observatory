// src/transcriptTail.js
import fs from 'node:fs';
import { createMapperContext, mapTranscriptLine } from './transcriptMapper.js';

const NEWLINE = 0x0a;

// Follows one transcript file at a time and emits the entries for each newly
// appended complete line. Bytes are buffered until a newline so neither a
// half-written JSON line nor a multi-byte character split across two reads is
// ever decoded early. fs.watchFile polls, which is more reliable than fs.watch
// for appended files on macOS. Nothing here may throw into the server.
export function createTranscriptTail({ onEntries, intervalMs = 500, maxInitialBytes = 2 * 1024 * 1024 }) {
  let current = null;
  let generation = 0;

  function readNew() {
    const file = current;
    if (!file) return;
    let size;
    try {
      size = fs.statSync(file.path).size;
    } catch {
      return; // not created yet, or unreadable; the next poll retries
    }
    if (file.offset === null) {
      file.offset = size > maxInitialBytes ? size - maxInitialBytes : 0;
      file.skipFirstLine = file.offset > 0;
    } else if (size < file.offset) {
      file.offset = 0;
      file.partial = Buffer.alloc(0);
      file.skipFirstLine = false;
    }
    if (size === file.offset) return;

    const chunk = Buffer.alloc(size - file.offset);
    let bytesRead = 0;
    let fd;
    try {
      fd = fs.openSync(file.path, 'r');
      bytesRead = fs.readSync(fd, chunk, 0, chunk.length, file.offset);
    } catch {
      return;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    file.offset += bytesRead;

    const data = Buffer.concat([file.partial, chunk.subarray(0, bytesRead)]);
    const lastNewline = data.lastIndexOf(NEWLINE);
    if (lastNewline === -1) {
      file.partial = data;
      return;
    }
    file.partial = data.subarray(lastNewline + 1);
    let lines = data.subarray(0, lastNewline).toString('utf8').split('\n');
    if (file.skipFirstLine) {
      lines = lines.slice(1);
      file.skipFirstLine = false;
    }

    const entries = [];
    for (const text of lines) {
      if (!text.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        continue;
      }
      entries.push(...mapTranscriptLine(obj, file.ctx));
    }
    if (entries.length > 0) onEntries(entries);
  }

  function stopWatching() {
    if (current) fs.unwatchFile(current.path, current.listener);
  }

  function follow(filePath) {
    if (current?.path === filePath) return;
    if (current) {
      stopWatching();
      onEntries([{ id: `separator:${generation}`, kind: 'separator', text: 'new session' }]);
    }
    generation += 1;
    const listener = () => readNew();
    current = {
      path: filePath,
      offset: null,
      partial: Buffer.alloc(0),
      skipFirstLine: false,
      ctx: createMapperContext({ idPrefix: `g${generation}/` }),
      listener,
    };
    fs.watchFile(filePath, { interval: intervalMs, persistent: false }, listener);
    readNew();
  }

  function close() {
    stopWatching();
    current = null;
  }

  return { follow, close };
}
