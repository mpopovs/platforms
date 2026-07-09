'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import { ExhibitionGrid } from '@/components/exhibition/exhibition-grid';
import { useExhibitionData } from '@/components/exhibition/use-exhibition-data';
import { useExhibitionPreload } from '@/components/exhibition/use-exhibition-preload';
import type { ExhibitionConfig } from '@/lib/types/exhibition';
import { Loader2, Maximize, Minimize } from 'lucide-react';

const CURSOR_IDLE_HIDE_MS = 3000;

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: ExhibitionConfig };

/**
 * Fullscreen, chrome-free "Exhibition Grid" show display.
 * Auth: possession of the `token` query param is the only credential needed
 * (no Supabase login) — see /api/exhibition/[token] and lib/exhibition.ts.
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
    if (!token) {
      setFetchState({ status: 'error', message: 'Missing ?token= in the URL.' });
      return;
    }
    let cancelled = false;
    fetch(`/api/exhibition/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setFetchState({ status: 'error', message: data.error || 'Exhibition not found' });
          return;
        }
        setFetchState({ status: 'ready', config: data.config });
      })
      .catch((err) => {
        if (!cancelled) setFetchState({ status: 'error', message: err.message || 'Failed to load exhibition' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const config = fetchState.status === 'ready' ? fetchState.config : null;

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

  // ── Hotkeys: space = pause/resume rotation, n = force-next-texture, f = fullscreen ──
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
        <p style={{ fontSize: 20, opacity: 0.8 }}>{fetchState.message}</p>
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
      <ExhibitionGrid
        config={config}
        modelsById={modelsById}
        paused={paused}
        forceAdvanceSignal={forceAdvanceSignal}
      />
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
