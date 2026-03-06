import { notFound } from 'next/navigation';
import { getViewerModel, getViewerConfig } from '@/lib/viewers';
import { UploadPageContent } from './upload-page-content';
import { createClient } from '@/lib/supabase/server';

export default async function UploadTexturePage({
  params
}: {
  params: Promise<{ viewerId: string; modelId: string }>;
}) {
  const { viewerId, modelId } = await params;
  const supabase = await createClient();

  // Get viewer
  const viewer = await getViewerConfig(viewerId, supabase);
  if (!viewer) {
    notFound();
  }

  // Get model — allow model to belong to either this viewer or its parent (classroom viewers inherit models)
  const model = await getViewerModel(modelId, supabase);
  const validOwner = viewer.parentViewerId ?? viewerId;
  if (!model || model.viewer_id !== validOwner) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <UploadPageContent
        viewerId={viewerId}
        modelId={modelId}
        modelUrl={model.model_file_url}
        modelName={model.name}
        viewerName={viewer.name}
        viewerLogoUrl={viewer.logo_url}
        certificateBottomImageUrl={viewer.settings?.certificateBottomImageUrl}
        surveyEnabled={viewer.settings?.surveyEnabled ?? true}
        surveyLanguage={viewer.settings?.surveyLanguage}
      />
    </div>
  );
}
