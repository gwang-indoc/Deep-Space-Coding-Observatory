import { describe, it, expect, vi } from 'vitest';
import { createVisibilityPauseController } from '../src/state/visibilityPause.js';

function makeFakeDocument() {
  const listeners = {};
  return {
    hidden: false,
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    removeEventListener: (type) => {
      delete listeners[type];
    },
    fire: () => listeners.visibilitychange?.(),
  };
}

describe('createVisibilityPauseController', () => {
  it('calls onPause when the document becomes hidden', () => {
    const documentImpl = makeFakeDocument();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const controller = createVisibilityPauseController({ documentImpl, onPause, onResume });
    controller.start();

    documentImpl.hidden = true;
    documentImpl.fire();

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('calls onResume when the document becomes visible again', () => {
    const documentImpl = makeFakeDocument();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const controller = createVisibilityPauseController({ documentImpl, onPause, onResume });
    controller.start();

    documentImpl.hidden = true;
    documentImpl.fire();
    documentImpl.hidden = false;
    documentImpl.fire();

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('stop() removes the listener', () => {
    const documentImpl = makeFakeDocument();
    const onPause = vi.fn();
    const controller = createVisibilityPauseController({ documentImpl, onPause });
    controller.start();
    controller.stop();

    documentImpl.hidden = true;
    documentImpl.fire();

    expect(onPause).not.toHaveBeenCalled();
  });
});
