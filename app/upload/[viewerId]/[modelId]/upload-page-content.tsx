'use client';

import { useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Model3D } from '@/components/model-3d';
import { UploadTextureForm } from './upload-form';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

interface UploadPageContentProps {
  viewerId: string;
  modelId: string;
  modelUrl: string;
  modelName: string;
  viewerName: string;
}

export function UploadPageContent({
  viewerId,
  modelId,
  modelUrl,
  modelName,
  viewerName
}: UploadPageContentProps) {
  const [processedTexture, setProcessedTexture] = useState<string | null>(null);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const formResetRef = useRef<() => void>(null);

  const handleRefresh = () => {
    setDetectionFailed(false);
    setProcessedTexture(null);
    if (formResetRef.current) {
      formResetRef.current();
    }
  };

  const handleTextureProcessedWrapper = (textureUrl: string | null) => {
    setProcessedTexture(textureUrl);
    // If processing starts (textureUrl could be set or clearing), reset detection failed state
    if (textureUrl === null) {
      setDetectionFailed(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Header - only show when not displaying 3D model */}
      {!processedTexture && (
        <div className="flex-shrink-0 text-center py-4">
          <h1 className="text-3xl font-bold text-gray-900">
            {viewerName}
          </h1>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 flex items-center justify-center ${!processedTexture ? 'px-4' : ''}`} style={{ marginBottom: processedTexture ? '0' : '180px' }}>
        {isProcessing ? (
          // Show simple spinner while processing
          <div className="text-center">
            <Loader2 className="h-32 w-32 mx-auto text-gray-700 animate-spin" />
          </div>
        ) : detectionFailed ? (
          // Show sad emoji when detection fails
          <div className="text-center">
            <div className="text-9xl">:(</div>
          </div>
        ) : !processedTexture ? (
          // Show animated instructions initially - scales responsively
          <div className="w-full h-full flex items-center justify-center">
            <img 
              src="/info.gif" 
              alt="Instrukcija" 
              className="max-w-[90vw] max-h-[calc(100vh-300px)] w-auto h-auto object-contain"
            />
          </div>
        ) : (
          // Show 3D model with processed texture - fills entire screen
          <>
            {/* Floating title on top of 3D canvas */}
            <div className="fixed top-4 left-0 right-0 z-50 text-center">
              <h1 className="text-3xl font-bold text-gray-900">
                {viewerName}
              </h1>
            </div>
            
            <div className="fixed inset-0 w-full h-full">
              <Canvas>
                {/* Camera */}
                <PerspectiveCamera 
                  makeDefault 
                  position={[0, 0, 8]} 
                  fov={50}
                />
                
                {/* Ambient light - general scene illumination */}
                <ambientLight intensity={0.8} />
                
                {/* Main front light - strongest */}
                <spotLight 
                  position={[10, 15, 20]} 
                  intensity={6}
                  angle={0.6}
                  penumbra={1}
                  decay={0}
                />
                
                {/* Side lights for definition */}
                <spotLight 
                  position={[-15, 10, 10]} 
                  intensity={4}
                  angle={0.6}
                  penumbra={1}
                  decay={0}
                />
                
                <spotLight 
                  position={[15, 10, 10]} 
                  intensity={4}
                  angle={0.6}
                  penumbra={1}
                  decay={0}
                />
                
                {/* Back light */}
                <spotLight 
                  position={[0, 10, -30]} 
                  intensity={4}
                  angle={0.6}
                  penumbra={1}
                  decay={0}
                />
                
                {/* Bottom fill light */}
                <spotLight 
                  position={[0, -20, 10]} 
                  intensity={3}
                  angle={0.8}
                  penumbra={1}
                  decay={0}
                />
                
                {/* 3D Model with texture */}
                <Model3D 
                  modelUrl={modelUrl}
                  textureUrl={processedTexture}
                  rotationSpeed={0.3}
                  modelId="upload-preview"
                  textureId="upload-texture"
                />
                
                {/* Camera controls */}
                <OrbitControls 
                  enableZoom={true}
                  enablePan={true}
                  autoRotate={true}
                  autoRotateSpeed={1.5}
                  minDistance={3}
                  maxDistance={20}
                />
              </Canvas>
            </div>
          </>
        )}
      </div>

      {/* Form with fixed buttons at bottom */}
      <UploadTextureForm 
        viewerId={viewerId} 
        modelId={modelId}
        modelUrl={modelUrl}
        modelName={modelName}
        onTextureProcessed={handleTextureProcessedWrapper}
        onDetectionFailed={() => setDetectionFailed(true)}
        onResetRef={(resetFn) => { formResetRef.current = resetFn; }}
        onRefresh={handleRefresh}
        detectionFailed={detectionFailed}
        onProcessingChange={setIsProcessing}
      />
    </div>
  );
}
