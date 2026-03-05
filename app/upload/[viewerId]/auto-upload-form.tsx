'use client';

import { useState, useEffect } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { processImage } from '@/components/utils/imageProcessor';
import { CertificateDisplay } from './[modelId]/certificate-display';
import { CertificateDownloadButton } from './[modelId]/certificate-download-button';
import { Survey } from '@/components/survey/survey';
import type { SupportedLanguage } from '@/components/survey/locales';

/** Slim model descriptor passed from the server component */
export interface UploadModelInfo {
  id: string;
  name: string;
  model_file_url: string;
  marker_id_base: number | null;
}

// ─── Helpers (mirrors upload-form.tsx) ──────────────────────────────────────

async function compressImage(file: File, maxWidth = 2048, quality = 0.85): Promise<File> {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' as ImageOrientation });
      let w = bitmap.width;
      let h = bitmap.height;
      if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })) : reject(new Error('compress failed')),
          'image/jpeg', quality
        );
      });
    } catch { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => blob ? resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })) : reject(new Error('compress failed')),
          'image/jpeg', quality
        );
      };
      img.onerror = () => reject(new Error('load failed'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function supportsWebP(): boolean {
  try {
    const c = document.createElement('canvas'); c.width = 1; c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { return false; }
}

async function convertToOptimalFormat(dataUrl: string, quality = 0.9, maxBytes = 1_048_576): Promise<Blob> {
  const mimeType = supportsWebP() ? 'image/webp' : 'image/jpeg';
  const encode = (q: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('convert failed')),
          mimeType, q
        );
      };
      img.onerror = () => reject(new Error('load failed'));
      img.src = dataUrl;
    });

  let blob = await encode(quality);
  let q = quality;
  while (blob.size > maxBytes && q > 0.3) {
    q = Math.max(+(q - 0.1).toFixed(1), 0.3);
    blob = await encode(q);
  }
  return blob;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface AutoUploadFormProps {
  viewerId: string;
  viewerName: string;
  viewerLogoUrl?: string | null;
  models: UploadModelInfo[];
  surveyEnabled?: boolean;
  surveyLanguage?: string;
  certificateBottomImageUrl?: string;
}

type Phase =
  | 'idle'       // waiting for photo
  | 'processing' // ArUco detection in progress
  | 'uploading'  // sending to server
  | 'survey'     // survey shown, upload running in bg
  | 'done'       // upload complete, show certificate
  | 'error';     // detection or upload failed

