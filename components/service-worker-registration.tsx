'use client';

import { useEffect } from 'react';

/**
 * Service Worker Registration Component
 * Registers the service worker for offline caching.
 *
 * NOTE: Auto-reload on SW update is intentionally disabled for TV/kiosk displays.
 * Samsung Frame TV cannot programmatically re-enter fullscreen after a reload
 * (requires a user gesture), so SW updates must never force a page refresh.
 * Updates will take effect naturally on the next manual reload.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Register service worker
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[SW] Registration successful:', registration.scope);

          // Check for updates infrequently — every 6 hours is sufficient for a TV display.
          // Frequent update checks (e.g. every minute) caused the SW to install new versions
          // regularly, which triggered controllerchange → page reload → fullscreen lost.
          setInterval(() => {
            registration.update();
          }, 6 * 60 * 60 * 1000); // 6 hours

          // Log when a new SW is found but do NOT force a reload or show a dialog.
          // The new SW will take over on the next natural page load.
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[SW] New version available — will activate on next page load.');
                  // Do NOT call SKIP_WAITING or reload here: that would immediately
                  // trigger controllerchange and reload the page, exiting fullscreen.
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('[SW] Registration failed:', error);
        });

      // Do NOT reload on controllerchange. On Samsung Frame TV a reload causes
      // the browser to exit fullscreen, and the TV cannot re-enter fullscreen
      // programmatically (requires a user gesture).
      // Previously this handler called window.location.reload() unconditionally,
      // which refreshed the page every time a new SW activated.
    }
  }, []);

  return null;
}
