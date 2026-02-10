import { notFound } from 'next/navigation';
import { getViewerModel, getViewerConfig } from '@/lib/viewers';
import { UploadTextureForm } from './upload-form';
import { createClient } from '@/lib/supabase/server';

export default async function UploadTexturePage({
  params
}: {
  params: Promise<{ viewerId: string; modelId: string }>;
}) {
  const { viewerId, modelId } = await params;
  const supabase = await createClient();

  // Get model
  const model = await getViewerModel(modelId, supabase);
  if (!model || model.viewer_id !== viewerId) {
    notFound();
  }

  // Get viewer
  const viewer = await getViewerConfig(viewerId, supabase);
  if (!viewer) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg  mt-6 p-6 md:p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {viewer.name}
            </h1>
            <p className="text-sm text-gray-500">
              {model.name}
            </p>
          </div>

          {/* Placeholder for Animated Instructions */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-8 mb-6">
            <div className="text-center">
              <div className="text-6xl mb-4">Animēta instrukcija</div>
              
            </div>
          </div>

          <UploadTextureForm 
            viewerId={viewerId} 
            modelId={modelId}
            modelUrl={model.model_file_url}
            modelName={model.name}
          />
        </div>
      </div>
    </div>
  );
}
