import { getAllUserViewerConfigs } from '@/lib/viewers';
import { createClient } from '@/lib/supabase/server';
import { ViewersManagement } from './viewers-management';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Viewer Management | ${rootDomain}`,
  description: 'Manage your viewers'
};

export default async function ViewersPage() {
  // Create one authenticated SSR client and use it throughout
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null; // middleware handles redirect, this is a safety net

  // Fetch viewers using the authenticated client directly
  const viewers = await getAllUserViewerConfigs(user.id, supabase);

  // Fetch models for each viewer using the same authenticated client
  const viewersWithModels = await Promise.all(
    viewers.map(async (viewer) => {
      const { data: models } = await supabase
        .from('viewer_models')
        .select(`
          id, viewer_id, name, model_file_url, texture_template_url,
          qr_code_data, qr_code_image_url, order_index, short_code,
          uv_map_url, marker_id_base, created_at, updated_at
        `)
        .eq('viewer_id', viewer.id)
        .order('order_index', { ascending: true });

      // For each model, get the latest texture
      const modelsWithTextures = await Promise.all(
        (models || []).map(async (model) => {
          const { data: textures } = await supabase
            .from('model_textures')
            .select('id, model_id, corrected_texture_url, original_photo_url, uploaded_at, processed_at, author_name, author_age')
            .eq('model_id', model.id)
            .order('uploaded_at', { ascending: false })
            .limit(1);

          return {
            ...model,
            latest_texture: textures?.[0] ?? null,
          };
        })
      );

      return { ...viewer, models: modelsWithTextures };
    })
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <ViewersManagement initialViewers={viewersWithModels} />
    </div>
  );
}
