'use client';

import { useCallback, useEffect, useMemo, useRef, useState, use } from 'react';
import { ExhibitionGrid } from '@/components/exhibition/exhibition-grid';
import { ExhibitionOfflineSync } from '@/components/exhibition/offline-sync';
import { useExhibitionData } from '@/components/exhibition/use-exhibition-data';
import { useExhibitionPreload } from '@/components/exhibition/use-exhibition-preload';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';
import { startConnectivityMonitor } from '@/lib/connectivity-monitor';
import {
  deleteSnapshot,
  exhibitionConfigSnapshotKey,
  fetchWithTimeout,
  loadSnapshot,
  saveSnapshot,
  viewerDataSnapshotKey,
} from '@/lib/exhibition-offline-store';
import type { ExhibitionConfig } from '@/lib/types/exhibition';
import { Loader2, Maximize, Minimize } from 'lucide-react';

const CURSOR_IDLE_HIDE_MS = 3000;
const CONFIG_FETCH_TIMEOUT_MS = 15_000;

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: ExhibitionConfig };

/**
 * Loads the exhibition config, saving a copy in the browser each time so the
 * show can start without internet from the copy saved on its last online
 * load. A 404 (deleted exhibition or regenerated token) removes the copy, so
 * an invalidated show URL stops working offline too.
 */
async function loadExhibitionConfig(token: string): Promise<FetchState> {
  const snapshotKey = exhibitionConfigSnapshotKey(token);
  try {
    const res = await fetchWithTimeout(`/api/exhibition/${token}`, CONFIG_FETCH_TIMEOUT_MS);
    if (res.status === 404) {
      await deleteSnapshot(snapshotKey);
      const data = await res.json().catch(() => ({}));
      return { status: 'error', message: data.error || 'Exhibition not found' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    saveSnapshot(snapshotKey, data.config).catch(() => {});
    return { status: 'ready', config: data.config };
  } catch (err) {
    const snapshot = await loadSnapshot<ExhibitionConfig>(snapshotKey);
    if (snapshot) {
      console.warn('[Exhibition] Could not reach the server — starting from the saved offline copy.', err);
      return { status: 'ready', config: snapshot.data };
    }
    return {
      status: 'error',
      message: "Can't load the exhibition: no connection, and it hasn't been opened on this device while online yet.",
    };
  }
}

/**
 * Fullscreen, chrome-free "Exhibition Grid" show display.
 * Auth: possession of the `token` query param is the only credential needed
 * (no Supabase login) — see /api/exhibition/[token] and lib/exhibition.ts.
 *
 * Offline: everything the show can display is saved in the browser while
 * online (see components/exhibition/offline-sync.tsx), so it keeps running —
 * and can be reloaded — without internet; only new uploads wait for the
 * connection to return.
 */
export default function ExhibitionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'loading' });
  const [paused, setPaused] = useState(false);
  const [forceAdvanceSignal, setForceAdvanceSignal] = useState(0);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load the config by token ──────────────────────────────────────────
  useEffect(() => {
    startConnectivityMonitor();
    if (!token) {
      setFetchState({ status: 'error', message: 'Missing ?token= in the URL.' });
      return;
    }
    let cancelled = false;
    loadExhibitionConfig(token).then((state) => {
      if (!cancelled) setFetchState(state);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const config = fetchState.status === 'ready' ? fetchState.config : null;
  const snapshotKeysInUse = useMemo(
    () =>
      token && config
        ? [exhibitionConfigSnapshotKey(token), ...new Set(config.cells.map((c) => viewerDataSnapshotKey(c.viewerId)))]
        : [],
    [token, config]
  );

  // ── Fetch/poll model+texture data, then preload everything ───────────
  const { modelsById, isLoading: dataLoading } = useExhibitionData(
    config?.cells ?? [],
    config?.tunables.userUploadsPollIntervalMs ?? 30_000
  );
  const preload = useExhibitionPreload(config, modelsById, dataLoading);

  const toggleFullscreen = useCallback(() => {
    const elem = document.documentElement as any;
    if (!document.fullscreenElement) {
      (elem.requestFullscreen || elem.webkitRequestFullscreen || elem.msRequestFullscreen)?.call(elem);
    } else {
      (document.exitFullscreen || (document as any).webkitExitFullscreen)?.call(document);
    }
  }, []);

  // ── Track real fullscreen state (so the button icon/label stay accurate
  // even when fullscreen is toggled via the browser's own UI/Escape key) ──
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    onFullscreenChange();
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // ── Hotkeys: space = pause/resume rotation + waterfall, n = force-next-texture, f = fullscreen ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'n' || e.key === 'N') {
        setForceAdvanceSignal((s) => s + 1);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen]);

  // ── Hide the cursor after a few seconds of no mouse movement ─────────
  useEffect(() => {
    function onMouseMove() {
      setCursorHidden(false);
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
      cursorTimeoutRef.current = setTimeout(() => setCursorHidden(true), CURSOR_IDLE_HIDE_MS);
    }
    window.addEventListener('mousemove', onMouseMove);
    onMouseMove();
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (cursorTimeoutRef.current) clearTimeout(cursorTimeoutRef.current);
    };
  }, []);

  if (fetchState.status === 'error') {
    return (
      <div style={fullscreenCenterStyle}>
        <p style={{ fontSize: 20, opacity: 0.8, maxWidth: 640, textAlign: 'center' }}>{fetchState.message}</p>
      </div>
    );
  }

  if (fetchState.status === 'loading' || !config || dataLoading || !preload.done) {
    const pct = preload.total > 0 ? Math.round((preload.loaded / preload.total) * 100) : 0;
    return (
      <div style={fullscreenCenterStyle}>
        <Loader2 className="animate-spin" style={{ width: 40, height: 40, marginBottom: 16 }} />
        <p style={{ fontSize: 16, opacity: 0.8 }}>
          {fetchState.status === 'loading' || dataLoading
            ? 'Loading exhibition…'
            : `Preloading models & textures… ${pct}% (${preload.loaded}/${preload.total})`}
        </p>
      </div>
    );
  }

  return (
    <div style={{ cursor: cursorHidden ? 'none' : 'default' }}>
      {/* Caches the page itself so it can reload offline. Production only: in `next dev` its
          cache-first page/JS caching would serve code one reload behind while editing. */}
      {process.env.NODE_ENV === 'production' && <ServiceWorkerRegistration precacheCurrentPage />}
      <ExhibitionGrid
        config={config}
        modelsById={modelsById}
        paused={paused}
        forceAdvanceSignal={forceAdvanceSignal}
      />
      <ExhibitionOfflineSync config={config} modelsById={modelsById} snapshotKeysInUse={snapshotKeysInUse} enabled />
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)'}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 50,
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          cursor: 'pointer',
          opacity: cursorHidden ? 0 : 1,
          pointerEvents: cursorHidden ? 'none' : 'auto',
          transition: 'opacity 0.3s ease',
        }}
      >
        {isFullscreen ? <Minimize style={{ width: 20, height: 20 }} /> : <Maximize style={{ width: 20, height: 20 }} />}
      </button>
    </div>
  );
}

const fullscreenCenterStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#000',
  color: '#fff',
};
