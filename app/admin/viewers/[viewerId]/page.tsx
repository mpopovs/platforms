'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, Copy, ArrowLeft, Settings, Trash2, LinkIcon, QrCode, Download, Map as MapIcon, FileImage, Palette, Upload, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  deleteViewerAction,
  updateViewerAction,
  generateNewPinAction,
  generateEmbedTokenAction,
  getViewerModelsWithTexturesAction,
  upload3DModelAction,
  delete3DModelAction
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
    ambientLightIntensity?: number;
    directionalLightIntensity?: number;
    widgetEnabled?: boolean;
    storageMode?: 'server' | 'local' | 'hybrid';
    enableArucoDetection?: boolean;
    defaultModelId?: string;
  };
};

type ModelManagementProps = {
  viewerId: string;
  viewerShortCode: string | null;
  viewerName: string;
  widgetEnabled: boolean;
  initialModels: ViewerModelWithTexture[];
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

function ModelManagement({ viewerId, viewerShortCode, viewerName, widgetEnabled, initialModels }: ModelManagementProps) {
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <UploadModelDialog viewerId={viewerId} onSuccess={refreshModels} />
      </div>
      {models.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No models uploaded yet. Upload your first 3D model to get started.</p>
      ) : (
        <div className="space-y-3">
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              viewerId={viewerId}
              viewerName={viewerName}
              widgetEnabled={widgetEnabled}
              onDelete={refreshModels}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelCard({
  model,
  viewerId,
  viewerName,
  widgetEnabled,
  onDelete
}: {
  model: ViewerModelWithTexture;
  viewerId: string;
  viewerName: string;
  widgetEnabled: boolean;
  onDelete: () => void;
}) {
  const [showTexturesDialog, setShowTexturesDialog] = useState(false);
  const [showUVMapDialog, setShowUVMapDialog] = useState(false);
  const [showSVGTemplateDialog, setShowSVGTemplateDialog] = useState(false);
  const [uploadingUVMap, setUploadingUVMap] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uvSvgContent, setUvSvgContent] = useState('');
  const [generatedTemplate, setGeneratedTemplate] = useState<string | null>(null);

  // ArUco marker dictionary (subset for client-side generation)
  // Values from official OpenCV ARUCO_6X6_1000 / DICT_6X6_1000 dictionary
  const ARUCO_DICT: { [key: number]: number[] } = {
    0: [30, 61, 216, 42, 6], 1: [14, 251, 163, 137, 1], 2: [21, 144, 126, 172, 13], 3: [201, 27, 48, 105, 14],
    4: [214, 7, 214, 225, 5], 5: [216, 232, 224, 230, 8], 6: [66, 104, 180, 31, 5], 7: [136, 165, 15, 41, 10],
    8: [48, 125, 82, 79, 13], 9: [60, 47, 52, 179, 12], 10: [69, 223, 199, 78, 3], 11: [72, 216, 91, 37, 7],
    12: [113, 5, 88, 252, 6], 13: [134, 220, 250, 208, 7], 14: [141, 114, 169, 63, 6], 15: [162, 184, 157, 205, 14],
    16: [9, 253, 30, 156, 4], 17: [21, 77, 189, 24, 15], 18: [48, 10, 49, 14, 2], 19: [72, 7, 239, 175, 13],
    20: [86, 223, 17, 219, 6], 21: [102, 136, 50, 116, 12], 22: [118, 232, 203, 120, 1], 23: [154, 83, 217, 207, 3],
    // Markers 24+ from official OpenCV DICT_6X6_1000
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
    // Use unique markers per model only when widget is enabled (for ArUco detection)
    // Otherwise use markers 0-3 for all models
    const markerIdBase = widgetEnabled 
      ? (model.marker_id_base ?? (model.order_index * 4))
      : 0;
    const templateWidth = 800;
    const templateHeight = 600;
    const markerSize = 50;
    const textureAreaSize = 500;
    const textureAreaX = (templateWidth - textureAreaSize) / 2;
    const textureAreaY = 70;

    // Extract SVG content (remove outer svg tag if present)
    let uvContent = '';
    if (uvSvgContent.trim()) {
      const match = uvSvgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      const innerContent = match ? match[1] : uvSvgContent;
      // Try to extract viewBox from original SVG
      const viewBoxMatch = uvSvgContent.match(/viewBox=["']([^"']+)["']/i);
      const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 100 100';
      uvContent = `
        <svg x="${textureAreaX}" y="${textureAreaY}" width="${textureAreaSize}" height="${textureAreaSize}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
          ${innerContent}
        </svg>`;
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${templateWidth}" height="${templateHeight}" viewBox="0 0 ${templateWidth} ${templateHeight}">
  <defs>
    <style>
      .title { font-family: Arial, sans-serif; font-size: 18px; font-weight: bold; }
      .subtitle { font-family: Arial, sans-serif; font-size: 12px; fill: #666; }
      .instruction { font-family: Arial, sans-serif; font-size: 10px; fill: #888; }
    </style>
  </defs>
  
  <rect width="100%" height="100%" fill="white"/>
  
  <text x="${templateWidth / 2}" y="30" text-anchor="middle" class="title">${model.name}</text>
  <text x="${templateWidth / 2}" y="50" text-anchor="middle" class="subtitle">${viewerName}</text>
  
  <rect x="${textureAreaX}" y="${textureAreaY}" width="${textureAreaSize}" height="${textureAreaSize}" fill="#fafafa" stroke="#ddd" stroke-width="1"/>
  
  ${uvContent}
  
  <g transform="translate(${textureAreaX}, ${textureAreaY})">${generateArucoMarker(markerIdBase, markerSize)}</g>
  <g transform="translate(${textureAreaX + textureAreaSize - markerSize}, ${textureAreaY})">${generateArucoMarker(markerIdBase + 1, markerSize)}</g>
  <g transform="translate(${textureAreaX + textureAreaSize - markerSize}, ${textureAreaY + textureAreaSize - markerSize})">${generateArucoMarker(markerIdBase + 2, markerSize)}</g>
  <g transform="translate(${textureAreaX}, ${textureAreaY + textureAreaSize - markerSize})">${generateArucoMarker(markerIdBase + 3, markerSize)}</g>
  
  <text x="${templateWidth / 2}" y="${textureAreaY + textureAreaSize + 30}" text-anchor="middle" class="instruction">Color or paint the texture area. Keep all 4 corner markers visible when photographing.</text>
  <text x="${templateWidth / 2}" y="${textureAreaY + textureAreaSize + 45}" text-anchor="middle" class="instruction">Markers: ${markerIdBase}, ${markerIdBase + 1}, ${markerIdBase + 2}, ${markerIdBase + 3} (ARUCO_6X6_1000)</text>
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSvgFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setUvSvgContent(event.target?.result as string || '');
      setGeneratedTemplate(null);
    };
    reader.readAsText(file);
  };

  const qrCodeUrl = `/api/qr-code/${model.id}`;
  const textureTemplateUrl = `/api/texture-template/${model.id}`;
  const shortLink = model.short_code && typeof window !== 'undefined' 
    ? `${window.location.origin}/u/${model.short_code}` 
    : null;

  const handleDeleteModel = async () => {
    if (!confirm(`Are you sure you want to delete "${model.name}"? This will also delete all associated textures.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append('modelId', model.id);
      formData.append('viewerId', viewerId);
      
      const result = await delete3DModelAction({}, formData);
      
      if (result.success) {
        onDelete();
      } else {
        alert(result.error || 'Failed to delete model');
      }
    } catch (error) {
      console.error('Failed to delete model:', error);
      alert('Failed to delete model');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate" title={model.name}>
                {model.name}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Uploaded: {new Date(model.created_at).toLocaleDateString()}
              </p>
              {model.latest_texture && (
                <div className="flex items-center gap-1 mt-1">
                  <Palette className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-600">
                    Latest texture: {new Date(model.latest_texture.uploaded_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={handleDeleteModel}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {shortLink && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <LinkIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <code className="text-sm text-blue-700 font-mono truncate">{shortLink}</code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(shortLink);
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-blue-600 mt-1">Upload link (QR code directs here)</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <a href={qrCodeUrl} download={`qr-${model.id}.png`}>
              <Button variant="outline" size="sm" className="w-full">
                <QrCode className="h-4 w-4 mr-2" />
                QR Code
              </Button>
            </a>
            <a href={textureTemplateUrl} download={`template-${model.id}.html`}>
              <Button variant="outline" size="sm" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Template
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setUvSvgContent('');
                setGeneratedTemplate(null);
                setShowSVGTemplateDialog(true);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              SVG Template
            </Button>
            <a href={`/api/aruco-markers/${model.id}?format=svg`} download>
              <Button variant="outline" size="sm" className="w-full">
                <QrCode className="h-4 w-4 mr-2" />
                ArUco SVG
              </Button>
            </a>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowUVMapDialog(true)}
          >
            <MapIcon className="h-4 w-4 mr-2" />
            UV Map
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => setShowTexturesDialog(true)}
          >
            <FileImage className="h-4 w-4 mr-2" />
            {model.latest_texture ? 'View All Textures' : 'No Textures Yet'}
          </Button>
        </CardContent>
      </Card>

      <AllTexturesDialog
        open={showTexturesDialog}
        onOpenChange={setShowTexturesDialog}
        modelId={model.id}
        modelName={model.name}
        onTextureDeleted={onDelete}
      />

      <Dialog open={showUVMapDialog} onOpenChange={setShowUVMapDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>UV Map Template</DialogTitle>
            <DialogDescription>
              Upload a UV map image (PNG, JPG, or SVG) showing how to color the texture. SVG format is recommended for best quality in templates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {model.uv_map_url && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Current UV Map</p>
                {model.uv_map_url.toLowerCase().endsWith('.svg') ? (
                  <object
                    data={model.uv_map_url}
                    type="image/svg+xml"
                    className="w-full h-64 rounded-md border bg-gray-50"
                  >
                    <img
                      src={model.uv_map_url}
                      alt="UV Map"
                      className="w-full rounded-md border bg-gray-50"
                    />
                  </object>
                ) : (
                  <img
                    src={model.uv_map_url}
                    alt="UV Map"
                    className="w-full rounded-md border bg-gray-50"
                  />
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="uvMapFile">Upload New UV Map</Label>
              <Input
                id="uvMapFile"
                type="file"
                accept="image/*,.svg"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  setUploadingUVMap(true);
                  try {
                    const formData = new FormData();
                    formData.append('modelId', model.id);
                    formData.append('file', file);

                    const response = await fetch('/api/upload-uv-map', {
                      method: 'POST',
                      body: formData
                    });

                    if (!response.ok) throw new Error('Upload failed');

                    const result = await response.json();
                    if (result.success) {
                      setShowUVMapDialog(false);
                      onDelete(); // Refresh to show new UV map
                    }
                  } catch (error) {
                    console.error('Failed to upload UV map:', error);
                    alert('Failed to upload UV map');
                  } finally {
                    setUploadingUVMap(false);
                  }
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
            <DialogTitle>Generate SVG Template</DialogTitle>
            <DialogDescription>
              Paste your UV map SVG content or upload an SVG file to generate a template with ArUco markers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="svgFileInput">Upload SVG File</Label>
              <Input
                id="svgFileInput"
                type="file"
                accept=".svg"
                onChange={handleSvgFileSelect}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="uvSvgContent">Or Paste SVG Content</Label>
              <textarea
                id="uvSvgContent"
                className="w-full h-32 p-2 border rounded-md font-mono text-xs"
                placeholder="<svg>...</svg>"
                value={uvSvgContent}
                onChange={(e) => {
                  setUvSvgContent(e.target.value);
                  setGeneratedTemplate(null);
                }}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={generateSVGTemplate}>
                Generate Template
              </Button>
              {generatedTemplate && (
                <Button onClick={downloadTemplate} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download SVG
                </Button>
              )}
            </div>

            {generatedTemplate && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div 
                  className="w-full border rounded-md bg-gray-50 overflow-auto"
                  dangerouslySetInnerHTML={{ __html: generatedTemplate }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
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
    ? `${window.location.origin}/${viewer.short_code || viewer.id}`
    : `/${viewer.short_code || viewer.id}`;
  const embedCode = embedTokenState.embedToken && typeof window !== 'undefined'
    ? `<iframe src="${window.location.origin}/${viewer.short_code || viewer.id}?embed=${embedTokenState.embedToken}" width="800" height="600" frameborder="0"></iframe>`
    : '';

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/viewers">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Viewers
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{viewer.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Created {new Date(viewer.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Edit Name
          </Button>
          <form action={deleteAction}>
            <input type="hidden" name="viewerId" value={viewer.id} />
            <Button
              variant="destructive"
              type="submit"
              onClick={(e) => {
                if (!confirm('Are you sure you want to delete this viewer?')) {
                  e.preventDefault();
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Viewer
            </Button>
          </form>
        </div>
      </div>

      {/* Info Table */}
      <Card>
        <CardHeader>
          <CardTitle>Viewer Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Viewer ID</p>
                <p className="text-sm font-mono">{viewer.id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Short Code</p>
                <p className="text-sm font-mono">{viewer.short_code || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Models</p>
                <p className="text-sm">{models.length}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-sm">
                  {new Date(viewer.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Viewer URL</p>
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <code className="text-sm text-blue-700 font-mono flex-1 bg-blue-50 px-3 py-2 rounded">
                      {viewerUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(viewerUrl);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button asChild variant="default">
                  <a href={viewerUrl} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4 mr-2" />
                    Open Viewer
                  </a>
                </Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Display Logo</p>
                <Button variant="outline" size="sm" onClick={() => setShowLogoDialog(true)}>
                  {viewer.logo_url ? 'Change Logo' : 'Upload Logo'}
                </Button>
              </div>
              {viewer.logo_url && (
                <div className="mb-4">
                  <img src={viewer.logo_url} alt="Viewer Logo" className="h-16 w-auto object-contain border rounded p-2 bg-gray-50" />
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">Settings & Configuration</p>
              <ViewerSettingsDialog
                viewerId={viewer.id}
                currentSettings={viewer.settings.textureCycling}
                rotationSpeed={viewer.settings.rotationSpeed}
                backgroundColor={viewer.settings.backgroundColor}
                showModelName={viewer.settings.showModelName}
                ambientLightIntensity={viewer.settings.ambientLightIntensity}
                directionalLightIntensity={viewer.settings.directionalLightIntensity}
                widgetEnabled={viewer.settings.widgetEnabled}
                storageMode={viewer.settings.storageMode}
                enableArucoDetection={viewer.settings.enableArucoDetection}
                defaultModelId={viewer.settings.defaultModelId}
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
        </CardContent>
      </Card>

      {/* Models Section */}
      <Card>
        <CardHeader>
          <CardTitle>3D Models</CardTitle>
        </CardHeader>
        <CardContent>
          <ModelManagement
            viewerId={viewer.id}
            viewerShortCode={viewer.short_code}
            viewerName={viewer.name}
            widgetEnabled={viewer.settings?.widgetEnabled ?? false}
            initialModels={models}
          />
        </CardContent>
      </Card>

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
