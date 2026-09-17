'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Lock, Eye, Loader2, Waves, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ViewerModelWithAllTextures, ViewerSettings } from '@/lib/types/viewer';
import { REEF_MAX_CREATURES, REEF_POLL_INTERVAL_MS, classifyCreatureKind } from '@/lib/reef-runtime-config';
import { computeReefHealth, toMillis } from '@/lib/reef-health';
import type { CreatureData } from '@/components/reef/swimming-creature';

// The scene pulls in three.js; load it client-only to keep it out of SSR.
const ReefScene = dynamic(() => import('@/components/reef/reef-scene').then((m) => m.ReefScene), {
  ssr: false,
});

type ReefConfig = {
  id: string;
  name: string;
  logo_url?: string | null;
  parentViewerId?: string | null;
  settings: ViewerSettings;
  updatedAt: number;
};

type Props = {
  viewerId: string;
  config: ReefConfig;
  isAuthenticated: boolean;
  demo?: boolean;
};

// Stable pseudo-random seed in [0,1) from a creature id.
function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// Environmental captions surfaced under the reef, chosen by health band.
const CAPTIONS: { max: number; lines: string[] }[] = [
  { max: 0.34, lines: ['This reef is bleached and quiet.', 'Color a fish to bring it back to life.'] },
  { max: 0.7, lines: ['The reef is waking up.', 'Healthy reefs shelter a quarter of all ocean life.'] },
  { max: 1.01, lines: ['The reef is thriving!', 'Every creature you colored helps the ocean flourish.'] },
];

function captionFor(health: number): string {
  const band = CAPTIONS.find((c) => health < c.max) ?? CAPTIONS[CAPTIONS.length - 1];
  const idx = Math.floor(Date.now() / 8000) % band.lines.length;
  return band.lines[idx];
}

