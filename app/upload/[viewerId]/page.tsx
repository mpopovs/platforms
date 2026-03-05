import { notFound } from 'next/navigation';
import { getViewerConfig, getViewerModels } from '@/lib/viewers';
import { createClient } from '@/lib/supabase/server';
import { AutoUploadForm } from './auto-upload-form';

export default async function ViewerUploadPage({
  params,
}: {
  params: Promise<{ viewerId: string }>;
}) {
  const { viewerId } = await params;
  const supabase = await createClient();

  // Get viewer config
  const viewer = await getViewerConfig(viewerId, supabase);
  if (!viewer) {
    notFound();
  }

  // Get all models for this viewer (includes marker_id_base)
  const models = await getViewerModels(viewerId, supabase);
  if (!models || models.length === 0) {
    notFound();
  }

  // Build a minimal model list for the client component
  const modelList = models.map((m) => ({
    id: m.id,
    name: m.name,
    model_file_url: m.model_file_url,
    marker_id_base: m.marker_id_base ?? null,
  }));

  return (
    <div className="min-h-screen">
      <AutoUploadForm
        viewerId={viewerId}
        viewerName={viewer.name}
        viewerLogoUrl={viewer.logo_url}
        models={modelList}
        surveyEnabled={viewer.settings?.surveyEnabled ?? true}
        surveyLanguage={viewer.settings?.surveyLanguage}
        certificateBottomImageUrl={viewer.settings?.certificateBottomImageUrl}
      />
    </div>
  );
}
