import { describe, it, expect } from 'vitest';
import { createAnimationQueue } from '../src/state/animationQueue.js';

describe('createAnimationQueue', () => {
  it('pops in FIFO order', () => {
    const queue = createAnimationQueue();
    queue.push({ type: 'file_read', ts: 1, payload: {} });
    queue.push({ type: 'search', ts: 2, payload: {} });
    expect(queue.pop()).toEqual({ type: 'file_read', ts: 1, payload: {} });
    expect(queue.pop()).toEqual({ type: 'search', ts: 2, payload: {} });
  });

  it('returns null when empty', () => {
    const queue = createAnimationQueue();
    expect(queue.pop()).toBeNull();
  });

  it('reports its size', () => {
    const queue = createAnimationQueue();
    queue.push({ type: 'file_read', ts: 1, payload: {} });
    queue.push({ type: 'file_read', ts: 2, payload: {} });
    expect(queue.size()).toBe(2);
  });

  it('collapses more than 20 queued events of the same type into one batch event', () => {
    const queue = createAnimationQueue({ now: () => 9999 });
    for (let i = 0; i < 21; i += 1) {
      queue.push({ type: 'file_read', ts: i, payload: { file: `f${i}.ts` } });
    }
    const popped = queue.pop();
    expect(popped.type).toBe('batch');
    expect(popped.ts).toBe(9999);
    expect(popped.payload.originalType).toBe('file_read');
    expect(popped.payload.count).toBe(21);
    expect(popped.payload.items).toHaveLength(21);
    expect(queue.size()).toBe(0);
  });

  it('does not batch other event types mixed in with a large backlog of one type', () => {
    const queue = createAnimationQueue();
    for (let i = 0; i < 21; i += 1) {
      queue.push({ type: 'file_read', ts: i, payload: {} });
    }
    queue.push({ type: 'mission_complete', ts: 999, payload: {} });

    queue.pop(); // collapses the 21 file_read events into one batch
    expect(queue.pop()).toEqual({ type: 'mission_complete', ts: 999, payload: {} });
  });

  it('nextIntervalMs stays within the 800-1500ms range using the injected random source', () => {
    const queue = createAnimationQueue({ random: () => 0 });
    expect(queue.nextIntervalMs()).toBe(800);
    const queueMax = createAnimationQueue({ random: () => 1 });
    expect(queueMax.nextIntervalMs()).toBe(1500);
  });
});
