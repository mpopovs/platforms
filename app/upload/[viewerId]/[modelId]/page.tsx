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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Upload Your Texture
            </h1>
            <p className="text-lg text-gray-600 mb-1">
              {viewer.name}
            </p>
            <p className="text-sm text-gray-500">
              Model: {model.name}
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-blue-900 mb-2">Instructions:</h2>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              <li>Take a photo of your colored texture with ArUco markers visible</li>
              <li>Make sure all 4 ArUco markers (corner markers) are clearly visible</li>
              <li>Upload the photo below</li>
              <li>Your texture will be automatically cropped and applied to the 3D model!</li>
            </ol>
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
