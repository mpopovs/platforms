'use client';

import { useState, useEffect } from 'react';
import { generateCertificate } from './generate-certificate';

interface CertificateDisplayProps {
  queueNumber: number;
  modelName: string;
  previewCapture?: string | null;
  processedPreview?: string | null;
  preview?: string | null;
  viewerLogoUrl?: string | null;
}

export function CertificateDisplay({
  queueNumber,
  modelName,
  previewCapture,
  processedPreview,
  preview,
  viewerLogoUrl
}: CertificateDisplayProps) {
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const generateAndDisplay = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = await generateCertificate(
          queueNumber,
          modelName,
          previewCapture,
          processedPreview,
          preview,
          viewerLogoUrl
        );
        if (mounted) {
          setCertificateUrl(url);
        }
      } catch (err) {
        console.error('Failed to generate certificate:', err);
        if (mounted) {
          setError('Failed to generate certificate');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    generateAndDisplay();

    return () => {
      mounted = false;
    };
  }, [queueNumber, modelName, previewCapture, processedPreview, preview]);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !certificateUrl) {
    return (
      <div className="w-full text-center py-12 text-gray-500">
        <p>{error || 'Unable to generate certificate'}</p>
      </div>
    );
  }

  return (
    <div className="w-full flex items-center justify-center">
      <img
        src={certificateUrl}
        alt="Certificate of Authorship"
        className="max-w-full h-auto shadow-lg rounded-lg"
      />
    </div>
  );
}
