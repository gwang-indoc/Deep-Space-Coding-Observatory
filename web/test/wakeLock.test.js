import { describe, it, expect, vi } from 'vitest';
import { createWakeLockController } from '../src/state/wakeLock.js';

function makeFakeEnv({ requestImpl } = {}) {
  const listeners = {};
  const documentImpl = {
    visibilityState: 'visible',
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    removeEventListener: (type) => {
      delete listeners[type];
    },
  };
  const release = vi.fn();
  const request = requestImpl ?? vi.fn().mockResolvedValue({ release });
  const navigatorImpl = { wakeLock: { request } };
  return { documentImpl, navigatorImpl, request, release, fireVisibilityChange: () => listeners.visibilitychange?.() };
}

describe('createWakeLockController', () => {
  it('requests a screen wake lock on start()', async () => {
    const { documentImpl, navigatorImpl, request } = makeFakeEnv();
    const controller = createWakeLockController({ navigatorImpl, documentImpl });
    await controller.start();
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('does nothing if the Wake Lock API is unavailable', async () => {
    const controller = createWakeLockController({ navigatorImpl: {}, documentImpl: { addEventListener() {}, removeEventListener() {} } });
    await expect(controller.start()).resolves.toBeUndefined();
  });

  it('releases the sentinel on stop()', async () => {
    const { documentImpl, navigatorImpl, release } = makeFakeEnv();
    const controller = createWakeLockController({ navigatorImpl, documentImpl });
    await controller.start();
    controller.stop();
    expect(release).toHaveBeenCalled();
  });

  it('re-requests the lock when the browser reclaims it in the background and the page becomes visible again', async () => {
    const listeners = {};
    const documentImpl = {
      visibilityState: 'visible',
      addEventListener: (type, handler) => { listeners[type] = handler; },
      removeEventListener: (type) => { delete listeners[type]; },
    };
    const sentinelListeners = {};
    const release = vi.fn();
    const sentinel = {
      release,
      addEventListener: (type, handler) => { sentinelListeners[type] = handler; },
    };
    const request = vi.fn().mockResolvedValue(sentinel);
    const navigatorImpl = { wakeLock: { request } };

    const controller = createWakeLockController({ navigatorImpl, documentImpl });
    await controller.start();
    expect(request).toHaveBeenCalledTimes(1);

    // simulate the browser silently reclaiming the lock (e.g. the tab was hidden by the OS)
    sentinelListeners.release?.();

    documentImpl.visibilityState = 'visible';
    listeners.visibilitychange?.();

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('stop() fully tears down: releases the sentinel and stops reacting to future visibility changes', async () => {
    const listeners = {};
    const documentImpl = {
      visibilityState: 'visible',
      addEventListener: (type, handler) => { listeners[type] = handler; },
      removeEventListener: (type) => { delete listeners[type]; },
    };
    const release = vi.fn();
    const sentinel = { release, addEventListener: () => {} };
    const request = vi.fn().mockResolvedValue(sentinel);
    const navigatorImpl = { wakeLock: { request } };

    const controller = createWakeLockController({ navigatorImpl, documentImpl });
    await controller.start();
    controller.stop();
    expect(release).toHaveBeenCalled();

    documentImpl.visibilityState = 'visible';
    listeners.visibilitychange?.();

    expect(request).toHaveBeenCalledTimes(1); // no re-request after a real stop()
  });
});
