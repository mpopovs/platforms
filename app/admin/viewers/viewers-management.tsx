'use client';

import { useState, useEffect, useCallback } from 'react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, Plus, Copy, RefreshCw, Trash2, Settings, Code, Upload, QrCode, Image as ImageIcon, Download, GripVertical, Palette, FileImage, Link as LinkIcon, Map } from 'lucide-react';
import Link from 'next/link';
import { 
  createViewerAction, 
  deleteViewerAction,
  updateViewerAction,
  generateNewPinAction,
  generateEmbedTokenAction,
  upload3DModelAction,
  delete3DModelAction,
  reorderModelsAction,
  getViewerModelsWithTexturesAction
} from '@/app/actions';
import { rootDomain, protocol } from '@/lib/utils';
import type { ViewerModelWithTexture } from '@/lib/types/viewer';
import { ViewerSettingsDialog } from '@/components/viewer-settings-dialog';
import { AllTexturesDialog } from '@/components/all-textures-dialog';

import type { TextureCyclingSettings } from '@/lib/types/viewer';

type Viewer = {
  id: string;
  userId: string;
  name: string;
  shortCode?: string;
  createdAt: number;
  updatedAt: number;
  settings: {
    displayTitle?: string;
    displayMessage?: string;
    backgroundColor?: string;
    textColor?: string;
    textureCycling?: TextureCyclingSettings;
  };
  models?: ViewerModelWithTexture[];
};

type CreateState = {
  success?: boolean;
  error?: string;
  viewerId?: string;
  pin?: string;
  message?: string;
};

