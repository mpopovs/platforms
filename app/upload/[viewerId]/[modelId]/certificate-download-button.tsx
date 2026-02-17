'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { generateCertificate } from './generate-certificate';

interface CertificateDownloadButtonProps {
  queueNumber: number;
  modelName: string;
  previewCapture?: string | null;
  processedPreview?: string | null;
  preview?: string | null;
  viewerLogoUrl?: string | null;
}

export function CertificateDownloadButton({
  queueNumber,
  modelName,
  previewCapture,
  processedPreview,
  preview,
  viewerLogoUrl
}: CertificateDownloadButtonProps) {
  const [generatingCertificate, setGeneratingCertificate] = useState(false);

  const handleDownloadCertificate = async () => {
    setGeneratingCertificate(true);
    try {
      const dataUrl = await generateCertificate(
        queueNumber,
        modelName,
        previewCapture,
        processedPreview,
        preview,
        viewerLogoUrl
      );
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `certificate-order-${queueNumber}.png`;
      link.click();
    } catch (error) {
      console.error('Failed to generate certificate:', error);
    } finally {
      setGeneratingCertificate(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleDownloadCertificate}
      className="w-full bg-blue-500 hover:bg-blue-600 rounded-xl py-6 h-auto"
      size="lg"
      disabled={generatingCertificate}
    >
      <Download className="size-16" strokeWidth={2} />
    </Button>
  );
}
