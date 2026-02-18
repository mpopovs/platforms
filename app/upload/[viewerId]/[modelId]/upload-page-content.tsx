'use client';

import { useState } from 'react';
import { UploadTextureForm } from './upload-form';
import { Inline3DPreview } from './inline-3d-preview';

interface UploadPageContentProps {
  viewerId: string;
  modelId: string;
  modelUrl: string;
  modelName: string;
  viewerName: string;
  viewerLogoUrl?: string | null;
  certificateBottomImageUrl?: string;
  surveyEnabled?: boolean;
}

export function UploadPageContent({
  viewerId,
  modelId,
  modelUrl,
  modelName,
  viewerName,
  viewerLogoUrl,
  certificateBottomImageUrl,
  surveyEnabled = true
}: UploadPageContentProps) {
  const [show3DPreview, setShow3DPreview] = useState(false);
  const [processedTextureUrl, setProcessedTextureUrl] = useState<string | null>(null);
  const [onApproveCallback, setOnApproveCallback] = useState<((previewCaptureDataUrl?: string) => void) | null>(null);
  const [onCancelCallback, setOnCancelCallback] = useState<(() => void) | null>(null);
  const [showQueueStatus, setShowQueueStatus] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Show 3D preview in full screen or show title + GIF */}
      {show3DPreview && processedTextureUrl ? (
        <Inline3DPreview
          modelUrl={modelUrl}
          textureUrl={processedTextureUrl}
          modelName={modelName}
          viewerName={viewerName}
          onCancel={() => {
            setShow3DPreview(false);
            setProcessedTextureUrl(null);
            if (onCancelCallback) {
              onCancelCallback();
            }
          }}
          onApprove={(previewCaptureDataUrl) => {
            setShow3DPreview(false);
            if (onApproveCallback) {
              onApproveCallback(previewCaptureDataUrl);
            }
          }}
        />
      ) : (
        <>
          {/* Header - Title at top */}
          <div className="flex-shrink-0 text-center py-6 px-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
              {viewerName}
            </h1>
          </div>

          {/* Main Content Area - GIF hidden while queue status is shown */}
          {!showQueueStatus && (
            <div className="flex-1 flex items-center justify-center px-4 pb-32 relative z-10">
              <div className="w-full flex items-center justify-center">
                <img 
                  src="/info.gif" 
                  alt="Instrukcija" 
                  className="max-w-full max-h-[calc(100vh-300px)] w-auto h-auto object-contain"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Form with fixed buttons at bottom */}
      <UploadTextureForm 
        viewerId={viewerId} 
        modelId={modelId}
        modelUrl={modelUrl}
        modelName={modelName}
        viewerLogoUrl={viewerLogoUrl}
        certificateBottomImageUrl={certificateBottomImageUrl}
        surveyEnabled={surveyEnabled}
        onPreviewReady={(textureUrl, onApprove, onCancel) => {
          setProcessedTextureUrl(textureUrl);
          setOnApproveCallback(() => onApprove);
          setOnCancelCallback(() => onCancel);
          setShow3DPreview(true);
        }}
        show3DPreview={show3DPreview}
        onQueueStatusChange={setShowQueueStatus}
      />
    </div>
  );
}
