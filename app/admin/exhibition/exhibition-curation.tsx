'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Loader2, Save, Trash2, RefreshCw, Download, Upload, X, Plus, ExternalLink, Pencil } from 'lucide-react';
import {
  GRID_PRESETS,
  createDefaultCellConfig,
  type ExhibitionConfig,
  type ExhibitionCellConfig,
  type GridPresetKey,
  type GridLayout,
  type TextureMode,
  type TextureCycleStrategy,
  type WaterfallConfig,
  type TextureChangeBlinkConfig,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_EXHIBITION_TUNABLES,
  DEFAULT_TEXTURE_CHANGE_BLINK,
  TEXTURE_CHANGE_BLINK_FRAMES_MAX,
  TEXTURE_CHANGE_BLINK_FRAMES_MIN,
  DEFAULT_MODEL_SCALE,
  DEFAULT_WATERFALL_CONFIG,
  MODEL_SCALE_MAX,
  MODEL_SCALE_MIN,
  WATERFALL_LOOP_GAP_MAX,
  WATERFALL_SPEED_MAX,
  WATERFALL_SPEED_MIN,
  normalizeBackgroundColor,
  normalizeModelScale,
  normalizeRandomTextureTiming,
  normalizeShowConnectionIndicator,
  normalizeTextureChangeBlink,
  normalizeWaterfallConfig,
  cyclingUsesInterval,
  waterfallLoopPeriod,
  RANDOM_TEXTURE_TIMING_SPREAD,
} from '@/lib/types/exhibition';
import {
  createExhibitionConfigAction,
  updateExhibitionConfigAction,
  deleteExhibitionConfigAction,
  regenerateExhibitionTokenAction,
} from '@/app/actions';
import { ExhibitionGrid } from '@/components/exhibition/exhibition-grid';
import { LiveConnectionIndicator } from '@/components/exhibition/connection-indicator';
import { useExhibitionData } from '@/components/exhibition/use-exhibition-data';
import { rootDomain, protocol } from '@/lib/utils';

interface BrowserModel {
  id: string;
  viewer_id: string;
  name: string;
  model_file_url: string;
  texture_template_url: string | null;
  order_index: number;
}

interface BrowserViewer {
  id: string;
  name: string;
  models: BrowserModel[];
}

interface ModelTextureOption {
  id: string;
  corrected_texture_url: string;
  uploaded_at: string;
}

const PRESET_LABELS: Record<GridPresetKey, string> = {
  '1x2': '1 x 2 (2 models)',
  '2x2': '2 x 2 (4 models)',
  '2x3': '2 x 3 (6 models)',
  '3x3': '3 x 3 (9 models)',
  '4x4': '4 x 4 (16 models)',
  '4x5': '4 x 5 (20 models)',
  'hero-plus-5': 'Hero + 5',
  'hero-plus-9': 'Hero + 9',
};

function formatWaterfallLoop({ speed, loopGap }: WaterfallConfig): string {
  const seconds = (waterfallLoopPeriod(loopGap) * 100) / speed;
  return `one loop every ${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)}s`;
}

function formatBlinkLength(frames: number): string {
  return `${frames} frame${frames === 1 ? '' : 's'} (≈${Math.round((frames * 1000) / 60)} ms at 60 fps)`;
}

function allModelsFlat(viewers: BrowserViewer[]): Array<BrowserModel & { viewerName: string }> {
  return viewers.flatMap((v) => v.models.map((m) => ({ ...m, viewerName: v.name })));
}