function PinEntryForm({ viewerId }: { viewerId: string }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/viewer-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, pin }),
      });
      const data = await response.json();
      if (response.ok) window.location.reload();
      else setError(data.error || 'Authentication failed');
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a1f2b' }}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center">
            <Lock className="h-6 w-6 text-cyan-600" />
          </div>
          <CardTitle className="text-2xl">Reef Access</CardTitle>
          <CardDescription>Enter your 6-digit PIN to open the reef display</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              autoFocus
              style={{
                width: '100%', height: '48px', padding: '8px 12px', fontSize: '24px',
                textAlign: 'center', letterSpacing: '0.15em', border: '1px solid #d1d5db',
                borderRadius: '6px', backgroundColor: 'white', outline: 'none',
              }}
            />
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">{error}</div>
            )}
            <Button type="submit" className="w-full" disabled={loading || pin.length !== 6}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</>
              ) : (
                <><Eye className="h-4 w-4 mr-2" />Open Reef</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Demo helpers ─────────────────────────────────────────────────────────────
// Generate a colorful placeholder "coloring" as a data URL so the reef can be
// seen alive with no real uploads.
function makeDemoTexture(i: number): string {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const hue = (i * 47) % 360;
  ctx.fillStyle = `hsl(${hue} 80% 60%)`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = `hsl(${(hue + 140) % 360} 85% 55%)`;
  for (let s = 0; s < 6; s++) {
    ctx.beginPath();
    ctx.arc(40 + (s * 37) % 200, 60 + (s * 61) % 160, 18 + (s % 3) * 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 6;
  for (let s = 0; s < 5; s++) {
    ctx.beginPath();
    ctx.moveTo(20, 30 + s * 45);
    ctx.lineTo(236, 60 + s * 40);
    ctx.stroke();
  }
  return c.toDataURL('image/png');
}

export function ReefDisplay({ viewerId, config, isAuthenticated, demo = false }: Props) {
  if (!demo && !isAuthenticated) {
    return <PinEntryForm viewerId={viewerId} />;
  }
  return <ReefContent viewerId={viewerId} config={config} demo={demo} />;
}

function ReefContent({ viewerId, config, demo }: { viewerId: string; config: ReefConfig; demo: boolean }) {
  const [creatures, setCreatures] = useState<CreatureData[]>([]);
  const [health, setHealth] = useState(0.15);
  const [loading, setLoading] = useState(!demo);
  // Upload timestamps (ms) backing the health calculation.
  const timestampsRef = useRef<number[]>([]);

  // Build creature list + timestamps from the all-textures API payload.
  const applyModels = useCallback((models: ViewerModelWithAllTextures[]) => {
    const all: (CreatureData & { uploadedAt: number })[] = [];
    for (const model of models) {
      const kind = classifyCreatureKind(model.name);
      for (const tex of model.textures) {
        const url = tex.corrected_texture_url || tex.original_photo_url;
        if (!url) continue;
        all.push({
          id: tex.id,
          textureUrl: url,
          kind,
          seed: seedFromId(tex.id),
          modelId: model.id,
          uploadedAt: toMillis(tex.uploaded_at),
        });
      }
    }
    // Newest first, cap to the render budget.
    all.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    const capped = all.slice(0, REEF_MAX_CREATURES);
    timestampsRef.current = all.map((c) => c.uploadedAt).filter((t) => Number.isFinite(t));
    setCreatures(capped.map(({ uploadedAt, ...c }) => c));
    setHealth(computeReefHealth(timestampsRef.current));
  }, []);

  // Live data polling (skipped in demo mode).
  useEffect(() => {
    if (demo) return;
    let active = true;
    async function fetchModels() {
      try {
        const res = await fetch(`/api/viewer-models-all-textures/${viewerId}`);
        if (res.ok && active) {
          const data = await res.json();
          applyModels(data.models || []);
        }
      } catch (err) {
        console.warn('[reef] model fetch failed', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchModels();
    const interval = setInterval(fetchModels, REEF_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [viewerId, demo, applyModels]);

  // Health decays with time even without new data — recompute periodically.
  useEffect(() => {
    const interval = setInterval(() => {
      setHealth(computeReefHealth(timestampsRef.current));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // ─── Demo controls ──────────────────────────────────────────────────────────
  const addDemoCreature = useCallback(() => {
    setCreatures((prev) => {
      const i = prev.length;
      const id = `demo_${Date.now()}_${i}`;
      const kind = i % 6 === 0 ? 'plant' : i % 5 === 0 ? 'coral' : 'fish';
      const next: CreatureData = { id, textureUrl: makeDemoTexture(i), kind, seed: seedFromId(id) };
      return [next, ...prev].slice(0, REEF_MAX_CREATURES);
    });
    timestampsRef.current = [Date.now(), ...timestampsRef.current];
    setHealth(computeReefHealth(timestampsRef.current));
  }, []);

  const resetDemo = useCallback(() => {
    setCreatures([]);
    timestampsRef.current = [];
    setHealth(computeReefHealth([]));
  }, []);

  // Seed the demo with a few creatures on first paint.
  useEffect(() => {
    if (!demo) return;
    const seeded: CreatureData[] = Array.from({ length: 8 }, (_, i) => {
      const id = `demo_seed_${i}`;
      const kind = i % 6 === 0 ? 'plant' : i % 5 === 0 ? 'coral' : 'fish';
      return { id, textureUrl: makeDemoTexture(i), kind, seed: seedFromId(id) };
    });
    setCreatures(seeded);
    timestampsRef.current = seeded.map(() => Date.now());
    setHealth(computeReefHealth(timestampsRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  const caption = useMemo(() => captionFor(health), [health, creatures.length]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#22343b' }}>
      <ReefScene creatures={creatures} health={health} />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="animate-spin text-cyan-200" style={{ width: 72, height: 72 }} />
        </div>
      )}

      {/* HUD: reef name + health */}
      <div style={{ position: 'absolute', top: 24, left: 24, color: '#eaffff', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 700 }}>
          <Waves size={26} /> {config.name || 'Living Reef'}
        </div>
        <div style={{ marginTop: 10, width: 220, height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.18)' }}>
          <div
            style={{
              width: `${Math.round(health * 100)}%`, height: '100%', borderRadius: 6,
              background: 'linear-gradient(90deg,#88d8c0,#25c2a0)', transition: 'width 1s ease',
            }}
          />
        </div>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
          Reef health {Math.round(health * 100)}% · {creatures.length} creatures
        </div>
      </div>

      {/* Caption */}
      <div
        style={{
          position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center',
          color: '#eaffff', fontSize: 30, fontWeight: 600, textShadow: '0 2px 12px rgba(0,0,0,0.7)',
          padding: '0 40px', pointerEvents: 'none',
        }}
      >
        {caption}
      </div>

      {/* Demo-only controls */}
      {demo && (
        <div style={{ position: 'absolute', top: 24, right: 24, display: 'flex', gap: 10 }}>
          <Button size="sm" onClick={addDemoCreature}>
            <Plus className="h-4 w-4 mr-1" /> Add creature
          </Button>
          <Button size="sm" variant="secondary" onClick={resetDemo}>
            <RotateCcw className="h-4 w-4 mr-1" /> Bleach reef
          </Button>
        </div>
      )}
    </div>
  );
}
