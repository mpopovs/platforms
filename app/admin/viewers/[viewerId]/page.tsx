'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Copy, ArrowLeft, Trash2, QrCode, Download, Map as MapIcon, FileImage, Palette, Upload, Plus, FileText, BarChart3, Edit, Check, Code, LayoutTemplate, Images, Loader2, RefreshCw as RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  deleteViewerAction,
  updateViewerAction,
  generateNewPinAction,
  generateEmbedTokenAction,
  getViewerModelsWithTexturesAction,
  upload3DModelAction,
  delete3DModelAction,
  updateModelNameAction,
  updateModelFileAction
} from '@/app/actions';
import type { ViewerModelWithTexture } from '@/lib/types/viewer';
import { ViewerSettingsDialog } from '@/components/viewer-settings-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Viewer = {
  id: string;
  name: string;
  short_code: string | null;
  created_at: string;
  logo_url: string | null;
  settings: {
    textureCycling?: {
      enabled?: boolean;
      priorityTimeWindow?: number;
      priorityRepeatCount?: number;
      standardDisplayDuration?: number;
    };
    backgroundColor?: string;
    rotationSpeed?: number;
    showModelName?: boolean;
    showLogoInViewer?: boolean;
    ambientLightIntensity?: number;
    directionalLightIntensity?: number;
    widgetEnabled?: boolean;
    storageMode?: 'server' | 'local' | 'hybrid';
    enableArucoDetection?: boolean;
    defaultModelId?: string;
    surveyEnabled?: boolean;
    surveyLanguage?: string;
    certificateBottomImageUrl?: string;
    classroomEnabled?: boolean;
    textureModerationEnabled?: boolean;
  };
  parent_viewer_id?: string | null;
};

type ModelManagementProps = {
  viewerId: string;
  viewerShortCode: string | null;
  viewerName: string;
  widgetEnabled: boolean;
  initialModels: ViewerModelWithTexture[];
  /** When this is a classroom (child) viewer, pass its ID to highlight classroom textures */
  classroomViewerId?: string | null;
};

type PinState = {
  success?: boolean;
  error?: string;
  pin?: string;
  message?: string;
};

type EmbedTokenState = {
  success?: boolean;
  error?: string;
  embedToken?: string;
  message?: string;
};

type UploadModelState = {
  success?: boolean;
  error?: string;
  modelId?: string;
  message?: string;
};

// Import necessary components
import { AllTexturesDialog } from '@/components/all-textures-dialog';
import { TextureModerationPanel } from '@/components/texture-moderation-panel';