type DeleteState = {
  success?: boolean;
  error?: string;
  message?: string;
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

type DeleteModelState = {
  success?: boolean;
  error?: string;
  message?: string;
};

type ReorderState = {
  success?: boolean;
  error?: string;
  message?: string;
};

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
  }, [state.success, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="h-3 w-3 mr-2" />
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

function ModelCard({
  model,
  viewerId,
  onDelete,
  onReorder,
  canMoveUp,
  canMoveDown
}: {
  model: ViewerModelWithTexture;
  viewerId: string;
  onDelete: () => void;
  onReorder: (direction: 'up' | 'down') => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [deleteState, deleteAction, isDeleting] = useActionState<DeleteModelState, FormData>(
    delete3DModelAction,
    {}
  );
  const [showTexturesDialog, setShowTexturesDialog] = useState(false);
  const [showUVMapDialog, setShowUVMapDialog] = useState(false);
  const [uploadingUVMap, setUploadingUVMap] = useState(false);

  useEffect(() => {
    if (deleteState.success) {
      onDelete();
    }
  }, [deleteState.success, onDelete]);

  const qrCodeUrl = `/api/qr-code/${model.id}`;
  const textureTemplateUrl = `/api/texture-template/${model.id}`;
  const uploadUrl = `${protocol}://${rootDomain}/api/upload-texture`;
  const shortLink = model.short_code ? `${protocol}://${rootDomain}/u/${model.short_code}` : null;

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className="flex flex-col gap-1 pt-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={!canMoveUp}
                onClick={() => onReorder('up')}
              >
                <div className="rotate-180">▼</div>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={!canMoveDown}
                onClick={() => onReorder('down')}
              >
                ▼
              </Button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate" title={model.model_file_url}>
                {model.model_file_url.split('/').pop()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Order: {model.order_index} • Uploaded: {new Date(model.created_at).toLocaleDateString()}
              </p>
              {model.latest_texture && (
                <div className="flex items-center gap-1 mt-1">
                  <Palette className="h-3 w-3 text-green-600" />
                  <span className="text-xs text-green-600">
                    Texture applied {new Date(model.latest_texture.uploaded_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <form action={deleteAction}>
            <input type="hidden" name="viewerId" value={viewerId} />
            <input type="hidden" name="modelId" value={model.id} />
            <Button
              variant="ghost"
              size="icon"
              type="submit"
              disabled={isDeleting}
              className="h-8 w-8 text-gray-500 hover:text-red-600 flex-shrink-0"
              onClick={(e) => {
                if (!confirm('Delete this 3D model and all its textures?')) {
                  e.preventDefault();
                }
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </form>
        </div>

        {shortLink && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <LinkIcon className="h-3 w-3 text-blue-600 flex-shrink-0" />
                <code className="text-xs text-blue-700 font-mono truncate">{shortLink}</code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 flex-shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(shortLink);
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-blue-600 mt-1">Upload link (QR code directs here)</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <a href={qrCodeUrl} download={`qr-${model.id}.png`}>
            <Button variant="outline" size="sm" className="w-full">
              <QrCode className="h-3 w-3 mr-1" />
              QR
            </Button>
          </a>
          <a href={textureTemplateUrl} download={`template-${model.id}.html`}>
            <Button variant="outline" size="sm" className="w-full">
              <Download className="h-3 w-3 mr-1" />
              Template
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowUVMapDialog(true)}
          >
            <Map className="h-3 w-3 mr-1" />
            UV Map
          </Button>
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={() => setShowTexturesDialog(true)}
        >
          <FileImage className="h-3 w-3 mr-1" />
          {model.latest_texture ? 'View All Textures' : 'No Textures Yet'}
        </Button>

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
                Upload a UV map image showing how to color the texture. This will be included in the printable template.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {model.uv_map_url && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Current UV Map</p>
                  <img
                    src={model.uv_map_url}
                    alt="UV Map"
                    className="w-full rounded-md border bg-gray-50"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="uvMapFile">Upload New UV Map</Label>
                <Input
                  id="uvMapFile"
                  type="file"
                  accept="image/*"
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

                      if (!response.ok) {
                        throw new Error('Upload failed');
                      }

                      await response.json();

                      // Refresh models to show new UV map
                      onDelete(); // reuse this callback since it refreshes models

                      setShowUVMapDialog(false);
                    } catch (error) {
                      console.error('Error uploading UV map:', error);
                      alert('Failed to upload UV map');
                    } finally {
                      setUploadingUVMap(false);
                      // Clear file input
                      e.target.value = '';
                    }
                  }}
                  disabled={uploadingUVMap}
                />
                <p className="text-xs text-gray-500">
                  Recommended: Square image (1024x1024 or 2048x2048), PNG or JPG
                </p>
              </div>

              {model.uv_map_url && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    if (!confirm('Remove UV map from this model?')) return;

                    setUploadingUVMap(true);
                    try {
                      const response = await fetch(`/api/upload-uv-map?modelId=${model.id}`, {
                        method: 'DELETE'
                      });

                      if (!response.ok) {
                        throw new Error('Delete failed');
                      }

                      // Refresh models to remove UV map from display
                      onDelete(); // reuse this callback since it refreshes models

                      setShowUVMapDialog(false);
                    } catch (error) {
                      console.error('Error removing UV map:', error);
                      alert('Failed to remove UV map');
                    } finally {
                      setUploadingUVMap(false);
                    }
                  }}
                  disabled={uploadingUVMap}
                >
                  Remove UV Map
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function ModelManagement({ 
  viewerId, 
  initialModels 
}: { 
  viewerId: string;
  initialModels: ViewerModelWithTexture[];
}) {
  const [models, setModels] = useState<ViewerModelWithTexture[]>(initialModels);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reorderState, reorderAction, isReordering] = useActionState<ReorderState, FormData>(
    reorderModelsAction,
    {}
  );

  const refreshModels = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const models = await getViewerModelsWithTexturesAction(viewerId);
      setModels(models);
    } catch (error) {
      console.error('Failed to refresh models:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [viewerId]);

  useEffect(() => {
    if (reorderState.success) {
      refreshModels();
    }
  }, [reorderState.success, refreshModels]);

  const handleReorder = (modelId: string, direction: 'up' | 'down') => {
    const currentIndex = models.findIndex(m => m.id === modelId);
    if (currentIndex === -1) return;

    const newModels = [...models];
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= newModels.length) return;

    // Swap
    [newModels[currentIndex], newModels[targetIndex]] = [newModels[targetIndex], newModels[currentIndex]];
    
    // Update order_index
    newModels.forEach((model, index) => {
      model.order_index = index;
    });

    setModels(newModels);

    // Submit reorder
    const formData = new FormData();
    formData.append('viewerId', viewerId);
    formData.append('modelIds', JSON.stringify(newModels.map(m => m.id)));
    reorderAction(formData);
  };

  return (
    <div className="space-y-3 border-t pt-3 mt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold">3D Models ({models.length})</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshModels}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <UploadModelDialog viewerId={viewerId} onSuccess={refreshModels} />
        </div>
      </div>

      {models.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-500">
          No models uploaded yet. Upload a 3D model to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {models.map((model, index) => (
            <ModelCard
              key={model.id}
              model={model}
              viewerId={viewerId}
              onDelete={refreshModels}
              onReorder={(direction) => handleReorder(model.id, direction)}
              canMoveUp={index > 0}
              canMoveDown={index < models.length - 1}
            />
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded p-2">
        <p className="font-medium mb-1">📷 Public Upload URL:</p>
        <code className="text-xs break-all">{protocol}://{rootDomain}/api/upload-texture</code>
        <p className="mt-1">Users can upload colored textures by photographing the printed template with the QR code visible.</p>
      </div>
    </div>
  );
}

function CreateViewerDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState<CreateState, FormData>(
    createViewerAction,
    {}
  );

  // Show PIN once created
  if (state.success && state.pin) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Viewer
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Viewer Created!</DialogTitle>
            <DialogDescription>
              Save this PIN - it will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm font-medium text-green-900 mb-2">Your PIN:</p>
              <p className="text-3xl font-bold text-center text-green-700 tracking-wider">
                {state.pin}
              </p>
            </div>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(state.pin!);
                setOpen(false);
                onSuccess();
              }}
              className="w-full"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy PIN and Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Viewer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Viewer</DialogTitle>
          <DialogDescription>
            Create a viewer with a secure PIN for access control.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Viewer Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Sales Display"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="displayTitle">Display Title</Label>
            <Input
              id="displayTitle"
              name="displayTitle"
              placeholder="Welcome to Our Display"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="displayMessage">Display Message</Label>
            <Input
              id="displayMessage"
              name="displayMessage"
              placeholder="Optional message to display"
            />
          </div>

          {state.error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {state.error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Viewer'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewerCard({ 
  viewer, 
  onDelete,
  initialModels
}: { 
  viewer: Viewer;
  onDelete: () => void;
  initialModels: ViewerModelWithTexture[];
}) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editedName, setEditedName] = useState(viewer.name);
  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [deleteState, deleteAction, isDeleting] = useActionState<DeleteState, FormData>(
    deleteViewerAction,
    {}
  );
  const [pinState, pinAction, isGenerating] = useActionState<PinState, FormData>(
    generateNewPinAction,
    {}
  );
  const [embedTokenState, embedTokenAction, isGeneratingToken] = useActionState<EmbedTokenState, FormData>(
    generateEmbedTokenAction,
    {}
  );
  const [updateState, updateAction, isUpdating] = useActionState<any, FormData>(
    async (prevState: any, formData: FormData) => {
      const result = await updateViewerAction(prevState, formData);
      if (result.success) {
        setShowEditDialog(false);
        window.location.reload();
      }
      return result;
    },
    {}
  );

  // Use short code as primary URL, fallback to full viewer ID URL
  const viewerUrl = viewer.shortCode 
    ? `${protocol}://${rootDomain}/${viewer.shortCode}` 
    : `${protocol}://${rootDomain}/viewer/${viewer.id}`;
  const embedCode = embedTokenState.embedToken 
    ? `<iframe src="${protocol}://${rootDomain}/api/viewer-embed-auth?token=${embedTokenState.embedToken}" width="800" height="600" frameborder="0"></iframe>`
    : '';

  // Trigger refresh when deletion succeeds
  useEffect(() => {
    if (deleteState.success) {
      onDelete();
    }
  }, [deleteState.success, onDelete]);

  // Fetch current PIN on mount
  useEffect(() => {
    const fetchPin = async () => {
      const { getCurrentPinAction } = await import('@/app/actions');
      const result = await getCurrentPinAction(viewer.id);
      if (result.success && result.pin) {
        setCurrentPin(result.pin);
      }
    };
    fetchPin();
  }, [viewer.id]);

  // Store PIN when generated
  useEffect(() => {
    if (pinState.pin) {
      setCurrentPin(pinState.pin);
    }
  }, [pinState.pin]);



  return (
    <>
      <Link href={`/admin/viewers/${viewer.id}`} className="block h-full">
        <Card className="flex flex-col h-full cursor-pointer hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Eye className="h-5 w-5 text-blue-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg truncate">{viewer.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {initialModels.length} {initialModels.length === 1 ? 'model' : 'models'}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowEditDialog(true);
                  }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <form action={deleteAction}>
                  <input type="hidden" name="viewerId" value={viewer.id} />
                  <Button
                    variant="ghost"
                    size="icon"
                    type="submit"
                    disabled={isDeleting}
                    className="h-8 w-8 text-gray-500 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm('Are you sure you want to delete this viewer?')) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Created {new Date(viewer.createdAt).toLocaleDateString()}
            </p>
          </CardHeader>
        </Card>
      </Link>
      
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

            {updateState.error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {updateState.error}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={isUpdating}>
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowEditDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ViewersManagement({ initialViewers }: { initialViewers: any[] }) {
  const [viewers, setViewers] = useState(initialViewers);

  const handleDelete = (viewerId: string) => {
    // Optimistically remove from UI
    setViewers(prev => prev.filter(v => v.id !== viewerId));
  };

  const handleCreate = () => {
    // Refresh the page to show new viewer
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Viewer Management</h1>
          <p className="text-gray-500 mt-1">Create and manage PIN-protected viewers</p>
        </div>
        <div className="flex items-center gap-4">
          <CreateViewerDialog onSuccess={handleCreate} />
          <Link
            href="/admin"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to Admin
          </Link>
        </div>
      </div>

      {viewers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Eye className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No viewers created yet.</p>
            <CreateViewerDialog onSuccess={handleCreate} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {viewers.map((viewer) => (
            <ViewerCard
              key={viewer.id}
              viewer={viewer}
              onDelete={() => handleDelete(viewer.id)}
              initialModels={viewer.models || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