export function AutoUploadForm({
  viewerId,
  viewerName,
  viewerLogoUrl,
  models,
  surveyEnabled = true,
  surveyLanguage,
  certificateBottomImageUrl,
}: AutoUploadFormProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Per-scan state
  const [detectedModel, setDetectedModel] = useState<UploadModelInfo | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);

  // Upload result
  const [textureId, setTextureId] = useState<string | null>(null);
  const [textureIdPromise, setTextureIdPromise] = useState<Promise<string> | null>(null);
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [certificatePreviewCapture] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);

  // Summary across all scans in this session
  const [uploadedModels, setUploadedModels] = useState<string[]>([]);

  useEffect(() => {
    // Preload OpenCV.js if not already present
    if (!document.querySelector('script[src="/opencv/opencv.js"]')) {
      const s = document.createElement('script');
      s.src = '/opencv/opencv.js'; s.async = true; s.id = 'opencv-script';
      document.head.appendChild(s);
    }
  }, []);

  /** Perform the actual HTTP upload; returns textureId + queueNumber */
  const doUpload = async (
    rawFile: File,
    croppedDataUrl: string,
    modelId: string
  ): Promise<{ textureId: string; queueNumber: number }> => {
    const optimizedBlob = await convertToOptimalFormat(croppedDataUrl);
    const ext = optimizedBlob.type === 'image/webp' ? '.webp' : '.jpg';
    const processedFile = new File(
      [optimizedBlob],
      `cropped_${rawFile.name.replace(/\.[^.]+$/, ext)}`,
      { type: optimizedBlob.type }
    );
    const compressedOriginal = await compressImage(rawFile, 1536, 0.75);

    const form = new FormData();
    form.append('viewerId', viewerId);
    form.append('modelId', modelId);
    form.append('photo', processedFile);
    form.append('originalPhoto', compressedOriginal);
    form.append('clientProcessed', 'true');

    const res = await fetch('/api/upload-texture', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error + (data.hint ? '. ' + data.hint : ''));
    return { textureId: data.textureId, queueNumber: data.queueNumber };
  };

  const handleRestart = () => {
    setPhase('idle');
    setErrorMsg('');
    setDetectedModel(null);
    setPreview(null);
    setProcessedPreview(null);
    setTextureId(null);
    setTextureIdPromise(null);
    setQueueNumber(null);
    setUploadComplete(false);
    setShowSurvey(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    // Show original preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(rawFile);

    setPhase('processing');
    setErrorMsg('');
    setDetectedModel(null);
    setProcessedPreview(null);

    try {
      const result = await processImage(rawFile, { targetSize: 2048, enableQRDetection: true });

      if (!result) {
        setPhase('error');
        setErrorMsg('❌ Could not detect ArUco markers. Make sure all 4 corners of the worksheet are clearly visible.');
        return;
      }

      const base = result.detectedMarkerBase;
      if (base === undefined) {
        setPhase('error');
        setErrorMsg('❌ Markers detected but could not identify a complete group of 4.');
        return;
      }

      // Find matching model
      const matched = models.find(
        (m) => m.marker_id_base !== null && m.marker_id_base === base
      );

      if (!matched) {
        setPhase('error');
        setErrorMsg(
          `❌ Worksheet markers (IDs ${base}–${base + 3}) don't match any model in this viewer. Are you using the correct worksheets?`
        );
        return;
      }

      setDetectedModel(matched);
      setProcessedPreview(result.dataUrl);

      // Upload (with optional survey)
      if (surveyEnabled) {
        let resolveId!: (id: string) => void;
        const promise = new Promise<string>((r) => { resolveId = r; });
        setTextureIdPromise(promise);
        setPhase('survey');
        setShowSurvey(true);

        doUpload(rawFile, result.dataUrl, matched.id)
          .then(({ textureId: tid, queueNumber: qn }) => {
            setTextureId(tid);
            setQueueNumber(qn);
            resolveId(tid);
          })
          .catch((err: Error) => {
            setPhase('error');
            setErrorMsg(err.message);
            resolveId('');
          });
      } else {
        setPhase('uploading');
        try {
          const { textureId: tid, queueNumber: qn } = await doUpload(rawFile, result.dataUrl, matched.id);
          setTextureId(tid);
          setQueueNumber(qn);
          setUploadedModels((prev) => [...prev, matched.name]);
          setUploadComplete(true);
          setPhase('done');
        } catch (err: any) {
          setPhase('error');
          setErrorMsg(err.message || 'Upload failed. Please try again.');
        }
      }
    } catch (err: any) {
      console.error('processImage error:', err);
      setPhase('error');
      setErrorMsg('⚠️ Error processing image. Please try again.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const isIdle = phase === 'idle';
  const isProcessing = phase === 'processing';
  const isUploading = phase === 'uploading';
  const isError = phase === 'error';
  const isDone = phase === 'done';
  const isSurvey = phase === 'survey';

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* ── Spinner overlays ── */}
      {(isProcessing || isUploading) && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
        </div>
      )}

      {/* ── Error view ── */}
      {isError && (
        <>
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-white px-4 pb-28">
            <div className="text-center">
              <div className="text-9xl mb-8 font-light text-gray-800">:(</div>
              <div className="text-lg text-gray-600 max-w-md mx-auto">{errorMsg}</div>
            </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-white">
            <div className="max-w-2xl mx-auto">
              <Button
                type="button"
                onClick={handleRestart}
                className="w-full bg-blue-500 hover:bg-blue-600 rounded-xl py-12 h-auto"
              >
                <RefreshCw className="size-32" strokeWidth={2} />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Survey ── */}
      {isSurvey && (textureId || textureIdPromise) && (
        <Survey
          viewerId={viewerId}
          textureId={textureId ?? undefined}
          textureIdPromise={textureIdPromise ?? undefined}
          language={surveyLanguage as SupportedLanguage}
          onComplete={() => {
            setShowSurvey(false);
            setUploadComplete(true);
            setPhase('done');
            if (detectedModel) setUploadedModels((prev) => [...prev, detectedModel.name]);
          }}
        />
      )}

      {/* ── Done / certificate ── */}
      {isDone && queueNumber && detectedModel && (
        <>
          <div className="px-4 pt-6 pb-4">
            <CertificateDisplay
              queueNumber={queueNumber}
              modelName={detectedModel.name}
              previewCapture={certificatePreviewCapture}
              processedPreview={processedPreview}
              preview={preview}
              viewerLogoUrl={viewerLogoUrl}
            />
          </div>

          {certificateBottomImageUrl && (
            <div className="px-4 pb-4">
              <img src={certificateBottomImageUrl} alt="" className="w-full h-auto" />
            </div>
          )}

          {/* Session summary */}
          {uploadedModels.length > 0 && (
            <div className="px-4 pb-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <div className="font-semibold mb-1">Uploaded this session ({uploadedModels.length}):</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {uploadedModels.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
                {uploadedModels.length < models.length && (
                  <div className="mt-2 text-green-700">
                    {models.length - uploadedModels.length} worksheet(s) remaining.
                  </div>
                )}
                {uploadedModels.length >= models.length && (
                  <div className="mt-2 font-semibold">🎉 All worksheets uploaded!</div>
                )}
              </div>
            </div>
          )}

          <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200">
            <div className="max-w-2xl mx-auto grid grid-cols-2 gap-4">
              <CertificateDownloadButton
                queueNumber={queueNumber}
                modelName={detectedModel.name}
                previewCapture={certificatePreviewCapture}
                processedPreview={processedPreview}
                preview={preview}
                viewerLogoUrl={viewerLogoUrl}
              />
              <Button
                type="button"
                onClick={handleRestart}
                className="w-full bg-blue-500 hover:bg-blue-600 rounded-xl py-6 h-auto"
              >
                <Camera className="size-16" strokeWidth={2} />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Camera button (idle) ── */}
      {isIdle && (
        <>
          {/* Header with viewer name */}
          <div className="px-4 pt-8 pb-4 text-center">
            <h1 className="text-2xl font-semibold text-gray-800">{viewerName}</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Take a photo of any worksheet — the model is detected automatically.
            </p>
            {uploadedModels.length > 0 && (
              <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 inline-block">
                ✔ {uploadedModels.length} / {models.length} uploaded
              </div>
            )}
          </div>

          <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200 shadow-lg">
            <div className="w-full max-w-3xl mx-auto">
              <input
                type="file"
                id="auto-photo"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="auto-photo"
                className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-xl py-12 flex items-center justify-center cursor-pointer transition-colors shadow-md"
              >
                <Camera className="size-32 text-white" strokeWidth={2} />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
