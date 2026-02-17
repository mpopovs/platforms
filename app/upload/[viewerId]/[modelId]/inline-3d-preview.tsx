'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Model3D } from '@/components/model-3d';
import { Check, X } from 'lucide-react';
import { useThree } from '@react-three/fiber';

interface Inline3DPreviewProps {
  modelUrl: string;
  textureUrl: string;
  modelName: string;
  viewerName: string;
  onCancel: () => void;
  onApprove: (previewCaptureDataUrl?: string) => void;
}

function ScreenshotCapture({ onCaptureReady }: { onCaptureReady: (captureFn: () => string | null, hasContentFn: () => boolean) => void }) {
  const { gl, scene, camera } = useThree();

  onCaptureReady(
    () => {
      try {
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/png');
      } catch (error) {
        console.error('Failed to capture 3D preview screenshot:', error);
        return null;
      }
    },
    () => {
      try {
        const sourceCanvas = gl.domElement;
        if (!sourceCanvas.width || !sourceCanvas.height) {
          return false;
        }

        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 32;
        sampleCanvas.height = 32;
        const sampleCtx = sampleCanvas.getContext('2d');
        if (!sampleCtx) {
          return false;
        }

        sampleCtx.drawImage(sourceCanvas, 0, 0, 32, 32);
        const { data } = sampleCtx.getImageData(0, 0, 32, 32);

        let nonWhitePixels = 0;
        for (let index = 0; index < data.length; index += 4) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const alpha = data[index + 3];

          const isVisible = alpha > 0;
          const isNearWhite = red > 245 && green > 245 && blue > 245;

          if (isVisible && !isNearWhite) {
            nonWhitePixels += 1;
          }
        }

        return nonWhitePixels > 20;
      } catch {
        return false;
      }
    }
  );

  return null;
}

export function Inline3DPreview({
  modelUrl,
  textureUrl,
  modelName,
  viewerName,
  onCancel,
  onApprove
}: Inline3DPreviewProps) {
  const captureFnRef = useRef<(() => string | null) | null>(null);
  const hasContentFnRef = useRef<(() => boolean) | null>(null);
  const latestCaptureRef = useRef<string | null>(null);
  const capturedOnceRef = useRef(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [textureObjUrl, setTextureObjUrl] = useState<string | null>(null);

  // Convert data URL to object URL to reduce memory pressure on mobile
  useEffect(() => {
    if (textureUrl.startsWith('data:')) {
      try {
        const parts = textureUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const byteStr = atob(parts[1]);
        const ab = new ArrayBuffer(byteStr.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteStr.length; i++) {
          ia[i] = byteStr.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mime });
        const objUrl = URL.createObjectURL(blob);
        setTextureObjUrl(objUrl);
        return () => URL.revokeObjectURL(objUrl);
      } catch (e) {
        console.warn('[Mobile] Failed to convert data URL to blob URL:', e);
        setTextureObjUrl(textureUrl);
      }
    } else {
      setTextureObjUrl(textureUrl);
    }
  }, [textureUrl]);

  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (capturedOnceRef.current || !captureFnRef.current || !hasContentFnRef.current) {
        return;
      }

      if (hasContentFnRef.current()) {
        capturedOnceRef.current = true;
        setTimeout(() => {
          if (captureFnRef.current) {
            const captureDataUrl = captureFnRef.current();
            if (captureDataUrl) {
              latestCaptureRef.current = captureDataUrl;
            }
          }
        }, 300);
      }
    }, 150);

    const fallbackTimeout = setTimeout(() => {
      if (!capturedOnceRef.current && captureFnRef.current) {
        capturedOnceRef.current = true;
        const captureDataUrl = captureFnRef.current();
        if (captureDataUrl) {
          latestCaptureRef.current = captureDataUrl;
        }
      }
    }, 5000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(fallbackTimeout);
    };
  }, []);

  const handleApprove = () => {
    onApprove(latestCaptureRef.current ?? undefined);
  };

  return (
    <div className="fixed inset-0 w-full h-full z-30">
      {/* Title overlay on top */}
      <div className="absolute top-0 left-0 right-0 z-50 text-center py-6 px-4">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 drop-shadow-lg">
          {viewerName}
        </h1>
      </div>

      {/* 3D Canvas - fills entire screen */}
      <div className="absolute inset-0 w-full h-full bg-white">
        {webglFailed ? (
          /* Fallback when WebGL is not available (low memory on mobile) */
          <div className="flex flex-col items-center justify-center h-full px-4">
            {textureObjUrl && (
              <img
                src={textureObjUrl}
                alt="Texture preview"
                className="max-w-[80%] max-h-[60vh] object-contain rounded-lg shadow-md"
              />
            )}
            <p className="mt-4 text-gray-500 text-sm text-center">
              3D preview unavailable on this device
            </p>
          </div>
        ) : textureObjUrl ? (
        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false }}
          onCreated={({ gl }) => {
            // Check WebGL context validity
            const ctx = gl.getContext();
            if (!ctx || ctx.isContextLost()) {
              console.error('[Mobile] WebGL context lost or invalid');
              setWebglFailed(true);
            }
          }}
          fallback={
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
              <p className="mt-4 text-gray-500 text-sm">Loading 3D preview...</p>
            </div>
          }
        >
          <ScreenshotCapture onCaptureReady={(captureFn, hasContentFn) => {
            captureFnRef.current = captureFn;
            hasContentFnRef.current = hasContentFn;
          }} />
          <PerspectiveCamera makeDefault position={[0, 0, 8]} />
          
          {/* Lighting - matching museum viewer setup */}
          <ambientLight />
          <hemisphereLight args={[0xffffff, 0x444444, 1.8]} />
          
          {/* Key light - soft spotlight with penumbra for diffused edges */}
          <spotLight 
            position={[20, 30, 20]} 
            intensity={5}
            angle={0.6}
            penumbra={1}
            decay={0}
          />
          
          {/* Fill light - soft from front-left */}
          <spotLight 
            position={[-20, 20, 20]} 
            intensity={4}
            angle={0.6}
            penumbra={1}
            decay={0}
          />
          
          {/* Back light - soft illumination from back */}
          <spotLight 
            position={[0, 10, -30]} 
            intensity={4}
            angle={0.6}
            penumbra={1}
            decay={0}
          />
          
          {/* Bottom fill light - soft from below */}
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
            textureUrl={textureObjUrl}
            rotationSpeed={0.3}
            modelId="inline-preview"
            textureId="inline-preview-texture"
          />
          
          {/* Camera controls */}
          <OrbitControls 
            enableZoom={true}
            enablePan={true}
            autoRotate={true}
            autoRotateSpeed={2}
            minDistance={3}
            maxDistance={20}
          />
        </Canvas>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Action buttons - overlay on top of 3D scene */}
      <div className="absolute bottom-0 left-0 right-0 z-50 p-4">
        <div className="w-full max-w-3xl mx-auto flex gap-4">
          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="flex-1 bg-red-500/90 hover:bg-red-500 active:bg-red-600 backdrop-blur-sm rounded-xl py-6 flex items-center justify-center cursor-pointer transition-colors shadow-lg"
          >
            <X className="h-12 w-12 text-white" strokeWidth={2} />
          </button>

          {/* Approve button */}
          <button
            onClick={handleApprove}
            className="flex-1 bg-green-500/90 hover:bg-green-500 active:bg-green-600 backdrop-blur-sm rounded-xl py-6 flex items-center justify-center cursor-pointer transition-colors shadow-lg"
          >
            <Check className="h-12 w-12 text-white" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
