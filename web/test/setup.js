// Minimal ResizeObserver polyfill for jsdom, which does not implement it.
// @react-three/fiber's <Canvas> (via react-use-measure) requires ResizeObserver
// to exist on window even when it never fires in a jsdom test environment.
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
