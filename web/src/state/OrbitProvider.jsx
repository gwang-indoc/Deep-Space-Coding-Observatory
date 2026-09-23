import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { applyOrbitEvent, createInitialOrbitState } from './orbitReducer.js';
import { createAnimationQueue } from './animationQueue.js';
import { createEventStream } from './eventSource.js';
import { createWakeLockController } from './wakeLock.js';
import { createVisibilityPauseController } from './visibilityPause.js';

const OrbitContext = createContext(null);

function labelForEvent(event) {
  switch (event.type) {
    case 'file_read':
      return `Reading ${event.payload.file}`;
    case 'file_edit':
      return `Editing ${event.payload.file}`;
    case 'run_command':
      return `Running: ${event.payload.command}`;
    case 'run_tests':
      return `Running tests: ${event.payload.command}`;
    case 'test_result':
      return `Tests: ${event.payload.passed} passed, ${event.payload.failed} failed`;
    case 'search':
      return 'Searching';
    case 'mission_start':
      return 'Mission started';
    case 'mission_complete':
      return 'Mission complete';
    case 'planet_sync':
      return 'Todo list updated';
    default:
      return null;
  }
}

function stepForEvent(type) {
  switch (type) {
    case 'mission_start':
      return 'planning';
    case 'file_read':
    case 'search':
      return 'reading';
    case 'file_edit':
      return 'editing';
    case 'run_tests':
    case 'test_result':
      return 'testing';
    default:
      return undefined; // leave the previously active step as-is
  }
}

const RECENT_LOG_LIMIT = 5;

export function OrbitProvider({ children }) {
  const [orbitState, dispatch] = useReducer(applyOrbitEvent, undefined, createInitialOrbitState);
  const [lastStatus, setLastStatus] = useState(null);
  const [renderingPaused, setRenderingPaused] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [recentLog, setRecentLog] = useState([]);
  const queueRef = useRef(null);
  if (queueRef.current === null) {
    queueRef.current = createAnimationQueue();
  }

  function applyDispatchedEvent(event) {
    dispatch(event);
    const label = labelForEvent(event);
    if (label) {
      setRecentLog((prev) => [label, ...prev].slice(0, RECENT_LOG_LIMIT));
    }
    const step = stepForEvent(event.type);
    if (step !== undefined) {
      setActiveStep(step);
    }
  }

  useEffect(() => {
    let stream = null;
    if (typeof window !== 'undefined' && window.EventSource) {
      stream = createEventStream({
        onSnapshot: (payload) => {
          dispatch({ type: 'snapshot', ts: Date.now(), payload });
          if (payload.lastStatus) setLastStatus(payload.lastStatus);
        },
        onStatusUpdate: (payload) => setLastStatus(payload),
        onQueueableEvent: (event) => queueRef.current.push(event),
      });
    }

    let timeoutId = null;
    function tick() {
      const next = queueRef.current.pop();
      if (next) {
        if (next.type === 'batch') {
          next.payload.items.forEach((item) => applyDispatchedEvent(item));
        } else {
          applyDispatchedEvent(next);
        }
      }
      timeoutId = setTimeout(tick, queueRef.current.nextIntervalMs());
    }
    tick();

    const wakeLock = createWakeLockController();
    wakeLock.start();

    const visibility = createVisibilityPauseController({
      onPause: () => setRenderingPaused(true),
      onResume: () => setRenderingPaused(false),
    });
    visibility.start();

    return () => {
      stream?.close();
      clearTimeout(timeoutId);
      wakeLock.stop();
      visibility.stop();
    };
  }, []);

  return (
    <OrbitContext.Provider value={{ orbitState, lastStatus, renderingPaused, activeStep, recentLog }}>
      {children}
    </OrbitContext.Provider>
  );
}

export function useOrbit() {
  const ctx = useContext(OrbitContext);
  if (!ctx) throw new Error('useOrbit must be used within OrbitProvider');
  return ctx;
}
