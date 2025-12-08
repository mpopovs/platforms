'use client';

import { useRef, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Camera, Download, X } from 'lucide-react';

import { Model3D } from './model-3d';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TexturePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelUrl: string;
  textureUrl: string;
  modelName: string;
  authorName?: string;
  authorAge?: string;
}

function useScreenshot() {
  const { gl, scene, camera } = useThree();
  
  const takeScreenshot = (modelName: string) => {
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
        if (blob) {
          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${modelName}-textured-${Date.now()}.png`;
          link.click();
          
          // Cleanup
          URL.revokeObjectURL(url);
        }
        
        // Restore original size
        gl.setSize(originalWidth, originalHeight);
        if ('aspect' in camera) {
          (camera as THREE.PerspectiveCamera).aspect = originalWidth / originalHeight;
          (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        }
      }, 'image/png');
    } catch (error) {
      console.error('Screenshot error:', error);
    }
  };

  return takeScreenshot;
}

function ScreenshotHandler({ onScreenshotReady }: { onScreenshotReady: (fn: (modelName: string) => void) => void }) {
  const takeScreenshot = useScreenshot();

  // Expose the screenshot function to parent
  useRef(() => {
    onScreenshotReady((modelName: string) => takeScreenshot(modelName));
  }).current();

  return null;
}

export function TexturePreview3D({
  open,
  onOpenChange,
  modelUrl,
  textureUrl,
  modelName,
  authorName,
  authorAge
}: TexturePreviewProps) {
  const [saving, setSaving] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const screenshotFnRef = useRef<((modelName: string) => void) | null>(null);

  // Enable auto-rotation after 10 seconds
  useEffect(() => {
    if (open) {
      setAutoRotate(false);
      const timer = setTimeout(() => {
        setAutoRotate(true);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleScreenshot = () => {
    if (screenshotFnRef.current) {
      setSaving(true);
      screenshotFnRef.current(modelName);
      // Reset saving state after a delay
      setTimeout(() => setSaving(false), 1000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle>Preview: {modelName} with Your Texture</DialogTitle>
          <DialogDescription>
            {authorName && authorAge && (
              <span>Created by {authorName}, age {authorAge}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 relative bg-gray-900 rounded-lg overflow-hidden">
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

          {/* Instructions overlay */}
          <div className="absolute top-4 left-4 bg-black/70 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm">
            <p className="font-semibold mb-1">Controls:</p>
            <ul className="text-xs space-y-0.5">
              <li>• Drag to rotate</li>
              <li>• Scroll to zoom</li>
              <li>• Right-click drag to pan</li>
            </ul>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleScreenshot}
            disabled={saving}
            variant="default"
            size="lg"
            className="w-full"
          >
            {saving ? (
              <>
                <Download className="h-5 w-5 mr-2 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                <Camera className="h-5 w-5 mr-2" />
                Save Screenshot
              </>
            )}
          </Button>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            <p className="font-semibold">✓ Texture successfully applied!</p>
            <p className="text-xs mt-1">You can rotate, zoom, and save a screenshot of your textured model.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
