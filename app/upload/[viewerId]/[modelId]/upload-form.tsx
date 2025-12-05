'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, XCircle, Eye } from 'lucide-react';
import { processImage } from '@/components/utils/imageProcessor';
import { TexturePreview3D } from '@/components/texture-preview-3d';

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
  const [authorName, setAuthorName] = useState('');
  const [authorAge, setAuthorAge] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) return;

    setUploading(true);

    const formData = new FormData();

    // Add viewerId, modelId, and author info to the form data
    formData.append('viewerId', viewerId);
    formData.append('modelId', modelId);
    formData.append('authorName', authorName);
    formData.append('authorAge', authorAge);

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
        setResult({
          type: 'success',
          message: data.message || 'Texture uploaded successfully!'
        });
        // Show 3D preview after successful upload
        setShowPreview(true);
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
      {/* Author Information */}
      <div className="space-y-4">
        <div>
          <label htmlFor="authorName" className="block text-sm font-medium text-gray-700 mb-1">
            Your Name *
          </label>
          <input
            type="text"
            id="authorName"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your name"
          />
        </div>
        <div>
          <label htmlFor="authorAge" className="block text-sm font-medium text-gray-700 mb-1">
            Your Age *
          </label>
          <input
            type="number"
            id="authorAge"
            value={authorAge}
            onChange={(e) => setAuthorAge(e.target.value)}
            required
            min="1"
            max="120"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your age"
          />
        </div>
      </div>

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
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-gray-700 mb-1">
            {file ? file.name : 'Choose a photo'}
          </p>
          <p className="text-sm text-gray-500">
            {processing ? 'Processing...' : 'or tap to take a photo'}
          </p>
        </label>
      </div>

      {processing && (
        <div className="rounded-lg p-4 bg-blue-50 border border-blue-200 text-blue-800">
          <p className="text-sm">Processing image with ArUco markers...</p>
        </div>
      )}

      {preview && !processedPreview && (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <p className="text-xs text-gray-500 mb-2 p-2 bg-gray-50">Original Image</p>
          <img
            src={preview}
            alt="Original Preview"
            className="w-full h-auto"
          />
        </div>
      )}

      {processedPreview && (
        <div className="space-y-3">
          <div className="rounded-lg overflow-hidden border border-green-200">
            <p className="text-xs text-green-700 mb-2 p-2 bg-green-50">Processed Texture (ArUco Cropped)</p>
            <img
              src={processedPreview}
              alt="Processed Preview"
              className="w-full h-auto"
            />
          </div>
          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer hover:text-gray-800">Show original image</summary>
            {preview && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                <img
                  src={preview}
                  alt="Original Preview"
                  className="w-full h-auto"
                />
              </div>
            )}
          </details>
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg p-4 flex items-start gap-3 ${
            result.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {result.type === 'success' ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-sm">{result.message}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={!file || !authorName || !authorAge || uploading || processing}
        className="w-full"
        size="lg"
      >
        {uploading ? 'Uploading...' : processing ? 'Processing...' : 'Upload Texture'}
      </Button>

      {/* Preview button after successful upload */}
      {result?.type === 'success' && processedPreview && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowPreview(true)}
          className="w-full"
          size="lg"
        >
          <Eye className="h-5 w-5 mr-2" />
          View 3D Preview & Save Screenshot
        </Button>
      )}

      {/* 3D Preview Dialog */}
      {processedPreview && (
        <TexturePreview3D
          open={showPreview}
          onOpenChange={(open) => {
            setShowPreview(open);
            // Reset form when closing preview
            if (!open) {
              setFile(null);
              setPreview(null);
              setProcessedPreview(null);
              setAuthorName('');
              setAuthorAge('');
              setResult(null);
            }
          }}
          modelUrl={modelUrl}
          textureUrl={processedPreview}
          modelName={modelName}
          authorName={authorName}
          authorAge={authorAge}
        />
      )}
    </form>
  );
}
