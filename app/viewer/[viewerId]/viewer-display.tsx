'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, Lock, Loader2 } from 'lucide-react';
import { ModelCarousel } from '@/components/model-carousel';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';
import { createClient } from '@/lib/supabase/client';
import type { ViewerModelWithTexture, ViewerSettings } from '@/lib/types/viewer';
import { cleanOldCache } from '@/lib/texture-cache';

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
  const [currentQueueNumber, setCurrentQueueNumber] = useState<number | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const supabase = createClient();

  // Clean old cached data on viewer startup (prevent quota issues)
  useEffect(() => {
    cleanOldCache(30).catch(err => 
      console.warn('Cache cleanup failed:', err)
    );
  }, []);

  // Fetch current queue number
  useEffect(() => {
    async function fetchCurrentQueue() {
      const { data, error } = await supabase
        .from('texture_queue')
        .select('*')
        .eq('viewer_id', viewerId)
        .eq('status', 'displaying')
        .order('displayed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setCurrentQueueNumber(data.queue_number);
      }
    }

    fetchCurrentQueue();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('viewer-queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'texture_queue',
          filter: `viewer_id=eq.${viewerId}`
        },
        () => {
          fetchCurrentQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewerId]);

  // Fetch models with textures
  useEffect(() => {
    let hasModels = false;

    async function fetchModels() {
      try {
        const response = await fetch(`/api/viewer-models/${viewerId}`);
        
        if (response.ok) {
          const data = await response.json();
          setModels(data.models || []);
          hasModels = (data.models || []).length > 0;
          setError(''); // Clear any previous errors
        } else {
          // Only set error if we don't have models loaded yet
          if (!hasModels) {
            setError('Failed to load 3D models');
          } else {
            console.warn('Failed to fetch model updates, continuing with cached data');
          }
        }
      } catch (err) {
        // Network error - only set error on initial load, not during updates
        if (!hasModels) {
          console.error('Initial load failed:', err);
          setError('Failed to load 3D models');
        }
        // No logging when we already have models - this is expected during offline polling
      } finally {
        setLoading(false);
      }
    }

    fetchModels();

    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      // During polling, we already have models so errors won't break display
      hasModels = true;
      fetchModels();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [viewerId]);

  // Handle online/offline events - refetch data when browser reconnects
  useEffect(() => {
    // Set initial online status
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      console.log('Browser reconnected, refetching data...');
      setIsOnline(true);
      setLoading(true);
      fetch(`/api/viewer-models/${viewerId}`)
        .then(response => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Failed to reload models');
        })
        .then(data => {
          setModels(data.models || []);
          setError('');
          setLoading(false);
        })
        .catch(err => {
          console.error('Error refetching models:', err);
          setError('Failed to reload 3D models');
          setLoading(false);
        });
    };

    const handleOffline = () => {
      console.log('Browser went offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [viewerId]);

  // Handle WebGL context loss and restore
  useEffect(() => {
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.error('WebGL context lost, attempting recovery...');
      setContextLost(true);
      // Reload page after short delay to recover
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    };

    const handleContextRestored = () => {
      console.log('WebGL context restored');
      setContextLost(false);
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);
    }

    // Preventive reload after 12 hours to avoid memory leaks
    const preventiveReload = setTimeout(() => {
      console.log('Preventive reload after 12 hours of operation');
      window.location.reload();
    }, 12 * 60 * 60 * 1000); // 12 hours

    return () => {
      if (canvas) {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      }
      clearTimeout(preventiveReload);
    };
  }, []);

  // Global error handler for unhandled errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error);
      if (event.error?.message?.includes('WebGL') || event.error?.message?.includes('GPU')) {
        console.error('WebGL/GPU error detected, reloading...');
        setTimeout(() => window.location.reload(), 2000);
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (loading || contextLost) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{ background: settings.backgroundColor || '#000000' }}
      >
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-white mx-auto mb-4" />
          {contextLost && (
            <p className="text-white text-sm">Recovering display...</p>
          )}
        </div>
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
      <div className="w-screen h-screen relative overflow-hidden" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
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
        
        {/* Offline Indicator - Bottom Right */}
        {!isOnline && (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
            <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse shadow-lg" />
          </div>
        )}

        {/* Queue Number Display - Bottom Center */}
        {currentQueueNumber && (
          <div className="fixed bottom-0 left-0 right-0 py-6 z-40" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
            <div className="flex items-center justify-center gap-4">
              <span className="text-5xl">🎫</span>
              <span className="text-7xl font-black text-white drop-shadow-2xl">
                #{currentQueueNumber}
              </span>
            </div>
          </div>
        )}
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
