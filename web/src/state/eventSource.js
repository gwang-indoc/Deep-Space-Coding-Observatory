export function createEventStream({
  url = '/events',
  onSnapshot,
  onStatusUpdate,
  onTranscriptAppend,
  onQueueableEvent,
  EventSourceImpl = typeof window !== 'undefined' ? window.EventSource : undefined,
} = {}) {
  const source = new EventSourceImpl(url);

  source.onmessage = (message) => {
    let event;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    if (!event || typeof event.type !== 'string') return;

    if (event.type === 'snapshot') {
      onSnapshot?.(event.payload);
      return;
    }
    if (event.type === 'status_update') {
      onStatusUpdate?.(event.payload);
      return;
    }
    if (event.type === 'transcript_append') {
      onTranscriptAppend?.(event.payload);
      return;
    }
    onQueueableEvent?.(event);
  };

  return {
    close: () => source.close(),
  };
}
