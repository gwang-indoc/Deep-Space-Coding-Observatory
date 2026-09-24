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

  it('keeps retrying on a timer when the first request is refused (page opened unfocused)', async () => {
    const { documentImpl, release } = makeFakeEnv();
    const request = vi.fn()
      .mockRejectedValueOnce(new Error('NotAllowedError'))
      .mockResolvedValue({ release, addEventListener: () => {} });
    let tick = null;
    const controller = createWakeLockController({
      navigatorImpl: { wakeLock: { request } },
      documentImpl,
      windowImpl: { addEventListener() {}, removeEventListener() {} },
      setIntervalImpl: (fn) => { tick = fn; return 1; },
      clearIntervalImpl: () => {},
    });
    await controller.start();
    expect(request).toHaveBeenCalledTimes(1);

    tick();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);

    await Promise.resolve();
    tick(); // lock now held: no further requests
    expect(request).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it('re-requests on window focus after Safari drops the lock while the page stays visible', async () => {
    const { documentImpl } = makeFakeEnv();
    const windowListeners = {};
    const windowImpl = {
      addEventListener: (type, handler) => { windowListeners[type] = handler; },
      removeEventListener: (type) => { delete windowListeners[type]; },
    };
    const sentinelListeners = {};
    const sentinel = { release: vi.fn(), addEventListener: (type, handler) => { sentinelListeners[type] = handler; } };
    const request = vi.fn().mockResolvedValue(sentinel);
    const controller = createWakeLockController({
      navigatorImpl: { wakeLock: { request } },
      documentImpl,
      windowImpl,
      setIntervalImpl: () => 1,
      clearIntervalImpl: () => {},
    });
    await controller.start();
    sentinelListeners.release();
    windowListeners.focus();
    expect(request).toHaveBeenCalledTimes(2);
    controller.stop();
    expect(windowListeners.focus).toBeUndefined();
  });

  it('does not stack requests while one is still pending', async () => {
    const { documentImpl } = makeFakeEnv();
    const request = vi.fn(() => new Promise(() => {}));
    let tick = null;
    const controller = createWakeLockController({
      navigatorImpl: { wakeLock: { request } },
      documentImpl,
      windowImpl: { addEventListener() {}, removeEventListener() {} },
      setIntervalImpl: (fn) => { tick = fn; return 1; },
      clearIntervalImpl: () => {},
    });
    controller.start();
    tick();
    tick();
    expect(request).toHaveBeenCalledTimes(1);
    controller.stop();
  });
});
