'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface PendingTexture {
  id: string;
  model_id: string;
  model_name?: string;
  original_photo_url: string;
  corrected_texture_url: string;
  uploaded_at: string;
  author_name?: string | null;
  author_age?: number | null;
  moderation_status: 'pending' | 'approved' | 'rejected';
}

interface TextureModerationPanelProps {
  viewerId: string;
}

export function TextureModerationPanel({ viewerId }: TextureModerationPanelProps) {
  const [textures, setTextures] = useState<PendingTexture[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const supabase = createClient();

  const fetchTextures = useCallback(async () => {
    setLoading(true);
    try {
      // Get all models for this viewer
      const { data: models } = await supabase
        .from('viewer_models')
        .select('id, name')
        .eq('viewer_id', viewerId);

      if (!models || models.length === 0) {
        setTextures([]);
        return;
      }

      const modelIds = models.map((m) => m.id);
      const modelMap: Record<string, string> = {};
      models.forEach((m) => { modelMap[m.id] = m.name; });

      // Get textures with moderation_status filter
      let query = supabase
        .from('model_textures')
        .select('id, model_id, original_photo_url, corrected_texture_url, uploaded_at, author_name, author_age, moderation_status')
        .in('model_id', modelIds)
        .order('uploaded_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('moderation_status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const enriched = (data || []).map((t: any) => ({
        ...t,
        model_name: modelMap[t.model_id] ?? t.model_id
      }));

      setTextures(enriched);
    } catch (err) {
      console.error('Error fetching textures for moderation:', err);
    } finally {
      setLoading(false);
    }
  }, [viewerId, filter, supabase]);

  useEffect(() => {
    fetchTextures();

    // Realtime updates when a new texture is uploaded
    const channel = supabase
      .channel('moderation-texture-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'model_textures' },
        () => { fetchTextures(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchTextures, supabase]);

  async function moderate(textureId: string, status: 'approved' | 'rejected') {
    setActionLoading(textureId);
    try {
      const res = await fetch('/api/admin/moderate-texture', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textureId, status })
      });
      if (!res.ok) {
        const body = await res.json();
        alert(`Error: ${body.error}`);
        return;
      }
      // Optimistically remove from list when filter is not 'all'
      if (filter !== 'all') {
        setTextures((prev) => prev.filter((t) => t.id !== textureId));
      } else {
        setTextures((prev) =>
          prev.map((t) => (t.id === textureId ? { ...t, moderation_status: status } : t))
        );
      }
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount = textures.filter((t) => t.moderation_status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && pendingCount > 0 && filter !== 'pending' && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading textures…</div>
      ) : textures.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          {filter === 'pending' ? 'No textures pending review 🎉' : `No ${filter} textures found.`}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {textures.map((texture) => (
            <div
              key={texture.id}
              className={`rounded-xl border bg-white overflow-hidden shadow-sm ${
                texture.moderation_status === 'pending'
                  ? 'border-yellow-300'
                  : texture.moderation_status === 'approved'
                  ? 'border-green-300'
                  : 'border-red-300'
              }`}
            >
              {/* Texture image */}
              <div className="relative aspect-square bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={texture.corrected_texture_url || texture.original_photo_url}
                  alt="Texture preview"
                  className="w-full h-full object-contain"
                />
                {/* Status badge */}
                <span
                  className={`absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    texture.moderation_status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : texture.moderation_status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {texture.moderation_status}
                </span>
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div className="font-medium text-gray-700 truncate">{texture.model_name}</div>
                  {texture.author_name && (
                    <div>
                      By {texture.author_name}
                      {texture.author_age != null ? `, age ${texture.author_age}` : ''}
                    </div>
                  )}
                  <div>{new Date(texture.uploaded_at).toLocaleString()}</div>
                </div>

                {/* Action buttons */}
                {texture.moderation_status !== 'approved' && (
                  <Button
                    size="sm"
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    disabled={actionLoading === texture.id}
                    onClick={() => moderate(texture.id, 'approved')}
                  >
                    {actionLoading === texture.id ? '…' : '✓ Approve'}
                  </Button>
                )}
                {texture.moderation_status !== 'rejected' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-red-300 text-red-600 hover:bg-red-50"
                    disabled={actionLoading === texture.id}
                    onClick={() => moderate(texture.id, 'rejected')}
                  >
                    {actionLoading === texture.id ? '…' : '✕ Reject'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
