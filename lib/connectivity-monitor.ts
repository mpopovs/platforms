/**
 * Real connectivity detection for TV/kiosk displays.
 *
 * `navigator.onLine` is unreliable on Tizen/Samsung Smart TV browsers — it
 * frequently reports `true` even when the router or upstream internet is
 * down, since it only reflects whether the network interface is attached.
 *
 * This module combines `navigator.onLine` with a lightweight, same-origin
 * HEAD probe (see CONNECTIVITY_PROBE_URL) on a fixed interval to produce a
 * single authoritative `online`/`offline` signal shared by every poller in
 * the app (model polling, texture polling, prefetching, etc). Sharing one
 * monitor avoids each component independently spamming the network with its
 * own probe requests.
 *
 * While offline, callers are expected to skip background update checks
 * entirely — no polling, no retries, no console spam — and resume
 * automatically as soon as connectivity is restored.
 */

import {
  CONNECTIVITY_PROBE_INTERVAL_MS,
  CONNECTIVITY_PROBE_TIMEOUT_MS,
  CONNECTIVITY_PROBE_URL,
} from './viewer-runtime-config';

type ConnectivityListener = (online: boolean) => void;

let currentlyOnline = true;
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<ConnectivityListener>();

async function probeOnce(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_PROBE_TIMEOUT_MS);
    const response = await fetch(`${CONNECTIVITY_PROBE_URL}?_=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function setOnline(next: boolean) {
  if (next === currentlyOnline) return;
  currentlyOnline = next;
  console.log(`[connectivity] state changed -> ${next ? 'online' : 'offline'}`);
  listeners.forEach((listener) => listener(currentlyOnline));
}

/** Current known connectivity state (best-effort, updated periodically). */
export function getIsOnline(): boolean {
  return currentlyOnline;
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function subscribeConnectivity(listener: ConnectivityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Starts the shared connectivity monitor (idempotent — safe to call from
 * multiple components). Combines browser online/offline events with a
 * periodic real-world probe.
 */
export function startConnectivityMonitor(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  currentlyOnline = navigator.onLine;

  const check = () => {
    probeOnce().then(setOnline);
  };

  window.addEventListener('online', check);
  window.addEventListener('offline', () => setOnline(false));

  check();
  intervalId = setInterval(check, CONNECTIVITY_PROBE_INTERVAL_MS);
}

/** Stops the shared connectivity monitor (mainly for tests/HMR cleanup). */
export function stopConnectivityMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  started = false;
}
