import { describe, it, expect, beforeEach } from 'vitest';
import { createEventStream } from '../src/state/eventSource.js';

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.closed = false;
    FakeEventSource.instances.push(this);
  }
  emit(dataObj) {
    this.onmessage?.({ data: JSON.stringify(dataObj) });
  }
  emitRaw(rawString) {
    this.onmessage?.({ data: rawString });
  }
  close() {
    this.closed = true;
  }
}
FakeEventSource.instances = [];

beforeEach(() => {
  FakeEventSource.instances = [];
});

describe('createEventStream', () => {
  it('connects to the given url', () => {
    createEventStream({ url: '/events', EventSourceImpl: FakeEventSource });
    expect(FakeEventSource.instances[0].url).toBe('/events');
  });

  it('routes a snapshot event to onSnapshot with just its payload', () => {
    const received = [];
    createEventStream({ onSnapshot: (p) => received.push(p), EventSourceImpl: FakeEventSource });
    FakeEventSource.instances[0].emit({ type: 'snapshot', ts: 1, payload: { todos: [], missionActive: false } });
    expect(received).toEqual([{ todos: [], missionActive: false }]);
  });

  it('routes a status_update event to onStatusUpdate with just its payload', () => {
    const received = [];
    createEventStream({ onStatusUpdate: (p) => received.push(p), EventSourceImpl: FakeEventSource });
    FakeEventSource.instances[0].emit({ type: 'status_update', ts: 1, payload: { model: 'Sonnet 5' } });
    expect(received).toEqual([{ model: 'Sonnet 5' }]);
  });

  it('routes any other event type to onQueueableEvent with the full event', () => {
    const received = [];
    createEventStream({ onQueueableEvent: (e) => received.push(e), EventSourceImpl: FakeEventSource });
    FakeEventSource.instances[0].emit({ type: 'file_read', ts: 1, payload: { file: 'a.ts' } });
    expect(received).toEqual([{ type: 'file_read', ts: 1, payload: { file: 'a.ts' } }]);
  });

  it('ignores malformed JSON without throwing', () => {
    createEventStream({ EventSourceImpl: FakeEventSource });
    expect(() => FakeEventSource.instances[0].emitRaw('not json')).not.toThrow();
  });

  it('close() closes the underlying EventSource', () => {
    const stream = createEventStream({ EventSourceImpl: FakeEventSource });
    stream.close();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('routes transcript_append to onTranscriptAppend, not the animation queue', () => {
    const appended = [];
    const queued = [];
    createEventStream({
      onTranscriptAppend: (p) => appended.push(p),
      onQueueableEvent: (e) => queued.push(e),
      EventSourceImpl: FakeEventSource,
    });
    FakeEventSource.instances[0].emit({ type: 'transcript_append', ts: 1, payload: { entries: [{ id: 'a' }] } });
    expect(appended).toEqual([{ entries: [{ id: 'a' }] }]);
    expect(queued).toEqual([]);
  });
});
