/**
 * Central runtime configuration for the Smart TV / kiosk viewer.
 *
 * See README.md → "Offline-first viewer & daytime refresh control" for the
 * full explanation of why these values exist and how they're used.
 */

// ---------------------------------------------------------------------------
// Daytime refresh window
// ---------------------------------------------------------------------------
// While the current local (device) time falls inside this window, the visible
// page must NEVER perform a full reload — only silent, in-place data/cache
// updates are allowed. Outside the window (night) a full reload is permitted
// so the display always starts each day fully up to date and memory-clean.
//
// Hours are 24h, local device time. A window that crosses midnight
// (e.g. START=22, END=6) is supported.
export const DAYTIME_START_HOUR: number = 8; // 08:00
export const DAYTIME_END_HOUR: number = 22; // 22:00

/** Returns true if `now` falls inside the configured daytime window. */
export function isDaytime(now: Date = new Date()): boolean {
  if (DAYTIME_START_HOUR === DAYTIME_END_HOUR) return true; // window covers 24h
  const hour = now.getHours();
  if (DAYTIME_START_HOUR < DAYTIME_END_HOUR) {
    return hour >= DAYTIME_START_HOUR && hour < DAYTIME_END_HOUR;
  }
  // Window spans midnight (e.g. 22 -> 6)
  return hour >= DAYTIME_START_HOUR || hour < DAYTIME_END_HOUR;
}

// ---------------------------------------------------------------------------
// Background data polling (models / textures)
// ---------------------------------------------------------------------------
// These are lightweight JSON polls that update in-memory state without ever
// reloading the page, so they are safe to run at any time of day — they are
// skipped entirely while offline (see lib/connectivity-monitor.ts).
export const MODEL_POLL_INTERVAL_MS = 30_000;
export const TEXTURE_POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Connectivity probing
// ---------------------------------------------------------------------------
// navigator.onLine is unreliable on Tizen/Smart TV browsers (it usually only
// reflects the network interface, not real internet/server reachability), so
// a real same-origin probe request backs it up.
export const CONNECTIVITY_PROBE_INTERVAL_MS = 20_000;
export const CONNECTIVITY_PROBE_TIMEOUT_MS = 5_000;
// Small, always-present static file — cheap to HEAD-request as a liveness check.
export const CONNECTIVITY_PROBE_URL = '/sw.js';

// ---------------------------------------------------------------------------
// Reload / refresh gating
// ---------------------------------------------------------------------------
// How often a pending "reload once it's allowed" is re-checked against the
// daytime window.
export const REFRESH_GATE_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Preventive maintenance reload to avoid long-running memory/GPU leaks on the
// TV. The timer still starts after this many ms of continuous operation, but
// the actual reload only happens once `isDaytime()` is false (see
// viewer-display.tsx), otherwise it's deferred and re-checked every
// REFRESH_GATE_CHECK_INTERVAL_MS until night.
export const PREVENTIVE_RELOAD_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours
