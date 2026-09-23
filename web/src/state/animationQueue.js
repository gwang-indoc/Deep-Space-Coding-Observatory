const MIN_INTERVAL_MS = 800;
const MAX_INTERVAL_MS = 1500;
const BATCH_THRESHOLD = 20;

export function createAnimationQueue({ now = () => Date.now(), random = Math.random } = {}) {
  let queue = [];

  function push(event) {
    queue.push(event);
  }

  function size() {
    return queue.length;
  }

  function pop() {
    if (queue.length === 0) return null;

    const [first] = queue;
    const sameType = queue.filter((e) => e.type === first.type);

    if (sameType.length > BATCH_THRESHOLD) {
      queue = queue.filter((e) => e.type !== first.type);
      return {
        type: 'batch',
        ts: now(),
        payload: { originalType: first.type, count: sameType.length, items: sameType },
      };
    }

    queue = queue.slice(1);
    return first;
  }

  function nextIntervalMs() {
    return MIN_INTERVAL_MS + random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
  }

  return { push, pop, size, nextIntervalMs };
}