export function ExhibitionCuration({
  viewers,
  initialConfigs,
}: {
  viewers: BrowserViewer[];
  initialConfigs: ExhibitionConfig[];
}) {
  const [configs, setConfigs] = useState<ExhibitionConfig[]>(initialConfigs);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [name, setName] = useState('New Exhibition');
  const [presetKey, setPresetKey] = useState<GridPresetKey>('2x2');
  const [layout, setLayout] = useState<GridLayout>(GRID_PRESETS['2x2']);
  const [cells, setCells] = useState<ExhibitionCellConfig[]>([]);
  const [modelScale, setModelScale] = useState(DEFAULT_MODEL_SCALE);
  const [waterfall, setWaterfall] = useState<WaterfallConfig>(DEFAULT_WATERFALL_CONFIG);
  const [showConnectionIndicator, setShowConnectionIndicator] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
  const [textureChangeBlink, setTextureChangeBlink] = useState<TextureChangeBlinkConfig>(DEFAULT_TEXTURE_CHANGE_BLINK);
  const [randomTextureTiming, setRandomTextureTiming] = useState(false);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [texturesByModel, setTexturesByModel] = useState<Record<string, ModelTextureOption[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cellById = useMemo(() => new Map(cells.map((c) => [c.cellId, c])), [cells]);
  const flatModels = useMemo(() => allModelsFlat(viewers), [viewers]);
  const selectedCell = selectedCellId ? cellById.get(selectedCellId) : null;

  // Live preview data — reuses the same batching/polling logic the show route uses.
  const { modelsById } = useExhibitionData(cells, DEFAULT_EXHIBITION_TUNABLES.userUploadsPollIntervalMs);

  const previewConfig: ExhibitionConfig = useMemo(
    () => ({
      id: activeConfigId ?? 'preview',
      userId: '',
      name,
      layout,
      cells,
      tunables: DEFAULT_EXHIBITION_TUNABLES,
      modelScale,
      waterfall,
      showConnectionIndicator,
      backgroundColor,
      textureChangeBlink,
      randomTextureTiming,
      accessToken: accessToken ?? '',
      createdAt: 0,
      updatedAt: 0,
    }),
    [
      activeConfigId,
      name,
      layout,
      cells,
      modelScale,
      waterfall,
      showConnectionIndicator,
      backgroundColor,
      textureChangeBlink,
      randomTextureTiming,
      accessToken,
    ]
  );

  function applyPreset(key: GridPresetKey) {
    const newLayout = GRID_PRESETS[key];
    const validIds = new Set(newLayout.cells.map((c) => c.id));
    setPresetKey(key);
    setLayout(newLayout);
    // Drop assignments for cells that no longer exist in the new layout.
    setCells((prev) => prev.filter((c) => validIds.has(c.cellId)));
    setSelectedCellId(null);
  }

  async function ensureTexturesLoaded(modelId: string) {
    if (texturesByModel[modelId]) return;
    try {
      const res = await fetch(`/api/model-textures/${modelId}`);
      if (!res.ok) return;
      const data = await res.json();
      setTexturesByModel((prev) => ({ ...prev, [modelId]: data.textures || [] }));
    } catch (err) {
      console.error('Failed to load textures for model', modelId, err);
    }
  }

  function assignModel(cellId: string, viewerId: string, modelId: string) {
    setCells((prev) => {
      const existing = prev.find((c) => c.cellId === cellId);
      if (existing) {
        return prev.map((c) => (c.cellId === cellId ? { ...c, viewerId, modelId, lockedTextureId: undefined } : c));
      }
      return [...prev, createDefaultCellConfig(cellId, viewerId, modelId)];
    });
    ensureTexturesLoaded(modelId);
    setSelectedCellId(cellId);
  }

  function clearCell(cellId: string) {
    setCells((prev) => prev.filter((c) => c.cellId !== cellId));
    if (selectedCellId === cellId) setSelectedCellId(null);
  }

  function updateSelectedCell(patch: Partial<ExhibitionCellConfig>) {
    if (!selectedCellId) return;
    setCells((prev) => prev.map((c) => (c.cellId === selectedCellId ? { ...c, ...patch } : c)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (activeConfigId) {
        const result = await updateExhibitionConfigAction(activeConfigId, {
          name,
          layout,
          cells,
          modelScale,
          waterfall,
          showConnectionIndicator,
          backgroundColor,
          textureChangeBlink,
          randomTextureTiming,
        });
        if (!result.success || !result.config) {
          setError(result.error || 'Failed to save');
          return;
        }
        setConfigs((prev) => prev.map((c) => (c.id === activeConfigId ? result.config! : c)));
        setAccessToken(result.config.accessToken);
      } else {
        const result = await createExhibitionConfigAction({
          name,
          layout,
          cells,
          modelScale,
          waterfall,
          showConnectionIndicator,
          backgroundColor,
          textureChangeBlink,
          randomTextureTiming,
        });
        if (!result.success || !result.config) {
          setError(result.error || 'Failed to save');
          return;
        }
        setConfigs((prev) => [result.config!, ...prev]);
        setActiveConfigId(result.config.id);
        setAccessToken(result.config.accessToken);
      }
    } finally {
      setSaving(false);
    }
  }

  function loadConfig(config: ExhibitionConfig) {
    setActiveConfigId(config.id);
    setAccessToken(config.accessToken);
    setName(config.name);
    setLayout(config.layout);
    setCells(config.cells);
    setModelScale(config.modelScale);
    setWaterfall(config.waterfall);
    setShowConnectionIndicator(config.showConnectionIndicator);
    setBackgroundColor(config.backgroundColor);
    setTextureChangeBlink(config.textureChangeBlink);
    setRandomTextureTiming(config.randomTextureTiming);
    setSelectedCellId(null);
    // Best-effort match to a known preset label; falls back silently if custom.
    const matchedPreset = (Object.keys(GRID_PRESETS) as GridPresetKey[]).find(
      (key) => GRID_PRESETS[key].columns === config.layout.columns && GRID_PRESETS[key].rows === config.layout.rows
    );
    if (matchedPreset) setPresetKey(matchedPreset);
    config.cells.forEach((c) => ensureTexturesLoaded(c.modelId));
  }

  function newConfig() {
    setActiveConfigId(null);
    setAccessToken(null);
    setName('New Exhibition');
    applyPreset('2x2');
    setCells([]);
    setModelScale(DEFAULT_MODEL_SCALE);
    setWaterfall(DEFAULT_WATERFALL_CONFIG);
    setShowConnectionIndicator(true);
    setBackgroundColor(DEFAULT_BACKGROUND_COLOR);
    setTextureChangeBlink(DEFAULT_TEXTURE_CHANGE_BLINK);
    setRandomTextureTiming(false);
  }

  async function handleDelete(configId: string = activeConfigId ?? '') {
    if (!configId) return;
    const target = configs.find((c) => c.id === configId);
    if (!confirm(`Delete exhibition "${target?.name ?? name}"? This cannot be undone.`)) return;
    const result = await deleteExhibitionConfigAction(configId);
    if (result.success) {
      setConfigs((prev) => prev.filter((c) => c.id !== configId));
      if (configId === activeConfigId) newConfig();
    } else {
      setError(result.error || 'Failed to delete');
    }
  }

  async function handleRegenerateToken() {
    if (!activeConfigId) return;
    if (!confirm('This invalidates the current show URL. Continue?')) return;
    const result = await regenerateExhibitionTokenAction(activeConfigId);
    if (result.success && result.accessToken) {
      setAccessToken(result.accessToken);
    } else {
      setError(result.error || 'Failed to regenerate token');
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(
        {
          name,
          layout,
          cells,
          modelScale,
          waterfall,
          showConnectionIndicator,
          backgroundColor,
          textureChangeBlink,
          randomTextureTiming,
        },
        null,
        2
      )], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.exhibition.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (parsed.name) setName(parsed.name);
        if (parsed.layout) setLayout(parsed.layout);
        if (parsed.cells) setCells(parsed.cells);
        setModelScale(normalizeModelScale(parsed.modelScale));
        setWaterfall(normalizeWaterfallConfig(parsed.waterfall));
        setShowConnectionIndicator(normalizeShowConnectionIndicator(parsed.showConnectionIndicator));
        setBackgroundColor(normalizeBackgroundColor(parsed.backgroundColor));
        setTextureChangeBlink(normalizeTextureChangeBlink(parsed.textureChangeBlink));
        setRandomTextureTiming(normalizeRandomTextureTiming(parsed.randomTextureTiming));
        setActiveConfigId(null);
        setAccessToken(null);
      } catch (err) {
        setError('Invalid exhibition JSON file');
      }
    };
    reader.readAsText(file);
  }

  const showUrl = accessToken ? `${protocol}://${rootDomain}/exhibition?token=${accessToken}` : null;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exhibition Grid</h1>
          <p className="text-sm text-gray-500 mt-0.5">Curate the multi-model show display for the art show.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={newConfig}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New Exhibition
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export
          </Button>
          <label className="inline-flex">
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
                />
              </span>
            </Button>
          </label>
          {activeConfigId && (
            <Button variant="outline" size="sm" onClick={() => handleDelete()} className="text-red-600 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || cells.length === 0}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">{error}</div>
      )}

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Saved Exhibitions{configs.length > 0 && <span className="text-gray-400 font-normal"> ({configs.length})</span>}
          </p>
          {configs.length === 0 ? (
            <p className="text-sm text-gray-400">No exhibitions saved yet — build one below and click Save.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {configs.map((c) => {
                const url = `${protocol}://${rootDomain}/exhibition?token=${c.accessToken}`;
                const isActive = activeConfigId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 py-2.5 flex-wrap rounded-md ${isActive ? 'bg-blue-50/60 -mx-2 px-2' : ''}`}
                  >
                    <div className="min-w-[140px]">
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-400">
                        {c.cells.length} cell{c.cells.length !== 1 ? 's' : ''}
                        {c.waterfall.enabled && ' · waterfall'}
                      </p>
                    </div>
                    <code className="text-xs text-gray-500 flex-1 min-w-[180px] truncate">{url}</code>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(url)} title="Copy show URL">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" asChild title="Open show URL">
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => loadConfig(c)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(c.id)}
                        className="text-red-500 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="exhibition-name">Name</Label>
              <Input id="exhibition-name" value={name} onChange={(e) => setName(e.target.value)} className="w-64" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="layout-preset">Layout</Label>
              <select
                id="layout-preset"
                className="text-sm border border-gray-300 rounded-md px-2 py-2 bg-white h-9"
                value={presetKey}
                onChange={(e) => applyPreset(e.target.value as GridPresetKey)}
              >
                {(Object.keys(PRESET_LABELS) as GridPresetKey[]).map((key) => (
                  <option key={key} value={key}>{PRESET_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div className="text-xs text-gray-500">
              {cells.length} / {layout.cells.length} cells assigned
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-4 pt-4 border-t border-gray-100">
            <div className="space-y-1.5">
              <Label htmlFor="background-color">Background</Label>
              <div className="flex items-center gap-2 h-9">
                <input
                  id="background-color"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                />
                <span className="text-xs text-gray-500 tabular-nums">{backgroundColor}</span>
              </div>
            </div>
            <SliderField
              id="model-size"
              label="Object size (all models)"
              min={MODEL_SCALE_MIN * 100}
              max={MODEL_SCALE_MAX * 100}
              step={5}
              value={Math.round(modelScale * 100)}
              onChange={(percent) => setModelScale(percent / 100)}
              readout={`${Math.round(modelScale * 100)}%`}
            />
            <div className="space-y-1.5">
              <Label htmlFor="waterfall-enabled">Waterfall</Label>
              <label className="flex items-center gap-2 h-9 text-sm text-gray-700">
                <input
                  id="waterfall-enabled"
                  type="checkbox"
                  checked={waterfall.enabled}
                  onChange={(e) => setWaterfall((w) => ({ ...w, enabled: e.target.checked }))}
                />
                Scroll grid down in a loop
              </label>
            </div>
            {waterfall.enabled && (
              <>
                <SliderField
                  id="waterfall-speed"
                  label="Waterfall speed"
                  min={WATERFALL_SPEED_MIN}
                  max={WATERFALL_SPEED_MAX}
                  step={0.5}
                  value={waterfall.speed}
                  onChange={(speed) => setWaterfall((w) => ({ ...w, speed }))}
                  readout={formatWaterfallLoop(waterfall)}
                />
                <SliderField
                  id="waterfall-loop-gap"
                  label="Space between loops"
                  min={0}
                  max={WATERFALL_LOOP_GAP_MAX}
                  step={5}
                  value={waterfall.loopGap}
                  onChange={(loopGap) => setWaterfall((w) => ({ ...w, loopGap }))}
                  readout={waterfall.loopGap === 0 ? 'none' : `${waterfall.loopGap}% of screen`}
                />
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="random-texture-timing">Texture change timing</Label>
              <label
                className="flex items-center gap-2 h-9 text-sm text-gray-700"
                title={`Each change waits a random ${Math.round((1 - RANDOM_TEXTURE_TIMING_SPREAD) * 100)}–${Math.round((1 + RANDOM_TEXTURE_TIMING_SPREAD) * 100)}% of the cell's own interval`}
              >
                <input
                  id="random-texture-timing"
                  type="checkbox"
                  checked={randomTextureTiming}
                  onChange={(e) => setRandomTextureTiming(e.target.checked)}
                />
                Random — objects change at different moments
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="texture-change-blink">Blink on texture change</Label>
              <label className="flex items-center gap-2 h-9 text-sm text-gray-700">
                <input
                  id="texture-change-blink"
                  type="checkbox"
                  checked={textureChangeBlink.enabled}
                  onChange={(e) => setTextureChangeBlink((b) => ({ ...b, enabled: e.target.checked }))}
                />
                Hide object briefly when its texture changes
              </label>
            </div>
            {textureChangeBlink.enabled && (
              <SliderField
                id="texture-change-blink-frames"
                label="Blink length"
                min={TEXTURE_CHANGE_BLINK_FRAMES_MIN}
                max={TEXTURE_CHANGE_BLINK_FRAMES_MAX}
                step={1}
                value={textureChangeBlink.frames}
                onChange={(frames) => setTextureChangeBlink((b) => ({ ...b, frames }))}
                readout={formatBlinkLength(textureChangeBlink.frames)}
              />
            )}
            <div className="space-y-1.5">
              <Label htmlFor="connection-indicator">Connection indicator</Label>
              <label
                className="flex items-center gap-2 h-9 text-sm text-gray-700"
                title="Small dot in the bottom-left corner of the show: green = online, everything saved for offline use; amber = still saving; red = offline, showing saved content"
              >
                <input
                  id="connection-indicator"
                  type="checkbox"
                  checked={showConnectionIndicator}
                  onChange={(e) => setShowConnectionIndicator(e.target.checked)}
                />
                Show status dot in corner
              </label>
            </div>
          </div>

          {showUrl && (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-md text-sm">
              <code className="text-xs text-blue-800 flex-1 truncate">{showUrl}</code>
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(showUrl)} title="Copy show URL">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRegenerateToken} title="Regenerate token (invalidates old URL)">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Grid editor */}
        <Card>
          <CardContent className="pt-6">
            <div
              className="grid gap-1.5 bg-gray-100 rounded-md p-2"
              style={{
                gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
                gridTemplateRows: `repeat(${layout.rows}, minmax(70px, 1fr))`,
              }}
            >
              {layout.cells.map((rect) => {
                const cell = cellById.get(rect.id);
                const model = cell ? flatModels.find((m) => m.id === cell.modelId) : undefined;
                const isSelected = selectedCellId === rect.id;
                return (
                  <button
                    key={rect.id}
                    onClick={() => setSelectedCellId(rect.id)}
                    style={{
                      gridColumn: `${rect.col + 1} / span ${rect.colSpan ?? 1}`,
                      gridRow: `${rect.row + 1} / span ${rect.rowSpan ?? 1}`,
                    }}
                    className={`relative rounded-md border-2 flex flex-col items-center justify-center p-2 text-center transition-colors ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-dashed border-gray-300 bg-white hover:border-blue-300'
                    }`}
                  >
                    {model ? (
                      <>
                        <span className="text-xs font-medium text-gray-800 truncate max-w-full">{model.name}</span>
                        <span className="text-[10px] text-gray-400">{model.viewerName}</span>
                        <span className={`mt-1 text-[10px] px-1.5 py-0.5 rounded-full ${cell!.textureMode === 'original-locked' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {cell!.textureMode === 'original-locked'
                            ? 'locked'
                            : cyclingUsesInterval(cell!.cycling.strategy)
                              ? `uploads · ${cell!.cycling.intervalSec}s`
                              : 'uploads · newest'}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">+ Assign model</span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Side panel */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            {!selectedCellId ? (
              <p className="text-sm text-gray-400">Select a cell to configure it.</p>
            ) : (
              <CellSettingsPanel
                cellId={selectedCellId}
                cell={selectedCell ?? null}
                viewers={viewers}
                textures={selectedCell ? texturesByModel[selectedCell.modelId] : undefined}
                onAssignModel={(viewerId, modelId) => assignModel(selectedCellId, viewerId, modelId)}
                onUpdate={updateSelectedCell}
                onClear={() => clearCell(selectedCellId)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live preview */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-gray-500 mb-2">Live preview</p>
          <div className="relative w-full rounded-md overflow-hidden border border-gray-200" style={{ aspectRatio: '16 / 9' }}>
            {cells.length > 0 ? (
              <>
                <ExhibitionGrid config={previewConfig} modelsById={modelsById} fullscreen={false} />
                {showConnectionIndicator && <LiveConnectionIndicator />}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-gray-400 bg-black/5">
                Assign at least one model to preview
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SliderField({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  readout,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  readout: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3 h-9">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-44 accent-blue-600"
        />
        <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{readout}</span>
      </div>
    </div>
  );
}

/**
 * Seconds field that can be cleared and retyped: the value is only committed
 * once it's a number ≥ 1, and snaps back to the last valid value on blur.
 */
function SecondsInput({ id, value, onChange }: { id: string; value: number; onChange: (seconds: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Pick up changes made elsewhere (another cell selected, a config loaded), but not while typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(value));
  }, [value]);

  return (
    <Input
      ref={inputRef}
      id={id}
      type="number"
      min={1}
      step={1}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const seconds = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(seconds) && seconds >= 1) onChange(seconds);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

function CellSettingsPanel({
  cellId,
  cell,
  viewers,
  textures,
  onAssignModel,
  onUpdate,
  onClear,
}: {
  cellId: string;
  cell: ExhibitionCellConfig | null;
  viewers: BrowserViewer[];
  textures: ModelTextureOption[] | undefined;
  onAssignModel: (viewerId: string, modelId: string) => void;
  onUpdate: (patch: Partial<ExhibitionCellConfig>) => void;
  onClear: () => void;
}) {
  const currentViewer = viewers.find((v) => v.id === cell?.viewerId) ?? viewers[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Cell settings</p>
        {cell && (
          <button onClick={onClear} className="text-gray-400 hover:text-red-600" title="Unassign">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Viewer</Label>
        <select
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-2 bg-white h-9"
          value={currentViewer?.id ?? ''}
          onChange={(e) => {
            const viewer = viewers.find((v) => v.id === e.target.value);
            if (viewer?.models[0]) onAssignModel(viewer.id, viewer.models[0].id);
          }}
        >
          {viewers.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>Model</Label>
        <select
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-2 bg-white h-9"
          value={cell?.modelId ?? ''}
          onChange={(e) => currentViewer && onAssignModel(currentViewer.id, e.target.value)}
        >
          <option value="" disabled>Choose a model…</option>
          {currentViewer?.models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {cell && (
        <>
          <div className="space-y-1.5">
            <Label>Texture mode</Label>
            <select
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-2 bg-white h-9"
              value={cell.textureMode}
              onChange={(e) => onUpdate({ textureMode: e.target.value as TextureMode })}
            >
              <option value="original-locked">Original (locked)</option>
              <option value="user-uploads">User uploads</option>
            </select>
          </div>

          {cell.textureMode === 'original-locked' ? (
            <div className="space-y-1.5">
              <Label>Locked texture</Label>
              <select
                className="w-full text-sm border border-gray-300 rounded-md px-2 py-2 bg-white h-9"
                value={cell.lockedTextureId ?? ''}
                onChange={(e) => onUpdate({ lockedTextureId: e.target.value || undefined })}
              >
                <option value="">Model template (default)</option>
                {textures?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {new Date(t.uploaded_at).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Cycling strategy</Label>
                <select
                  className="w-full text-sm border border-gray-300 rounded-md px-2 py-2 bg-white h-9"
                  value={cell.cycling.strategy}
                  onChange={(e) => onUpdate({ cycling: { ...cell.cycling, strategy: e.target.value as TextureCycleStrategy } })}
                >
                  <option value="newest-first">Newest first</option>
                  <option value="cycle">Cycle in order</option>
                  <option value="random">Random</option>
                </select>
              </div>
              {cyclingUsesInterval(cell.cycling.strategy) ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cell-interval">Change texture every (seconds)</Label>
                  <SecondsInput
                    id="cell-interval"
                    value={cell.cycling.intervalSec}
                    onChange={(intervalSec) => onUpdate({ cycling: { ...cell.cycling, intervalSec } })}
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Shows the newest upload and changes only when a new one arrives. To change textures every few seconds,
                  choose “Cycle in order” or “Random”.
                </p>
              )}
            </>
          )}

          <div className="space-y-1.5 pt-2 border-t border-gray-100">
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cell.rotation.enabled}
                onChange={(e) => onUpdate({ rotation: { ...cell.rotation, enabled: e.target.checked } })}
              />
              Auto-rotate
            </Label>
          </div>
          {cell.rotation.enabled && (
            <>
              <div className="space-y-1.5">
                <Label>Rotation speed</Label>
                <Input
                  type="number"
                  step={0.05}
                  min={0}
                  value={cell.rotation.speed}
                  onChange={(e) => onUpdate({ rotation: { ...cell.rotation, speed: Number(e.target.value) || 0 } })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <select
                  className="w-full text-sm border border-gray-300 rounded-md px-2 py-2 bg-white h-9"
                  value={cell.rotation.direction}
                  onChange={(e) => onUpdate({ rotation: { ...cell.rotation, direction: Number(e.target.value) as 1 | -1 } })}
                >
                  <option value={1}>Clockwise</option>
                  <option value={-1}>Counter-clockwise</option>
                </select>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
