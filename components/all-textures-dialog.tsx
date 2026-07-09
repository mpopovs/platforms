'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trash2, Loader2, RefreshCw } from 'lucide-react';
import { getStorageThumbnailUrl } from '@/lib/storage';

interface Texture {
  id: string;
  model_id: string;
  corrected_texture_url: string;
  original_photo_url: string;
  uploaded_at: string;
  upload_source_viewer_id?: string | null;
}

interface AllTexturesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  modelName: string;
  onTextureDeleted?: () => void;
  /** When set (classroom viewer), only show textures uploaded via this viewer */
  filterViewerId?: string;
}

export function AllTexturesDialog({
  open,
  onOpenChange,
  modelId,
  modelName,
  onTextureDeleted,
  filterViewerId
}: AllTexturesDialogProps) {
  const [textures, setTextures] = useState<Texture[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch textures when dialog opens
  useEffect(() => {
    if (open) {
      fetchTextures();
      
      // Auto-refresh every 5 seconds while dialog is open
      const interval = setInterval(() => {
        fetchTextures(true); // Silent refresh
      }, 5000);
      
      return () => clearInterval(interval);
    }
}, [open, modelId, filterViewerId]);

  const fetchTextures = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const url = filterViewerId
        ? `/api/model-textures/${modelId}?viewerId=${filterViewerId}`
        : `/api/model-textures/${modelId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch textures');
      }
      const data = await response.json();
      setTextures(data.textures || []);
    } catch (error) {
      console.error('Error fetching textures:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTextures();
    setRefreshing(false);
  };

  const handleDelete = async (textureId: string) => {
    if (!confirm('Delete this texture? This action cannot be undone.')) {
      return;
    }

    setDeletingId(textureId);
    try {
      const response = await fetch(
        `/api/model-textures/${modelId}?textureId=${textureId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete texture');
      }

      // Remove from local state
      setTextures((prev) => prev.filter((t) => t.id !== textureId));

      // Notify parent to refresh
      onTextureDeleted?.();
    } catch (error) {
      console.error('Error deleting texture:', error);
      alert('Failed to delete texture');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>All Textures for {modelName}</DialogTitle>
              <DialogDescription>
                {filterViewerId ? 'Textures uploaded by this class' : 'View and manage all textures uploaded for this model'}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="ml-4"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : textures.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No textures uploaded yet
          </div>
        ) : (
          <div className="space-y-6">
            {textures.map((texture, index) => (
              <div
                key={texture.id}
                className="border rounded-lg p-4 space-y-4 bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">
                      Texture #{textures.length - index}
                      {index === 0 && (
                        <span className="ml-2 text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded">
                          Latest
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Uploaded: {new Date(texture.uploaded_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(texture.id)}
                    disabled={deletingId === texture.id}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {deletingId === texture.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </>
                    )}
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">
                    Processed Texture
                  </p>
                  <img
                    src={getStorageThumbnailUrl(texture.corrected_texture_url, { width: 800, quality: 70 })}
                    alt="Processed texture"
                    loading="lazy"
                    decoding="async"
                    className="w-full rounded-md border border-gray-200 bg-white"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {textures.length > 0 && (
          <div className="text-xs text-gray-500 text-center pt-2 border-t">
            Total: {textures.length} texture{textures.length !== 1 ? 's' : ''}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
