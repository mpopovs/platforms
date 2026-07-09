import { createClient } from '@/lib/supabase/server';
import { getAllUserViewerConfigs } from '@/lib/viewers';
import { listExhibitionConfigsForUser } from '@/lib/exhibition';
import { ExhibitionCuration } from './exhibition-curation';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Exhibition Grid | ${rootDomain}`,
  description: 'Curate the multi-model exhibition show display',
};

export default async function ExhibitionAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null; // middleware handles redirect, this is a safety net

  const viewers = await getAllUserViewerConfigs(user.id, supabase);

  // Classroom ("klase") viewers inherit their models from their parent viewer,
  // so the model browser only needs to list top-level viewers.
  const topLevelViewers = viewers.filter((v) => !v.parentViewerId);

  const viewersWithModels = await Promise.all(
    topLevelViewers.map(async (viewer) => {
      const { data: models } = await supabase
        .from('viewer_models')
        .select('id, viewer_id, name, model_file_url, texture_template_url, order_index')
        .eq('viewer_id', viewer.id)
        .order('order_index', { ascending: true });

      return { id: viewer.id, name: viewer.name, models: models || [] };
    })
  );

  const configs = await listExhibitionConfigsForUser(user.id, supabase);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <ExhibitionCuration viewers={viewersWithModels} initialConfigs={configs} />
    </div>
  );
}
