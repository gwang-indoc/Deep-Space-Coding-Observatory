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

  it('re-requests the lock when the page becomes visible again after losing it', async () => {
    const { documentImpl, navigatorImpl, request, fireVisibilityChange } = makeFakeEnv();
    const controller = createWakeLockController({ navigatorImpl, documentImpl });
    await controller.start();
    controller.stop(); // simulates the sentinel being released (e.g. tab hidden)
    documentImpl.visibilityState = 'visible';
    fireVisibilityChange();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
