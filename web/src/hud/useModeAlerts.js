import { useEffect, useRef, useState } from 'react';
import { shouldNotifyWaiting, tabTitleFor } from './modeAlerts.js';

function currentPermission() {
  return typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported';
}

// Keeps the tab title in sync with the mode and raises a desktop notification
// when Claude starts waiting for the user while this tab is in the background.
export function useModeAlerts(mode, message) {
  const [permission, setPermission] = useState(currentPermission);
  const prevModeRef = useRef(null);

  useEffect(() => {
    let tick = 0;
    document.title = tabTitleFor(mode, tick);
    if (mode !== 'waiting') return undefined;
    const id = setInterval(() => {
      tick += 1;
      document.title = tabTitleFor(mode, tick);
    }, 1000);
    return () => clearInterval(id);
  }, [mode]);

  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (!shouldNotifyWaiting(prev, mode) || permission !== 'granted' || !document.hidden) return;
    try {
      const notification = new window.Notification('Claude Code 需要你的输入', {
        body: message || 'Claude 正在等待你的回复',
        tag: 'orbit-waiting',
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Some browsers only allow notifications from a service worker; the banner and title still show.
    }
  }, [mode, message, permission]);

  async function enableNotifications() {
    if (permission !== 'default') return;
    setPermission(await window.Notification.requestPermission());
  }

  return { notifyPermission: permission, enableNotifications };
}