/** Shows all textures uploaded via this classroom viewer, grouped by model */
function ClassroomTexturesDialog({
  open,
  onOpenChange,
  viewerName,
  classroomViewerId,
  models,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerName: string;
  classroomViewerId: string;
  models: ViewerModelWithTexture[];
}) {
  const [texturesByModel, setTexturesByModel] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || models.length === 0) return;
    fetchAll();
    const iv = setInterval(() => fetchAll(true), 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const results = await Promise.all(
        models.map(async (m) => {
          const res = await fetch(`/api/model-textures/${m.id}?viewerId=${classroomViewerId}`);
          const data = res.ok ? await res.json() : { textures: [] };
          return { modelId: m.id, modelName: m.name, textures: (data.textures || []) as any[] };
        })
      );
      const map: Record<string, any[]> = {};
      results.forEach(({ modelId, textures }) => { map[modelId] = textures; });
      setTexturesByModel(map);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleDelete = async (modelId: string, textureId: string) => {
    if (!confirm('Delete this texture? This cannot be undone.')) return;
    setDeletingId(textureId);
    try {
      const res = await fetch(`/api/model-textures/${modelId}?textureId=${textureId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setTexturesByModel((prev) => ({
        ...prev,
        [modelId]: prev[modelId].filter((t) => t.id !== textureId),
      }));
    } catch {
      alert('Failed to delete texture');
    } finally {
      setDeletingId(null);
    }
  };

  const totalCount = Object.values(texturesByModel).reduce((s, ts) => s + ts.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Class Textures — {viewerName}</DialogTitle>
              <DialogDescription>
                {loading ? 'Loading…' : `${totalCount} texture${totalCount !== 1 ? 's' : ''} uploaded by this class across ${models.length} model${models.length !== 1 ? 's' : ''}`}
              </DialogDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => fetchAll()} disabled={loading} className="ml-4">
              <RefreshCwIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No textures uploaded by this class yet</div>
        ) : (
          <div className="space-y-6">
            {models.map((model) => {
              const textures = texturesByModel[model.id] || [];
              if (textures.length === 0) return null;
              return (
                <div key={model.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">{model.name}</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{textures.length}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {textures.map((texture, i) => (
                      <div key={texture.id} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                        <img
                          src={texture.corrected_texture_url}
                          alt={`Texture ${i + 1}`}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 w-7 p-0"
                            disabled={deletingId === texture.id}
                            onClick={() => handleDelete(model.id, texture.id)}
                          >
                            {deletingId === texture.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        {i === 0 && (
                          <span className="absolute bottom-1.5 left-1.5 text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                            Latest
                          </span>
                        )}
                        <div className="px-2 py-1.5 text-xs text-gray-500">
                          {new Date(texture.uploaded_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadModelDialog({ 
  viewerId, 
  onSuccess 
}: { 
  viewerId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState<UploadModelState, FormData>(
    upload3DModelAction,
    {}
  );

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      onSuccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Upload 3D Model
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload 3D Model</DialogTitle>
          <DialogDescription>
            Upload a GLB or OBJ file. A QR code will be generated for texture uploads.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="viewerId" value={viewerId} />
          
          <div className="space-y-2">
            <Label htmlFor="modelName">Model Name</Label>
            <Input
              id="modelName"
              name="modelName"
              type="text"
              placeholder="My 3D Model"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modelFile">3D Model File</Label>
            <Input
              id="modelFile"
              name="modelFile"
              type="file"
              accept=".glb,.gltf,.obj"
              required
            />
            <p className="text-xs text-gray-500">Supported formats: GLB, GLTF, OBJ (max 50MB)</p>
          </div>

          {state.error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {state.error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Uploading...' : 'Upload Model'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModelManagement({ viewerId, viewerShortCode, viewerName, widgetEnabled, initialModels, classroomViewerId }: ModelManagementProps) {
  const [models, setModels] = useState<ViewerModelWithTexture[]>(initialModels);

  const refreshModels = useCallback(async () => {
    try {
      const updatedModels = await getViewerModelsWithTexturesAction(viewerId);
      setModels(updatedModels);
    } catch (error) {
      console.error('Failed to refresh models:', error);
    }
  }, [viewerId]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <UploadModelDialog viewerId={viewerId} onSuccess={refreshModels} />
      </div>

      {models.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
          <Upload className="h-8 w-8 mb-3 opacity-40" />
          <p className="text-sm font-medium">No 3D models yet</p>
          <p className="text-xs mt-1 opacity-70">Upload your first model to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/80 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-4 py-3 text-left">Model</th>
                <th className="px-4 py-3 text-left">Upload Link</th>
                <th className="px-4 py-3 text-center">Textures</th>
                <th className="px-4 py-3 text-center">Assets</th>
                <th className="px-4 py-3 text-center">UV Map</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {models.map((model, idx) => (
                <ModelRow
                  key={model.id}
                  index={idx + 1}
                  model={model}
                  viewerId={viewerId}
                  viewerName={viewerName}
                  widgetEnabled={widgetEnabled}
                  onDelete={refreshModels}
                  classroomViewerId={classroomViewerId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModelRow({
  index,
  model,
  viewerId,
  viewerName,
  widgetEnabled,
  onDelete,
  classroomViewerId
}: {
  index: number;
  model: ViewerModelWithTexture;
  viewerId: string;
  viewerName: string;
  widgetEnabled: boolean;
  onDelete: () => void;
  classroomViewerId?: string | null;
}) {
  const [showTexturesDialog, setShowTexturesDialog] = useState(false);
  const [showUVMapDialog, setShowUVMapDialog] = useState(false);
  const [showSVGTemplateDialog, setShowSVGTemplateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [uploadingUVMap, setUploadingUVMap] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uvSvgContent, setUvSvgContent] = useState('');
  const [generatedTemplate, setGeneratedTemplate] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ArUco marker dictionary (subset for client-side generation)
  // Values from official OpenCV ARUCO_6X6_1000 / DICT_6X6_1000 dictionary
  const ARUCO_DICT: { [key: number]: number[] } = {
    0: [30, 61, 216, 42, 6], 1: [14, 251, 163, 137, 1], 2: [21, 144, 126, 172, 13], 3: [201, 27, 48, 105, 14],
    4: [214, 7, 214, 225, 5], 5: [216, 232, 224, 230, 8], 6: [66, 104, 180, 31, 5], 7: [136, 165, 15, 41, 10],
    8: [48, 125, 82, 79, 13], 9: [60, 47, 52, 179, 12], 10: [69, 223, 199, 78, 3], 11: [72, 216, 91, 37, 7],
    12: [113, 5, 88, 252, 6], 13: [134, 220, 250, 208, 7], 14: [141, 114, 169, 63, 6], 15: [162, 184, 157, 205, 14],
    16: [9, 253, 30, 156, 4], 17: [21, 77, 189, 24, 15], 18: [48, 10, 49, 14, 2], 19: [72, 7, 239, 175, 13],
    20: [86, 223, 17, 219, 6], 21: [102, 136, 50, 116, 12], 22: [118, 232, 203, 120, 1], 23: [154, 83, 217, 207, 3],
    24: [169, 203, 132, 2, 4], 25: [198, 117, 73, 73, 0], 26: [193, 210, 136, 148, 1], 27: [231, 72, 8, 82, 11],
    28: [234, 47, 202, 132, 8], 29: [233, 99, 183, 123, 1], 30: [250, 54, 101, 42, 15], 31: [6, 91, 255, 123, 13],
    32: [5, 65, 215, 45, 6], 33: [12, 247, 36, 106, 2], 34: [19, 56, 163, 158, 11], 35: [21, 168, 147, 231, 4],
    36: [58, 65, 126, 233, 14], 37: [79, 17, 226, 108, 0], 38: [83, 13, 182, 210, 0], 39: [88, 155, 250, 227, 4],
    40: [100, 9, 232, 160, 11], 41: [96, 83, 122, 137, 1], 42: [97, 89, 6, 155, 10], 43: [107, 255, 120, 215, 11],
    44: [112, 173, 150, 164, 15], 45: [117, 132, 111, 113, 10], 46: [122, 149, 25, 47, 12], 47: [134, 9, 118, 10, 10],
    48: [138, 45, 68, 195, 15], 49: [147, 235, 120, 177, 4], 50: [152, 141, 168, 77, 4], 51: [158, 222, 43, 60, 8],
    52: [165, 41, 224, 123, 8], 53: [181, 147, 184, 85, 15], 54: [183, 248, 228, 38, 15], 55: [188, 32, 82, 37, 14],
    56: [192, 68, 135, 118, 5], 57: [196, 195, 36, 37, 9], 58: [197, 169, 27, 216, 13], 59: [206, 115, 230, 178, 12],
    60: [205, 12, 166, 39, 2], 61: [201, 67, 93, 68, 13], 62: [207, 190, 128, 243, 4], 63: [229, 125, 21, 135, 7],
    64: [239, 198, 133, 142, 9], 65: [247, 126, 243, 119, 2], 66: [44, 228, 63, 37, 4], 67: [43, 220, 255, 75, 3],
    68: [55, 199, 221, 189, 10], 69: [161, 162, 84, 224, 15], 70: [169, 130, 193, 187, 5], 71: [216, 27, 73, 176, 8],
    72: [3, 88, 41, 248, 6], 73: [7, 196, 9, 95, 12], 74: [15, 226, 102, 23, 11], 75: [20, 72, 54, 68, 1],
    76: [16, 173, 95, 251, 7], 77: [18, 130, 149, 83, 15], 78: [22, 225, 49, 132, 12], 79: [24, 122, 73, 107, 0],
    80: [26, 232, 134, 17, 2], 81: [25, 19, 174, 10, 1], 82: [27, 103, 181, 161, 7], 83: [37, 220, 149, 240, 11],
    84: [40, 137, 97, 247, 6], 85: [51, 84, 20, 106, 10], 86: [49, 193, 108, 31, 7], 87: [51, 203, 24, 198, 6],
    88: [62, 207, 228, 144, 15], 89: [70, 69, 24, 163, 15], 90: [68, 186, 112, 182, 7], 91: [65, 156, 98, 62, 8],
    92: [72, 209, 145, 74, 1], 93: [84, 244, 153, 246, 13], 94: [87, 90, 156, 129, 3], 95: [85, 131, 85, 178, 12],
    96: [87, 183, 118, 16, 15], 97: [92, 52, 54, 254, 4], 98: [92, 72, 252, 119, 14], 99: [94, 110, 239, 64, 2]
  };

  const generateArucoMarker = (markerId: number, size: number): string => {
    const bytes = ARUCO_DICT[markerId];
    if (!bytes) return `<rect width="${size}" height="${size}" fill="black"/>`;
    const width = 6, height = 6;
    const bits: number[] = [];
    for (const byte of bytes) {
      const start = 36 - bits.length;
      for (let i = Math.min(7, start - 1); i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }
    const cellSize = size / 8;
    let svg = `<rect width="${size}" height="${size}" fill="black"/>`;
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        if (bits[i * height + j]) {
          svg += `<rect x="${(j + 1) * cellSize}" y="${(i + 1) * cellSize}" width="${cellSize}" height="${cellSize}" fill="white"/>`;
        }
      }
    }
    return svg;
  };

  const generateSVGTemplate = () => {
    const markerIdBase = widgetEnabled
      ? (model.marker_id_base ?? (model.order_index * 4))
      : 0;
    const templateWidth = 800, templateHeight = 600, markerSize = 50, textureAreaSize = 500;
    const textureAreaX = (templateWidth - textureAreaSize) / 2, textureAreaY = 70;
    let uvContent = '';
    if (uvSvgContent.trim()) {
      const match = uvSvgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      const innerContent = match ? match[1] : uvSvgContent;
      const viewBoxMatch = uvSvgContent.match(/viewBox=["']([^"']+)["']/i);
      const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 100 100';
      uvContent = `<svg x="${textureAreaX}" y="${textureAreaY}" width="${textureAreaSize}" height="${textureAreaSize}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${innerContent}</svg>`;
    }
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${templateWidth}" height="${templateHeight}" viewBox="0 0 ${templateWidth} ${templateHeight}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="${templateWidth / 2}" y="30" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold">${model.name}</text>
  <text x="${templateWidth / 2}" y="50" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">${viewerName}</text>
  <rect x="${textureAreaX}" y="${textureAreaY}" width="${textureAreaSize}" height="${textureAreaSize}" fill="#fafafa" stroke="#ddd" stroke-width="1"/>
  ${uvContent}
  <g transform="translate(${textureAreaX}, ${textureAreaY})">${generateArucoMarker(markerIdBase, markerSize)}</g>
  <g transform="translate(${textureAreaX + textureAreaSize - markerSize}, ${textureAreaY})">${generateArucoMarker(markerIdBase + 1, markerSize)}</g>
  <g transform="translate(${textureAreaX + textureAreaSize - markerSize}, ${textureAreaY + textureAreaSize - markerSize})">${generateArucoMarker(markerIdBase + 2, markerSize)}</g>
  <g transform="translate(${textureAreaX}, ${textureAreaY + textureAreaSize - markerSize})">${generateArucoMarker(markerIdBase + 3, markerSize)}</g>
  <text x="${templateWidth / 2}" y="${textureAreaY + textureAreaSize + 30}" text-anchor="middle" font-family="Arial" font-size="10" fill="#888">Color or paint the texture area. Keep all 4 corner markers visible when photographing.</text>
</svg>`;
    setGeneratedTemplate(svg);
  };

  const downloadTemplate = () => {
    if (!generatedTemplate) return;
    const blob = new Blob([generatedTemplate], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `texture-template-${model.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.svg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSvgFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => { setUvSvgContent(event.target?.result as string || ''); setGeneratedTemplate(null); };
    reader.readAsText(file);
  };

  const qrCodeUrl = `/api/qr-code/${model.id}`;
  const textureTemplateUrl = `/api/texture-template/${model.id}`;
  const shortLink = model.short_code && typeof window !== 'undefined'
    ? `${window.location.origin}/u/${model.short_code}` : null;

  const handleDeleteModel = async () => {
    if (!confirm(`Are you sure you want to delete "${model.name}"? This will also delete all associated textures.`)) return;
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append('modelId', model.id);
      formData.append('viewerId', viewerId);
      const result = await delete3DModelAction({}, formData);
      if (result.success) { onDelete(); } else { alert(result.error || 'Failed to delete model'); }
    } catch { alert('Failed to delete model'); } finally { setIsDeleting(false); }
  };

  const copyLink = () => {
    if (!shortLink) return;
    navigator.clipboard.writeText(shortLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <tr className="hover:bg-blue-50/40 transition-colors group">
        {/* # */}
        <td className="px-4 py-3 text-xs text-gray-400 font-mono">{index}</td>

        {/* Model name + date */}
        <td className="px-4 py-3">
          <p className="font-medium text-sm text-gray-800 leading-tight">{model.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{new Date(model.created_at).toLocaleDateString()}</p>
        </td>

        {/* Upload link */}
        <td className="px-4 py-3">
          {shortLink ? (
            <div className="flex items-center gap-1.5 max-w-[220px]">
              <code className="text-xs text-blue-600 font-mono truncate flex-1">{shortLink}</code>
              <button
                onClick={copyLink}
                className="flex-shrink-0 text-gray-400 hover:text-blue-600 transition-colors"
                title="Copy link"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>

        {/* Textures */}
        <td className="px-4 py-3 text-center">
          <button
            onClick={() => setShowTexturesDialog(true)}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors
              hover:bg-green-50 hover:border-green-300 hover:text-green-700
              border-gray-200 text-gray-500"
          >
            <Palette className="h-3 w-3" />
            {model.latest_texture
              ? new Date(model.latest_texture.uploaded_at).toLocaleDateString()
              : 'None'}
          </button>
        </td>

        {/* Assets: QR + Template + SVG + ArUco */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-center">
            <a href={qrCodeUrl} download={`qr-${model.id}.png`} title="Download QR Code">
              <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                <QrCode className="h-4 w-4" />
              </button>
            </a>
            <a href={textureTemplateUrl} download={`template-${model.id}.html`} title="Download Template">
              <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                <Download className="h-4 w-4" />
              </button>
            </a>
            <button
              title="Generate SVG Template"
              onClick={() => { setUvSvgContent(''); setGeneratedTemplate(null); setShowSVGTemplateDialog(true); }}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
            >
              <FileImage className="h-4 w-4" />
            </button>
            <a href={`/api/aruco-markers/${model.id}?format=svg`} download title="Download ArUco SVG">
              <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                <Code className="h-4 w-4" />
              </button>
            </a>
          </div>
        </td>

        {/* UV Map */}
        <td className="px-4 py-3 text-center">
          <button
            onClick={() => setShowUVMapDialog(true)}
            className={[
              'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors',
              model.uv_map_url
                ? 'border-purple-200 text-purple-600 hover:bg-purple-50'
                : 'border-gray-200 text-gray-400 hover:bg-gray-50',
            ].join(' ')}
            title="Manage UV Map"
          >
            <MapIcon className="h-3 w-3" />
            {model.uv_map_url ? 'View' : 'Upload'}
          </button>
        </td>

        {/* Actions: Edit + Delete */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            <Button
              variant="ghost" size="sm"
              className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
              onClick={() => setShowEditDialog(true)}
              title="Edit model"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-8 w-8 p-0 text-red-400 hover:text-red-700 hover:bg-red-50"
              onClick={handleDeleteModel}
              disabled={isDeleting}
              title="Delete model"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>

      {/* --- Dialogs (unchanged logic) --- */}
      <AllTexturesDialog
        open={showTexturesDialog}
        onOpenChange={setShowTexturesDialog}
        modelId={model.id}
        modelName={model.name}
        onTextureDeleted={onDelete}
        filterViewerId={classroomViewerId ?? undefined}
      />

      <Dialog open={showUVMapDialog} onOpenChange={setShowUVMapDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>UV Map — {model.name}</DialogTitle>
            <DialogDescription>
              Upload a UV map image (PNG, JPG, or SVG). SVG format is recommended.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {model.uv_map_url && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Current UV Map</p>
                {model.uv_map_url.toLowerCase().endsWith('.svg') ? (
                  <object data={model.uv_map_url} type="image/svg+xml" className="w-full h-64 rounded-md border bg-gray-50">
                    <img src={model.uv_map_url} alt="UV Map" className="w-full rounded-md border bg-gray-50" />
                  </object>
                ) : (
                  <img src={model.uv_map_url} alt="UV Map" className="w-full rounded-md border bg-gray-50" />
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="uvMapFile">Upload New UV Map</Label>
              <Input id="uvMapFile" type="file" accept="image/*,.svg"
                onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setUploadingUVMap(true);
                  try {
                    const formData = new FormData();
                    formData.append('modelId', model.id);
                    formData.append('file', file);
                    const response = await fetch('/api/upload-uv-map', { method: 'POST', body: formData });
                    if (!response.ok) throw new Error('Upload failed');
                    const result = await response.json();
                    if (result.success) { setShowUVMapDialog(false); onDelete(); }
                  } catch { alert('Failed to upload UV map'); } finally { setUploadingUVMap(false); }
                }}
                disabled={uploadingUVMap}
              />
              {uploadingUVMap && <p className="text-sm text-muted-foreground">Uploading...</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSVGTemplateDialog} onOpenChange={setShowSVGTemplateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate SVG Template — {model.name}</DialogTitle>
            <DialogDescription>
              Paste your UV map SVG content or upload an SVG file to generate a template with ArUco markers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="svgFileInput">Upload SVG File</Label>
              <Input id="svgFileInput" type="file" accept=".svg" onChange={handleSvgFileSelect} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uvSvgContent">Or Paste SVG Content</Label>
              <textarea id="uvSvgContent" className="w-full h-32 p-2 border rounded-md font-mono text-xs"
                placeholder="<svg>...</svg>" value={uvSvgContent}
                onChange={(e) => { setUvSvgContent(e.target.value); setGeneratedTemplate(null); }}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={generateSVGTemplate}>Generate Template</Button>
              {generatedTemplate && (
                <Button onClick={downloadTemplate} variant="outline">
                  <Download className="h-4 w-4 mr-2" />Download SVG
                </Button>
              )}
            </div>
            {generatedTemplate && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="w-full border rounded-md bg-gray-50 overflow-auto"
                  dangerouslySetInnerHTML={{ __html: generatedTemplate }} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EditModelDialog
        model={model}
        onSuccess={onDelete}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
    </>
  );
}

function EditModelDialog({
  model,
  onSuccess,
  open,
  onOpenChange
}: {
  model: ViewerModelWithTexture;
  onSuccess: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [nameState, nameAction, isNamePending] = useActionState<any, FormData>(
    updateModelNameAction,
    {}
  );
  const [fileState, fileAction, isFilePending] = useActionState<any, FormData>(
    updateModelFileAction,
    {}
  );

  useEffect(() => {
    if (nameState.success) {
      onSuccess();
    }
  }, [nameState.success, onSuccess]);

  useEffect(() => {
    if (fileState.success) {
      onSuccess();
    }
  }, [fileState.success, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit 3D Model</DialogTitle>
          <DialogDescription>
            Update the model name or replace the 3D model file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Update Name Form */}
          <form action={nameAction} className="space-y-4">
            <input type="hidden" name="modelId" value={model.id} />
            
            <div className="space-y-2">
              <Label htmlFor="modelName">Model Name</Label>
              <Input
                id="modelName"
                name="modelName"
                type="text"
                defaultValue={model.name}
                placeholder="My 3D Model"
                required
              />
            </div>

            {nameState.error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {nameState.error}
              </div>
            )}
            {nameState.success && (
              <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
                {nameState.message}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isNamePending}>
              {isNamePending ? 'Updating...' : 'Update Name'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          {/* Replace File Form */}
          <form action={fileAction} className="space-y-4">
            <input type="hidden" name="modelId" value={model.id} />
            
            <div className="space-y-2">
              <Label htmlFor="modelFile">Replace 3D Model File</Label>
              <Input
                id="modelFile"
                name="modelFile"
                type="file"
                accept=".glb,.gltf,.obj"
                required
              />
              <p className="text-xs text-gray-500">
                Current: {model.model_file_url.split('/').pop()}
              </p>
              <p className="text-xs text-gray-500">Supported: GLB, GLTF, OBJ (max 50MB)</p>
            </div>

            {fileState.error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {fileState.error}
              </div>
            )}
            {fileState.success && (
              <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
                {fileState.message}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isFilePending}>
              {isFilePending ? 'Uploading...' : 'Replace File'}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ViewerDetailPage({ params }: { params: Promise<{ viewerId: string }> }) {
  const { viewerId } = use(params);
  const router = useRouter();
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [models, setModels] = useState<ViewerModelWithTexture[]>([]);
  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showLogoDialog, setShowLogoDialog] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showClassroomTexturesDialog, setShowClassroomTexturesDialog] = useState(false);

  const [deleteState, deleteAction, isDeleting] = useActionState<any, FormData>(deleteViewerAction, {});
  const [updateState, updateAction, isUpdating] = useActionState<any, FormData>(updateViewerAction, {});
  const [pinState, pinAction] = useActionState<PinState, FormData>(generateNewPinAction, {});
  const [embedTokenState, embedTokenAction] = useActionState<EmbedTokenState, FormData>(generateEmbedTokenAction, {});

  // Fetch viewer data
  useEffect(() => {
    const fetchViewerData = async () => {
      try {
        // Fetch viewer details
        const response = await fetch(`/api/viewers/${viewerId}`);
        if (!response.ok) throw new Error('Failed to fetch viewer');
        const viewerData = await response.json();
        setViewer(viewerData);
        setEditedName(viewerData.name);

        // Fetch models
        const modelsData = await getViewerModelsWithTexturesAction(viewerId);
        setModels(modelsData);

        // Fetch current PIN
        const { getCurrentPinAction } = await import('@/app/actions');
        const pinResult = await getCurrentPinAction(viewerId);
        if (pinResult.success && pinResult.pin) {
          setCurrentPin(pinResult.pin);
        }
      } catch (error) {
        console.error('Error fetching viewer data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchViewerData();
  }, [viewerId]);

  // Handle delete success
  useEffect(() => {
    if (deleteState.success) {
      router.push('/admin/viewers');
    }
  }, [deleteState.success, router]);

  // Handle update success
  useEffect(() => {
    if (updateState.success) {
      setShowEditDialog(false);
      window.location.reload();
    }
  }, [updateState.success]);

  // Store PIN when generated
  useEffect(() => {
    if (pinState.pin) {
      setCurrentPin(pinState.pin);
    }
  }, [pinState.pin]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (!viewer) {
    return (
      <div className="container mx-auto p-6">
        <p>Viewer not found</p>
      </div>
    );
  }

  const viewerUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/v/${viewer.short_code || viewer.id}`
    : `/v/${viewer.short_code || viewer.id}`;
  const embedCode = embedTokenState.embedToken && typeof window !== 'undefined'
    ? `<iframe src="${window.location.origin}/v/${viewer.short_code || viewer.id}?embed=${embedTokenState.embedToken}" width="800" height="600" frameborder="0"></iframe>`
    : '';

  return (
    <div className="container mx-auto p-6 space-y-4">

      {/* ── Compact header bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/admin/viewers">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Viewers
          </Link>
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold">{viewer.name}</h1>
        <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">
          {viewer.short_code || viewer.id.slice(0, 8)}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/surveys/questions?viewerId=${viewer.id}`}>
              <FileText className="h-3.5 w-3.5 mr-1.5" />Configure Survey
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/surveys/results?viewerId=${viewer.id}`}>
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Results
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/viewers/${viewer.id}/worksheet-builder`}>
              <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />Worksheet Builder
            </Link>
          </Button>
          <Button asChild variant="default" size="sm">
            <a href={viewerUrl} target="_blank" rel="noopener noreferrer">
              <Eye className="h-3.5 w-3.5 mr-1.5" />Open
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
            <Edit className="h-3.5 w-3.5 mr-1.5" />Rename
          </Button>
          <form action={deleteAction}>
            <input type="hidden" name="viewerId" value={viewer.id} />
            <Button variant="destructive" size="sm" type="submit"
              onClick={(e) => { if (!confirm('Delete this viewer?')) e.preventDefault(); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </div>

      {/* ── Info + logo + settings row ── */}
      <div className="rounded-xl border bg-white">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] divide-y md:divide-y-0 md:divide-x">

          {/* Left: key-value grid */}
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">

            {/* Viewer URL – spans full width */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Viewer URL</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-blue-600 font-mono bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg flex-1 truncate">
                  {viewerUrl}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(viewerUrl)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Copy URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">ID</p>
              <p className="text-xs font-mono text-gray-600 truncate">{viewer.id.slice(0, 12)}…</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Short code</p>
              <p className="text-xs font-mono text-gray-600">{viewer.short_code || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Models</p>
              <p className="text-xs text-gray-600">{models.length}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Created</p>
              <p className="text-xs text-gray-600">{new Date(viewer.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Right: logo + settings */}
          <div className="p-4 flex flex-row md:flex-col items-center md:items-start gap-4 min-w-[160px]">
            {/* Logo */}
            <div className="flex flex-col items-center gap-2">
              {viewer.logo_url ? (
                <img src={viewer.logo_url} alt="Logo"
                  className="h-12 w-auto max-w-[100px] object-contain border rounded-lg p-1.5 bg-gray-50" />
              ) : (
                <div className="h-12 w-[100px] flex items-center justify-center border-2 border-dashed rounded-lg text-gray-300 text-[10px]">
                  No logo
                </div>
              )}
              <button
                onClick={() => setShowLogoDialog(true)}
                className="text-[10px] text-blue-600 hover:underline"
              >
                {viewer.logo_url ? 'Change' : 'Upload logo'}
              </button>
            </div>

            {/* Settings */}
            <ViewerSettingsDialog
              viewerId={viewer.id}
              currentSettings={viewer.settings.textureCycling}
              rotationSpeed={viewer.settings.rotationSpeed}
              backgroundColor={viewer.settings.backgroundColor}
              showModelName={viewer.settings.showModelName}
              showLogoInViewer={viewer.settings.showLogoInViewer}
              ambientLightIntensity={viewer.settings.ambientLightIntensity}
              directionalLightIntensity={viewer.settings.directionalLightIntensity}
              widgetEnabled={viewer.settings.widgetEnabled}
              storageMode={viewer.settings.storageMode}
              enableArucoDetection={viewer.settings.enableArucoDetection}
              defaultModelId={viewer.settings.defaultModelId}
              surveyEnabled={viewer.settings.surveyEnabled}
              surveyLanguage={viewer.settings.surveyLanguage}
              certificateBottomImageUrl={viewer.settings.certificateBottomImageUrl}
              classroomEnabled={viewer.settings.classroomEnabled}
              textureModerationEnabled={viewer.settings.textureModerationEnabled}
              models={models}
              currentPin={currentPin}
              onGeneratePin={async () => {
                const formData = new FormData();
                formData.append('viewerId', viewer.id);
                await generateNewPinAction({}, formData);
                window.location.reload();
              }}
              embedToken={embedTokenState.embedToken}
              onGenerateEmbed={async () => {
                const formData = new FormData();
                formData.append('viewerId', viewer.id);
                await generateEmbedTokenAction({}, formData);
              }}
              embedCode={embedCode}
            />
          </div>
        </div>
      </div>

      {/* ── 3D Models ── */}
      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-sm">3D Models</h2>
          {viewer.parent_viewer_id && models.length > 0 && (
            <button
              onClick={() => setShowClassroomTexturesDialog(true)}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1 rounded-md transition-colors"
            >
              <Images className="h-3.5 w-3.5" />
              All class textures
            </button>
          )}
        </div>
        <div className="p-4">
          <ModelManagement
            viewerId={viewer.id}
            viewerShortCode={viewer.short_code}
            viewerName={viewer.name}
            widgetEnabled={viewer.settings?.widgetEnabled ?? false}
            initialModels={models}
            classroomViewerId={viewer.parent_viewer_id ? viewer.id : null}
          />
        </div>
      </div>

      {/* ── Texture Moderation ── */}
      {viewer.settings?.textureModerationEnabled && (
        <div className="rounded-xl border bg-white">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <div>
              <h2 className="font-semibold text-sm">Texture Moderation</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Review and approve or reject uploaded textures before they appear in the viewer.
              </p>
            </div>
          </div>
          <div className="p-4">
            <TextureModerationPanel viewerId={viewer.id} />
          </div>
        </div>
      )}


      {/* ── Classroom all-textures dialog ── */}
      {viewer.parent_viewer_id && (
        <ClassroomTexturesDialog
          open={showClassroomTexturesDialog}
          onOpenChange={setShowClassroomTexturesDialog}
          viewerName={viewer.name}
          classroomViewerId={viewer.id}
          models={models}
        />
      )}

      {/* Edit Viewer Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Viewer</DialogTitle>
            <DialogDescription>
              Update viewer settings
            </DialogDescription>
          </DialogHeader>
          <form action={updateAction} className="space-y-4">
            <input type="hidden" name="viewerId" value={viewer.id} />
            
            <div className="space-y-2">
              <Label htmlFor="name">Viewer Name</Label>
              <Input
                id="name"
                name="name"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="Enter viewer name"
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Logo Upload Dialog */}
      <Dialog open={showLogoDialog} onOpenChange={setShowLogoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Viewer Logo</DialogTitle>
            <DialogDescription>
              Upload a logo to display in the bottom-right corner of the viewer. Recommended: PNG with transparent background, max 200px height.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {viewer.logo_url && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Current Logo</p>
                <img
                  src={viewer.logo_url}
                  alt="Current Logo"
                  className="h-20 w-auto object-contain border rounded p-2 bg-gray-50"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!confirm('Remove the current logo?')) return;
                    
                    try {
                      const response = await fetch('/api/remove-viewer-logo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ viewerId: viewer.id })
                      });

                      if (!response.ok) throw new Error('Failed to remove logo');

                      window.location.reload();
                    } catch (error) {
                      console.error('Failed to remove logo:', error);
                      alert('Failed to remove logo');
                    }
                  }}
                >
                  Remove Logo
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="logoFile">Upload New Logo</Label>
              <Input
                id="logoFile"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  setUploadingLogo(true);
                  try {
                    const formData = new FormData();
                    formData.append('viewerId', viewer.id);
                    formData.append('file', file);

                    const response = await fetch('/api/upload-viewer-logo', {
                      method: 'POST',
                      body: formData
                    });

                    if (!response.ok) throw new Error('Upload failed');

                    const result = await response.json();
                    if (result.success) {
                      setShowLogoDialog(false);
                      window.location.reload();
                    }
                  } catch (error) {
                    console.error('Failed to upload logo:', error);
                    alert('Failed to upload logo');
                  } finally {
                    setUploadingLogo(false);
                  }
                }}
                disabled={uploadingLogo}
              />
              {uploadingLogo && <p className="text-sm text-muted-foreground">Uploading...</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
