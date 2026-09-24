// src/sleepGuard.js
import { spawn as defaultSpawn } from 'node:child_process';

// Keeps the Mac awake (display on, no screensaver, no idle sleep) while at
// least one dashboard is connected. The browser's Screen Wake Lock is easy to
// lose (Safari drops it on blur/occlusion), so this is the dependable layer.
// `-w <pid>` makes caffeinate exit on its own if this process dies.
export function createSleepGuard({ platform = process.platform, spawn = defaultSpawn, pid = process.pid } = {}) {
  let child = null;

  function hold() {
    if (platform !== 'darwin' || child) return;
    try {
      child = spawn('caffeinate', ['-d', '-i', '-w', String(pid)], { stdio: 'ignore' });
      // best-effort only: a missing caffeinate binary must never crash the server
      child.on('error', () => {
        child = null;
      });
      child.on('exit', () => {
        child = null;
      });
    } catch {
      child = null;
    }
  }

  function release() {
    child?.kill();
    child = null;
  }

  return {
    // Called with the current number of connected dashboards.
    update(viewerCount) {
      if (viewerCount > 0) hold();
      else release();
    },
    release,
  };
}
