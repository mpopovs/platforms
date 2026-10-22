'use client';

import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
declare global { interface Window { __editorInstall?: InstallEvent | null } }

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Makes the scene editor an installable app: registers its own service worker
 * (production only, so development never serves stale code) and keeps the
 * browser's install prompt for the "Install app" button.
 */
export function EditorApp() {
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); window.__editorInstall = e as InstallEvent; notify(); };
    const onInstalled = () => { window.__editorInstall = null; notify(); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/editor-sw.js', { scope: '/admin/scenes' }).catch((e) => console.warn('[editor] service worker', e));
    }
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  return null;
}

/** "Install app" button: shown only when the browser offers installing (Chrome, Edge). */
export function InstallAppButton({ className }: { className?: string }) {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const update = () => setCan(Boolean(window.__editorInstall) && !window.matchMedia('(display-mode: standalone)').matches);
    update(); listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  if (!can) return null;
  return (
    <button
      className={className}
      title="Install the scene editor as an app on this computer"
      onClick={async () => {
        const e = window.__editorInstall; if (!e) return;
        await e.prompt();
        await e.userChoice.catch(() => null);
        window.__editorInstall = null; notify();
      }}
    >
      Install app
    </button>
  );
}
