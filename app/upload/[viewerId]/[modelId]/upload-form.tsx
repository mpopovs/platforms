'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, XCircle, Eye } from 'lucide-react';
import { processImage } from '@/components/utils/imageProcessor';
import { TexturePreview3D } from '@/components/texture-preview-3d';
import { QueueStatus } from './queue-status';

/**
 * Compress image before upload
 * Reduces file size while maintaining quality
 */
async function compressImage(file: File, maxWidth: number = 2048, quality: number = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale down if larger than maxWidth
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not compress image'));
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert image to WebP format
 * Used for processed textures to save space
 */
async function convertToWebP(dataUrl: string, quality: number = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not convert to WebP'));
            return;
          }
          resolve(blob);
        },
        'image/webp',
        quality
      );
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = dataUrl;
  });
}

export function UploadTextureForm({
  viewerId,
  modelId,
  modelUrl,
  modelName
}: {
  viewerId: string;
  modelId: string;
  modelUrl: string;
  modelName: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showPreviewFor3D, setShowPreviewFor3D] = useState(false);
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [result, setResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    // Preload OpenCV.js on mount (only if not already loaded)
    const existingScript = document.querySelector('script[src="/opencv/opencv.js"]');

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = '/opencv/opencv.js';
      script.async = true;
      script.id = 'opencv-script';
      document.head.appendChild(script);
    }

    // Don't remove the script on cleanup - let it stay loaded
    // This prevents re-downloading OpenCV on re-renders
    return () => {
      // Cleanup no longer removes the script
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      console.log('No file selected');
      return;
    }

    console.log('📁 File selected:', selectedFile.name, selectedFile.size, 'bytes');

    setFile(selectedFile);
    setResult(null);
    setProcessedPreview(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);

    // Process image with ArUco markers
    setProcessing(true);
    try {
      console.log('🎯 Processing image with ArUco markers...');
      const processed = await processImage(selectedFile, {
        targetSize: 2048,
        enableQRDetection: true // This detects ArUco markers, not QR codes
      });

      if (processed) {
        console.log('✅ ArUco markers detected! Texture cropped:', processed.width, 'x', processed.height);
        setProcessedPreview(processed.dataUrl);
        setResult({
          type: 'success',
          message: '✅ ArUco markers detected! Texture cropped to 2048x2048 and ready to upload.'
        });
        // Automatically show 3D preview
        setShowPreviewFor3D(true);
      } else {
        console.log('❌ No ArUco markers detected');
        setResult({
          type: 'error',
          message: '❌ Could not detect ArUco markers. Please ensure all 4 markers (IDs 0-3) are clearly visible in the photo. You can still upload the original image.'
        });
      }
    } catch (error) {
      console.error('❌ Error processing image:', error);
      setResult({
        type: 'error',
        message: '⚠️ Error processing image. You can still upload the original image.'
        });
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!file) return;

    // Close preview if open
    setShowPreviewFor3D(false);
    
    setUploading(true);

    const formData = new FormData();

    // Add viewerId and modelId to the form data
    formData.append('viewerId', viewerId);
    formData.append('modelId', modelId);

    // If we have a processed image (ArUco cropped), upload both original and cropped
    if (processedPreview) {
      try {
        console.log('📤 Compressing and converting images...');
        
        // Compress original photo before upload (JPEG format, max 2048px)
        const compressedOriginal = await compressImage(file, 2048, 0.85);
        console.log(`✅ Original compressed: ${file.size} → ${compressedOriginal.size} bytes (${Math.round((1 - compressedOriginal.size / file.size) * 100)}% reduction)`);
        
        // Convert processed texture to WebP format
        const webpBlob = await convertToWebP(processedPreview, 0.9);
        const processedFile = new File([webpBlob], `cropped_${file.name.replace(/\.[^.]+$/, '.webp')}`, { type: 'image/webp' });
        console.log(`✅ Processed texture converted to WebP: ${processedFile.size} bytes`);

        // Upload both compressed original and WebP processed
        formData.append('photo', processedFile);
        formData.append('originalPhoto', compressedOriginal);
        formData.append('clientProcessed', 'true');
      } catch (error) {
        console.error('❌ Error compressing/converting images:', error);
        console.log('⚠️ Falling back to original image');
        formData.append('photo', file);
      }
    } else {
      console.log('📤 Compressing original image (no ArUco processing)');
      try {
        const compressedFile = await compressImage(file, 2048, 0.85);
        console.log(`✅ Original compressed: ${file.size} → ${compressedFile.size} bytes (${Math.round((1 - compressedFile.size / file.size) * 100)}% reduction)`);
        formData.append('photo', compressedFile);
      } catch (error) {
        console.error('❌ Error compressing image:', error);
        formData.append('photo', file);
      }
    }

    try {
      const response = await fetch('/api/upload-texture', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        setQueueNumber(data.queueNumber);
        setResult({
          type: 'success',
          message: data.message || 'Texture uploaded successfully!'
        });
      } else {
        setResult({
          type: 'error',
          message: data.error + (data.hint ? '. ' + data.hint : '')
        });
      }
    } catch (error) {
      setResult({
        type: 'error',
        message: 'Network error. Please try again.'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
        <input
          type="file"
          id="photo"
          name="photo"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          disabled={processing}
        />
        <label
          htmlFor="photo"
          className={`cursor-pointer block ${processing ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {processing ? (
            <div className="text-6xl animate-pulse">⏳</div>
          ) : file ? (
            <div className="text-6xl">✅</div>
          ) : (
            // <Upload className="h-16 w-16 text-blue-400 mx-auto" />
            "Foto"
          )}
        </label>
      </div>

      {processing && (
        <div className="rounded-lg p-4 bg-blue-50 border border-blue-200 text-center">
          <div className="text-4xl animate-spin inline-block">Process</div>
        </div>
      )}

      {preview && !processedPreview && (
        <div className="rounded-lg overflow-hidden border-2 border-gray-300">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-auto"
          />
        </div>
      )}

      {processedPreview && (
        <div className="space-y-3">
          <div className="rounded-lg overflow-hidden border-4 border-green-400 shadow-lg">
            <div className="text-center py-2 bg-green-50">
              <span className="text-3xl">Griež</span>
            </div>
            <img
              src={processedPreview}
              alt="Preview"
              className="w-full h-auto"
            />
          </div>
          <details>
            <summary className="cursor-pointer text-center text-2xl hover:scale-110 transition-transform inline-block w-full">Foto</summary>
            {preview && (
              <div className="mt-2 rounded-lg overflow-hidden border-2 border-gray-300">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-auto"
                />
              </div>
            )}
          </details>
        </div>
      )}

      {result && !queueNumber && (
        <div
          className={`rounded-lg p-6 text-center ${
            result.type === 'success'
              ? 'bg-green-50 border-2 border-green-300'
              : 'bg-amber-50 border-2 border-amber-300'
          }`}
        >
          <div className="text-5xl">
            {result.type === 'success' ? '✅' : '⚠️'}
          </div>
        </div>
      )}

      {/* Upload button - hidden when preview is showing or after successful upload */}
      {!showPreviewFor3D && !queueNumber && (
        <Button
          type="submit"
          disabled={!file || uploading || processing || !processedPreview}
          className="w-full text-2xl py-8"
          size="lg"
        >
          {uploading ? '⏳' : 'Aiziet'}
        </Button>
      )}

      {/* Queue Status after successful upload */}
      {queueNumber && result?.type === 'success' && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-4 border-purple-300 rounded-2xl p-8 text-center shadow-xl">
          <div className="text-7xl mb-4">Rinda</div>
          <div className="text-6xl font-bold text-purple-900 mb-2">#{queueNumber}</div>
          <QueueStatus queueNumber={queueNumber} viewerId={viewerId} />
        </div>
      )}

      {/* 3D Preview Dialog - shown immediately after processing */}
      {processedPreview && (
        <TexturePreview3D
          open={showPreviewFor3D}
          onOpenChange={(open) => {
            setShowPreviewFor3D(open);
          }}
          modelUrl={modelUrl}
          textureUrl={processedPreview}
          modelName={modelName}
          onUpload={handleSubmit}
        />
      )}
    </form>
  );
}
