'use client';

import { useState, useEffect } from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, Plus, Copy, Trash2, ExternalLink, ChevronRight, Box, Images, Loader2, RefreshCw, School } from 'lucide-react';
import Link from 'next/link';
import {
  createViewerAction,
  deleteViewerAction,
} from '@/app/actions';
import { rootDomain, protocol } from '@/lib/utils';
import type { ViewerModelWithTexture } from '@/lib/types/viewer';
import type { TextureCyclingSettings } from '@/lib/types/viewer';

type Viewer = {
  id: string;
  name: string;
  shortCode?: string;
  parentViewerId?: string | null;
  createdAt: number;
  settings: Record<string, any>;
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

interface Texture {
  id: string;
  model_id: string;
  corrected_texture_url: string;
  uploaded_at: string;
}

function ViewerTexturesDialog({
  open,
  onOpenChange,
  viewerName,
  models,
  classroomViewerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerName: string;
  models: ViewerModelWithTexture[];
  /** When set, only fetch textures uploaded via this classroom viewer */
  classroomViewerId?: string;
}) {
  const [texturesByModel, setTexturesByModel] = useState<Record<string, Texture[]>>({});
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || models.length === 0) return;
    fetchAll();
    const iv = setInterval(() => fetchAll(true), 8000);
    return () => clearInterval(iv);
  }, [open]);

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const results = await Promise.all(
        models.map(async (m) => {
          const url = classroomViewerId
            ? `/api/model-textures/${m.id}?viewerId=${classroomViewerId}`
            : `/api/model-textures/${m.id}`;
          const res = await fetch(url);
          const data = res.ok ? await res.json() : { textures: [] };
          return { modelId: m.id, textures: (data.textures || []) as Texture[] };
        })
      );
      const map: Record<string, Texture[]> = {};
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
              <DialogTitle>Textures — {viewerName}</DialogTitle>
              <DialogDescription>
                {loading ? 'Loading…' : `${totalCount} texture${totalCount !== 1 ? 's' : ''} across ${models.length} model${models.length !== 1 ? 's' : ''}${classroomViewerId ? ' (this class only)' : ''}`}
              </DialogDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => fetchAll()} disabled={loading} className="ml-4">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">No textures uploaded yet</div>
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

