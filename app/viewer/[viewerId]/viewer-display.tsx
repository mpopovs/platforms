'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, Lock, Loader2 } from 'lucide-react';
import { ModelCarousel } from '@/components/model-carousel';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';
import type { ViewerModelWithTexture, ViewerSettings } from '@/lib/types/viewer';

type ViewerConfig = {
  id: string;
  name: string;
  logo_url?: string | null;
  settings: ViewerSettings;
  updatedAt: number;
};

type Props = {
  viewerId: string;
  config: ViewerConfig;
  isAuthenticated: boolean;
};

function PinEntryForm({ viewerId, onSuccess }: { viewerId: string; onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/viewer-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ viewerId, pin }),
      });

      const data = await response.json();

      if (response.ok) {
        // Success - reload page to show authenticated content
        window.location.reload();
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f5f5f5' }}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Lock className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Viewer Access</CardTitle>
          <CardDescription>
            Enter your 6-digit PIN to access this viewer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin">PIN Code</Label>
              <Input
                id="pin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="text-center text-2xl tracking-widest"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || pin.length !== 6}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Access Viewer
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ViewerContent({ viewerId, config }: { viewerId: string; config: ViewerConfig }) {
  const { settings } = config;
  const [models, setModels] = useState<ViewerModelWithTexture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch models with textures
  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch(`/api/viewer-models/${viewerId}`);
        
        if (response.ok) {
          const data = await response.json();
          setModels(data.models || []);
        } else {
          setError('Failed to load 3D models');
        }
      } catch (err) {
        console.error('Error fetching models:', err);
        setError('Failed to load 3D models');
      } finally {
        setLoading(false);
      }
    }

    fetchModels();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchModels, 30000);
    return () => clearInterval(interval);
  }, [viewerId]);

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ background: settings.backgroundColor || '#000000' }}
      >
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ background: settings.backgroundColor || '#000000' }}
      >
        <div className="text-white text-center">
          <p className="text-xl">{error}</p>
        </div>
      </div>
    );
  }

  // If models exist, show 3D carousel
  if (models.length > 0) {
    return (
      <div className="w-screen h-screen">
        <ModelCarousel
          models={models}
          rotationSpeed={settings.rotationSpeed || 0.5}
          displayDuration={settings.modelDisplayDuration || 20}
          backgroundColor={settings.backgroundColor || '#000000'}
          displayModes={settings.displayModes}
          textureCycling={settings.textureCycling}
          viewerId={viewerId}
          logoUrl={config.logo_url}
          ambientLightIntensity={settings.ambientLightIntensity}
          directionalLightIntensity={settings.directionalLightIntensity}
        />
      </div>
    );
  }

  // Fallback to text display if no models
  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ 
        background: settings.backgroundColor || '#ffffff',
        color: settings.textColor || '#000000'
      }}
    >
      <div className="max-w-4xl w-full text-center space-y-6">
        <h1 className="text-5xl font-bold leading-tight">
          {settings.displayTitle || config.name}
        </h1>
        
        {settings.displayMessage && (
          <p className="text-2xl leading-relaxed whitespace-pre-wrap">
            {settings.displayMessage}
          </p>
        )}
        
        {settings.customContent && (
          <div 
            className="mt-8 p-8 rounded-lg"
            style={{ background: 'rgba(255, 255, 255, 0.05)' }}
            dangerouslySetInnerHTML={{ __html: settings.customContent }}
          />
        )}
      </div>
      
      <div className="fixed bottom-4 right-4 text-sm opacity-60">
        Last updated: {new Date(config.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}

export function ViewerDisplay({ viewerId, config, isAuthenticated }: Props) {
  if (!isAuthenticated) {
    return <PinEntryForm viewerId={viewerId} onSuccess={() => {}} />;
  }

  return (
    <>
      <ServiceWorkerRegistration />
      <ViewerContent viewerId={viewerId} config={config} />
    </>
  );
}
