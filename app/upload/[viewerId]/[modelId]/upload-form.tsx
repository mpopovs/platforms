'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, XCircle, Eye, Camera, RefreshCw } from 'lucide-react';
import { processImage } from '@/components/utils/imageProcessor';
import { QueueStatus } from './queue-status';
import { Survey } from '@/components/survey/survey';
import { CertificateDownloadButton } from './certificate-download-button';
import { CertificateDisplay } from './certificate-display';

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
  modelName,
  viewerLogoUrl,
  certificateBottomImageUrl,
  surveyEnabled = true,
  onPreviewReady,
  show3DPreview = false,
  onUploadStart,
  onQueueStatusChange
}: {
  viewerId: string;
  modelId: string;
  modelUrl: string;
  modelName: string;
  viewerLogoUrl?: string | null;
  certificateBottomImageUrl?: string;
  surveyEnabled?: boolean;
  onPreviewReady?: (textureUrl: string, onApprove: (previewCaptureDataUrl?: string) => void, onCancel: () => void) => void;
  show3DPreview?: boolean;
  onUploadStart?: () => void;
  onQueueStatusChange?: (visible: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [textureId, setTextureId] = useState<string | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [certificatePreviewCapture, setCertificatePreviewCapture] = useState<string | null>(null);
  const [result, setResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleRestart = () => {
    setFile(null);
    setPreview(null);
    setProcessedPreview(null);
    setResult(null);
    setQueueNumber(null);
    setTextureId(null);
    setShowSurvey(false);
    setUploadComplete(false);
    setCertificatePreviewCapture(null);
  };

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
        console.log('File still exists:', !!selectedFile);
        setProcessedPreview(processed.dataUrl);
        setResult({
          type: 'success',
          message: '✅ ArUco markers detected! Texture cropped to 2048x2048 and ready to upload.'
        });
        // Show inline 3D preview via callback
        if (onPreviewReady) {
          // Capture the file and processed data in the closure
          const capturedFile = selectedFile;
          const capturedProcessed = processed.dataUrl;
          onPreviewReady(processed.dataUrl, (previewCaptureDataUrl) => {
            console.log('Approve clicked, file:', capturedFile?.name, 'has cropped:', !!capturedProcessed);
            if (previewCaptureDataUrl) {
              setCertificatePreviewCapture(previewCaptureDataUrl);
            }
            // Call handleSubmit with both the captured file and processed data
            handleSubmit(undefined, capturedFile, capturedProcessed);
          }, () => {
            // Reset form state when cancel is clicked
            setFile(null);
            setPreview(null);
            setProcessedPreview(null);
            setResult(null);
          });
        }
      } else {
        console.log('❌ No ArUco markers detected');
        setResult({
          type: 'error',
          message: '❌ Could not detect ArUco markers. Please ensure all 4 markers (IDs 0-3) are clearly visible in the photo.'
        });
        // Do not allow upload without ArUco detection
        setFile(null);
        setPreview(null);
      }
    } catch (error) {
      console.error('❌ Error processing image:', error);
      setResult({
        type: 'error',
        message: '⚠️ Error processing image. Please try again.'
      });
      // Do not allow upload on error
      setFile(null);
      setPreview(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, fileToUpload?: File, processedDataUrl?: string) => {
    if (e) {
      e.preventDefault();
    }

    const uploadFile = fileToUpload || file;
    const croppedPreview = processedDataUrl || processedPreview;

    if (!uploadFile) {
      console.error('No file to upload');
      return;
    }

    console.log('Starting upload with file:', uploadFile.name, 'has cropped:', !!croppedPreview);

    setUploading(true);

    const formData = new FormData();

    // Add viewerId and modelId to the form data
    formData.append('viewerId', viewerId);
    formData.append('modelId', modelId);

    // If we have a processed image (ArUco cropped), upload both original and cropped
    if (croppedPreview) {
      try {
        console.log('📤 Preparing files for upload...');
        
        // Convert processed texture to WebP format for main texture
        const webpBlob = await convertToWebP(croppedPreview, 0.9);
        const processedFile = new File([webpBlob], `cropped_${uploadFile.name.replace(/\.[^.]+$/, '.webp')}`, { type: 'image/webp' });
        console.log(`✅ Processed texture converted to WebP: ${processedFile.size} bytes`);

        // Upload:
        // 1. Processed/cropped texture as main 'photo' (WebP format)
        // 2. Original uncropped photo as 'originalPhoto' (preserved for later use)
        formData.append('photo', processedFile);
        formData.append('originalPhoto', uploadFile); // Upload original file unmodified
        formData.append('clientProcessed', 'true');
        
        console.log(`✅ Uploading processed texture (${processedFile.size} bytes) + original photo (${uploadFile.size} bytes)`);
      } catch (error) {
        console.error('❌ Error processing images:', error);
        console.log('⚠️ Falling back to original image');
        formData.append('photo', uploadFile);
      }
    } else {
      console.log('📤 Compressing original image (no ArUco processing)');
      try {
        const compressedFile = await compressImage(uploadFile, 2048, 0.85);
        console.log(`✅ Original compressed: ${uploadFile.size} → ${compressedFile.size} bytes (${Math.round((1 - compressedFile.size / uploadFile.size) * 100)}% reduction)`);
        formData.append('photo', compressedFile);
      } catch (error) {
        console.error('❌ Error compressing image:', error);
        formData.append('photo', uploadFile);
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
        setTextureId(data.textureId);
        setResult({
          type: 'success',
          message: data.message || 'Texture uploaded successfully!'
        });
        // Show survey after successful upload if enabled
        if (surveyEnabled) {
          setShowSurvey(true);
        } else {
          // If survey not enabled, mark upload as complete
          setUploadComplete(true);
        }
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

  const hasArUcoError = result?.type === 'error' && !queueNumber;
  const showQueueStatus = Boolean(queueNumber && result?.type === 'success');

  useEffect(() => {
    if (onQueueStatusChange) {
      onQueueStatusChange(showQueueStatus);
    }

    return () => {
      if (onQueueStatusChange) {
        onQueueStatusChange(false);
      }
    };
  }, [showQueueStatus, onQueueStatusChange]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-32">
      {/* Photo button - fixed at bottom when visible */}
      {!processedPreview && !processing && !show3DPreview && !hasArUcoError && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200 shadow-lg">
          <div className="w-full max-w-3xl mx-auto">
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
              className={`w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-xl py-12 flex items-center justify-center cursor-pointer transition-colors shadow-md ${
                processing ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              {processing ? (
                <div className="text-6xl animate-pulse">⏳</div>
              ) : (
                <Camera className="size-32 text-white" strokeWidth={2} />
              )}
            </label>
          </div>
        </div>
      )}

      {processing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
        </div>
      )}

      {/* Show uploading spinner */}
      {uploading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      )}

      {/* Show error messages only */}
      {result && result.type === 'error' && !queueNumber && (
        <>
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-white px-4 pb-28">
            <div className="text-center">
              <div className="text-9xl mb-8 font-light text-gray-800">:(</div>
            </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-white">
            <div className="max-w-2xl mx-auto">
              <Button
                type="button"
                onClick={handleRestart}
                className="w-full bg-blue-500 hover:bg-blue-600 rounded-xl py-12 h-auto"
                size="lg"
              >
                <RefreshCw className="size-32" strokeWidth={2} />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Queue Status after successful upload */}
      {showQueueStatus && (
        <div className="fixed top-16 left-0 right-0 z-40 flex justify-center px-4">
          <QueueStatus queueNumber={queueNumber!} viewerId={viewerId} />
        </div>
      )}

      {/* Survey - shown after successful upload */}
      {showSurvey && textureId && (
        <Survey
          viewerId={viewerId}
          textureId={textureId}
          onComplete={() => {
            setShowSurvey(false);
            setUploadComplete(true);
          }}
        />
      )}

      {/* Restart button after upload completion (survey done or not enabled) */}
      {uploadComplete && queueNumber && !showSurvey && (
        <>
          {/* Certificate Display */}
          <div className="px-4 pt-6 pb-4">
            <CertificateDisplay
              queueNumber={queueNumber}
              modelName={modelName}
              previewCapture={certificatePreviewCapture}
              processedPreview={processedPreview}
              preview={preview}
              viewerLogoUrl={viewerLogoUrl}
            />
          </div>

          {/* PM Story Image */}
          <div className="px-4 pb-4">
            <img 
              src={certificateBottomImageUrl || "/pm-story.svg"} 
              alt="Certificate Bottom Image" 
              className="w-full h-auto"
            />
          </div>

          {/* Buttons */}
          <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200">
            <div className="max-w-2xl mx-auto">
              <div className="grid grid-cols-2 gap-4">
                <CertificateDownloadButton
                  queueNumber={queueNumber}
                  modelName={modelName}
                  previewCapture={certificatePreviewCapture}
                  processedPreview={processedPreview}
                  preview={preview}
                  viewerLogoUrl={viewerLogoUrl}
                />
                <Button
                  type="button"
                  onClick={handleRestart}
                  className="w-full bg-blue-500 hover:bg-blue-600 rounded-xl py-6 h-auto"
                  size="lg"
                >
                  <RefreshCw className="size-16" strokeWidth={2} />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </form>
  );
}
