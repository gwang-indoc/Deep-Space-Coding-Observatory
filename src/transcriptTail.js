// src/transcriptTail.js
import fs from 'node:fs';
import { createMapperContext, interruptTime, mapTranscriptLine } from './transcriptMapper.js';

const NEWLINE = 0x0a;
const EMPTY = Buffer.alloc(0);

// Whether the byte just before `offset` ends a line, i.e. `offset` starts one.
function startsLine(filePath, offset) {
  const byte = Buffer.alloc(1);
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    return fs.readSync(fd, byte, 0, 1, offset - 1) === 1 && byte[0] === NEWLINE;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Follows one transcript file at a time and emits the entries for each newly
// appended complete line. Bytes are buffered until a newline so neither a
// half-written JSON line nor a multi-byte character split across two reads is
// ever decoded early. It polls with its own timer and compares the file size
// against its own offset: fs.watch is unreliable for appended files on macOS,
// and fs.watchFile takes its baseline stat on the libuv thread pool, so an
// append landing before that stat would go unnoticed until the next write.
// Nothing here may throw into the server. onInterrupt gets the time of each
// user interrupt line, which no hook reports.
export function createTranscriptTail({
  onEntries,
  onInterrupt = () => {},
  intervalMs = 500,
  maxInitialBytes = 2 * 1024 * 1024,
  maxPartialBytes = 8 * 1024 * 1024,
}) {
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
      file.skipFirstLine = file.offset > 0 && !startsLine(file.path, file.offset);
    } else if (size < file.offset) {
      // Rewritten rather than appended to: start over as a new session so the
      // initial cap applies again and ids never repeat.
      start(file.path);
      return;
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
    file.partial = lastNewline === -1 ? data : data.subarray(lastNewline + 1);
    let lines = lastNewline === -1 ? [] : data.subarray(0, lastNewline).toString('utf8').split('\n');
    if (lines.length > 0 && file.skipFirstLine) {
      lines = lines.slice(1);
      file.skipFirstLine = false;
    }
    // An unterminated line this large is not one worth showing; drop what has
    // arrived so the buffer (and the copy each poll) stays bounded, and skip
    // the rest of that line when its newline finally comes.
    if (file.partial.length > maxPartialBytes) {
      file.partial = EMPTY;
      file.skipFirstLine = true;
    }

    const entries = [];
    const interrupts = [];
    for (const text of lines) {
      if (!text.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        continue;
      }
      entries.push(...mapTranscriptLine(obj, file.ctx));
      const interruptedAt = interruptTime(obj);
      if (interruptedAt != null) interrupts.push(interruptedAt);
    }
    if (entries.length > 0) onEntries(entries);
    for (const ts of interrupts) onInterrupt(ts);
  }

  function stopWatching() {
    if (current) clearInterval(current.timer);
  }

  function start(filePath) {
    if (current) {
      stopWatching();
      onEntries([{ id: `separator:${generation}`, kind: 'separator', text: 'new session' }]);
    }
    generation += 1;
    current = {
      path: filePath,
      offset: null,
      partial: EMPTY,
      skipFirstLine: false,
      ctx: createMapperContext({ idPrefix: `g${generation}/` }),
      timer: setInterval(readNew, intervalMs),
    };
    current.timer.unref();
    readNew();
  }

  function follow(filePath) {
    if (current?.path === filePath) return;
    // Catch the old session's last lines, written since the previous poll.
    readNew();
    start(filePath);
  }

  function close() {
    stopWatching();
    current = null;
  }

  return { follow, close };
}
