'use client';

import { useRef, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Camera, Share2, Upload, X } from 'lucide-react';

import { Model3D } from './model-3d';

interface TexturePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelUrl: string;
  textureUrl: string;
  modelName: string;
  onUpload?: () => void;
}

function useScreenshot() {
  const { gl, scene, camera } = useThree();
  
  const takeScreenshot = (modelName: string, forDownload: boolean = true): Promise<Blob | null> => {
    return new Promise((resolve) => {
      try {
        // Store original size
        const originalWidth = gl.domElement.width;
        const originalHeight = gl.domElement.height;
        
        // Set a fixed square size for screenshot (1:1 aspect ratio)
        const screenshotSize = 1024;
        gl.setSize(screenshotSize, screenshotSize);
        
        // Update camera aspect ratio
        if ('aspect' in camera) {
          (camera as THREE.PerspectiveCamera).aspect = 1;
          (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        }
        
        // Render at new size
        gl.render(scene, camera);
        
        // Get canvas data
        const canvas = gl.domElement;
        canvas.toBlob((blob) => {
          // Restore original size BEFORE doing anything else
          gl.setSize(originalWidth, originalHeight);
          if ('aspect' in camera) {
            (camera as THREE.PerspectiveCamera).aspect = originalWidth / originalHeight;
            (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
          }
          
          // Re-render at original size to fix display
          gl.render(scene, camera);
          
          if (blob && forDownload) {
            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${modelName}-textured-${Date.now()}.png`;
            link.click();
            
            // Cleanup
            URL.revokeObjectURL(url);
          }
          
          resolve(blob);
        }, 'image/png');
      } catch (error) {
        console.error('Screenshot error:', error);
        resolve(null);
      }
    });
  };

  return takeScreenshot;
}

function ScreenshotHandler({ onScreenshotReady }: { onScreenshotReady: (fn: (modelName: string, forDownload?: boolean) => Promise<Blob | null>) => void }) {
  const takeScreenshot = useScreenshot();

  // Expose the screenshot function to parent
  useRef(() => {
    onScreenshotReady((modelName: string, forDownload: boolean = true) => takeScreenshot(modelName, forDownload));
  }).current();

  return null;
}

export function TexturePreview3D({
  open,
  onOpenChange,
  modelUrl,
  textureUrl,
  modelName,
  onUpload
}: TexturePreviewProps) {
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const screenshotFnRef = useRef<((modelName: string, forDownload?: boolean) => Promise<Blob | null>) | null>(null);

  const handleScreenshot = async () => {
    if (screenshotFnRef.current) {
      setSaving(true);
      await screenshotFnRef.current(modelName, true);
      setTimeout(() => setSaving(false), 1000);
    }
  };

  const handleShare = async () => {
    if (!screenshotFnRef.current) return;
    
    setSharing(true);
    
    try {
      // Take screenshot without downloading
      const blob = await screenshotFnRef.current(modelName, false);
      
      if (!blob) {
        console.error('Failed to capture screenshot');
        setSharing(false);
        return;
      }

      // Check if Web Share API is supported
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `${modelName}-textured-${Date.now()}.png`, { type: 'image/png' });
        
        // Check if we can share files
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: modelName,
            text: 'Check out my 3D textured model!'
          });
        } else {
          // Fallback: just share without file
          const url = URL.createObjectURL(blob);
          await navigator.share({
            title: modelName,
            text: 'Check out my 3D textured model!',
            url: url
          });
          URL.revokeObjectURL(url);
        }
      } else {
        // Fallback: download the image if sharing is not supported
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${modelName}-textured-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      // User cancelled or error occurred
      console.log('Share cancelled or failed:', error);
    } finally {
      setSharing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Close button */}
      <button
        onClick={() => onOpenChange(false)}
        className="absolute top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-sm transition-colors"
      >
        <X className="h-6 w-6" />
      </button>

      {/* 3D Canvas - Fullscreen */}
      <div className="w-full h-full">
        <Canvas shadows>
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
            textureUrl={textureUrl}
            rotationSpeed={0.3}
            modelId="preview"
            textureId="preview-texture"
          />
          
          {/* Camera controls */}
          <OrbitControls 
            enableZoom={true}
            enablePan={true}
            autoRotate={autoRotate}
            autoRotateSpeed={2}
            minDistance={3}
            maxDistance={20}
          />

          {/* Screenshot handler (inside Canvas to access Three.js context) */}
          <ScreenshotHandler 
            onScreenshotReady={(fn) => {
              screenshotFnRef.current = fn;
            }}
          />
        </Canvas>
      </div>

      {/* Bottom action buttons */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-sm p-6">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-4">
          {/* Capture button */}
          <button
            onClick={handleScreenshot}
            disabled={saving}
            className="flex flex-col items-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-2xl p-6 backdrop-blur-sm transition-all disabled:opacity-50"
          >
            <Camera className="h-12 w-12" />
            <span className="text-lg font-semibold">
              {saving ? '⏳' : '📸'}
            </span>
          </button>

          {/* Share button */}
          <button
            onClick={handleShare}
            disabled={sharing}
            className="flex flex-col items-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-2xl p-6 backdrop-blur-sm transition-all disabled:opacity-50"
          >
            <Share2 className="h-12 w-12" />
            <span className="text-lg font-semibold">
              {sharing ? '⏳' : '📤'}
            </span>
          </button>

          {/* Upload button */}
          {onUpload && (
            <button
              onClick={onUpload}
              className="flex flex-col items-center gap-2 bg-green-500/80 hover:bg-green-500 text-white rounded-2xl p-6 backdrop-blur-sm transition-all shadow-lg"
            >
              <Upload className="h-12 w-12" />
              <span className="text-lg font-semibold">⬆️</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
