'use client';

import { Loader2 } from 'lucide-react';

interface ViewerStartupLoaderProps {
  backgroundColor?: string;
  /** Short status line under the spinner, e.g. "Loading textures…" */
  status?: string;
  /** Overlay mode: covers the (still loading) 3D canvas instead of filling the page. */
  overlay?: boolean;
  /** Fade out (overlay mode) — the parent unmounts it once the fade is done. */
  fadingOut?: boolean;
}

/** True for light background colors (#rgb / #rrggbb), so the spinner can switch to dark. */
function isLightColor(color: string): boolean {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/**
 * Startup loading screen for the TV viewer. The same screen is shown through
 * every startup step (page/app load, model list, texture list, first model and
 * texture), so the TV shows one steady indicator instead of a spinner, then
 * text, then a seemingly empty black screen.
 */
export function ViewerStartupLoader({
  backgroundColor = '#000000',
  status,
  overlay = false,
  fadingOut = false,
}: ViewerStartupLoaderProps) {
  const color = isLightColor(backgroundColor) ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.85)';

  return (
    <div
      style={{
        // top/left/right/bottom rather than `inset` — older Tizen browsers lack it
        position: overlay ? 'absolute' : 'relative',
        top: overlay ? 0 : undefined,
        left: overlay ? 0 : undefined,
        right: overlay ? 0 : undefined,
        bottom: overlay ? 0 : undefined,
        zIndex: overlay ? 40 : undefined,
        minHeight: overlay ? undefined : '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: backgroundColor,
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 600ms ease-out',
        pointerEvents: 'none',
      }}
    >
      <Loader2 className="animate-spin" style={{ width: '80px', height: '80px', color }} />
      {status && (
        <p style={{ color, fontSize: '28px', marginTop: '24px', letterSpacing: '0.02em' }}>{status}</p>
      )}
    </div>
  );
}