function ViewerRowDelete({ viewerId, onDelete }: { viewerId: string; onDelete: () => void }) {
  const [deleteState, deleteAction, isDeleting] = useActionState<DeleteState, FormData>(
    deleteViewerAction,
    {}
  );

  useEffect(() => {
    if (deleteState.success) onDelete();
  }, [deleteState.success, onDelete]);

  return (
    <form action={deleteAction}>
      <input type="hidden" name="viewerId" value={viewerId} />
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        disabled={isDeleting}
        className="h-7 w-7 text-gray-400 hover:text-red-600"
        onClick={(e) => {
          if (!confirm('Delete this viewer and all its data?')) e.preventDefault();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

export function ViewersManagement({ initialViewers }: { initialViewers: any[] }) {
  const [viewers, setViewers] = useState(initialViewers);
  const [texturesViewer, setTexturesViewer] = useState<any | null>(null);
  const router = useRouter();

  const handleDelete = (viewerId: string) => {
    setViewers((prev: any[]) => prev.filter((v: any) => v.id !== viewerId));
  };

  const handleCreate = () => {
    window.location.reload();
  };

  // Group: parent viewers first, then interleave their children right below
  const parentViewers = viewers.filter((v: any) => !v.parentViewerId);
  const orderedViewers: Array<any & { _isChild: boolean }> = [];
  for (const parent of parentViewers) {
    orderedViewers.push({ ...parent, _isChild: false });
    const children = viewers.filter((v: any) => v.parentViewerId === parent.id);
    for (const child of children) {
      orderedViewers.push({ ...child, _isChild: true });
    }
  }
  // Orphan children (if any) at the end
  const orphans = viewers.filter((v: any) => v.parentViewerId && !parentViewers.find((p: any) => p.id === v.parentViewerId));
  for (const orphan of orphans) {
    orderedViewers.push({ ...orphan, _isChild: true });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Viewers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {viewers.filter((v: any) => !v.parentViewerId).length} viewer{viewers.filter((v: any) => !v.parentViewerId).length !== 1 ? 's' : ''}
            {viewers.filter((v: any) => !!v.parentViewerId).length > 0 && (
              <> · {viewers.filter((v: any) => !!v.parentViewerId).length} classroom{viewers.filter((v: any) => !!v.parentViewerId).length !== 1 ? 's' : ''}</>
            )}
          </p>
        </div>
        <CreateViewerDialog onSuccess={handleCreate} />
      </div>

      {viewers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Eye className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">No viewers yet. Create your first one.</p>
            <CreateViewerDialog onSuccess={handleCreate} />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-8">#</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 hidden sm:table-cell">Models</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 hidden md:table-cell">Textures</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 hidden lg:table-cell">Viewer URL</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 hidden lg:table-cell">Created</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orderedViewers.map((viewer: any, index: number) => {
                const models: ViewerModelWithTexture[] = viewer.models || [];
                const texturedCount = models.filter((m: ViewerModelWithTexture) => m.latest_texture).length;
                const viewerUrl = viewer.shortCode
                  ? `${protocol}://${rootDomain}/v/${viewer.shortCode}`
                  : `${protocol}://${rootDomain}/viewer/${viewer.id}`;

                return (
                  <tr
                    key={viewer.id}
                    className={`hover:bg-blue-50/40 cursor-pointer transition-colors group ${viewer._isChild ? 'bg-amber-50/30' : ''}`}
                    onClick={() => router.push(`/admin/viewers/${viewer.id}`)}
                  >
                    {/* Row number */}
                    <td className="px-4 py-3 text-xs text-gray-400">{viewer._isChild ? '↳' : index + 1}</td>

                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {viewer._isChild
                          ? <School className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                          : <Eye className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />}
                        <span className={`font-medium group-hover:text-blue-700 transition-colors ${viewer._isChild ? 'text-gray-600 pl-2' : 'text-gray-900'}`}>
                          {viewer.name}
                        </span>
                        {viewer._isChild && (
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Klase</span>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-400 transition-colors" />
                      </div>
                    </td>

                    {/* Models */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Box className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-gray-700">{models.length}</span>
                        {texturedCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                            {texturedCount}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Textures */}
                    <td
                      className="px-4 py-3 hidden md:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="inline-flex items-center gap-1.5 text-xs hover:text-blue-600 transition-colors"
                        onClick={() => setTexturesViewer(viewer)}
                      >
                        <Images className="h-3.5 w-3.5 text-gray-400" />
                        {texturedCount > 0
                          ? <span className="text-green-600 font-medium">{texturedCount} textured</span>
                          : <span className="text-gray-400">none yet</span>
                        }
                      </button>
                    </td>

                    {/* Viewer URL */}
                    <td
                      className="px-4 py-3 hidden lg:table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5 max-w-[200px]">
                        <code className="text-xs text-gray-500 font-mono truncate">{viewerUrl}</code>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            className="text-gray-400 hover:text-gray-600"
                            onClick={() => navigator.clipboard.writeText(viewerUrl)}
                            title="Copy URL"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <a
                            href={viewerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600"
                            title="Open viewer"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-400">
                      {new Date(viewer.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <ViewerRowDelete
                        viewerId={viewer.id}
                        onDelete={() => handleDelete(viewer.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {texturesViewer && (
        <ViewerTexturesDialog
          open={!!texturesViewer}
          onOpenChange={(open: boolean) => { if (!open) setTexturesViewer(null); }}
          viewerName={texturesViewer.name}
          models={texturesViewer.models || []}
          classroomViewerId={texturesViewer.parentViewerId ? texturesViewer.id : undefined}
        />
      )}
    </div>
  );
}
