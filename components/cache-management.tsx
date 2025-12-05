'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Database, Loader2, CheckCircle } from 'lucide-react';
import { getCacheStats, cleanOldCache, clearAllCache } from '@/lib/texture-cache';

export function CacheManagement() {
  const [stats, setStats] = useState<{
    textureCount: number;
    modelCount: number;
    totalSize: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadStats = async () => {
    setLoading(true);
    try {
      const cacheStats = await getCacheStats();
      setStats(cacheStats);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
      setMessage('Failed to load cache statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanOld = async () => {
    setLoading(true);
    setMessage('');
    try {
      await cleanOldCache(7); // Clean items older than 7 days
      setMessage('Successfully cleaned old cache items');
      await loadStats();
    } catch (error) {
      console.error('Failed to clean cache:', error);
      setMessage('Failed to clean cache');
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all cached data? This will require re-downloading all textures and models.')) {
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      await clearAllCache();
      setMessage('Successfully cleared all cache');
      setStats({ textureCount: 0, modelCount: 0, totalSize: 0 });
    } catch (error) {
      console.error('Failed to clear cache:', error);
      setMessage('Failed to clear cache');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Cache Management
        </CardTitle>
        <CardDescription>
          Manage offline texture and model cache for faster loading
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!stats ? (
          <Button onClick={loadStats} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'View Cache Statistics'
            )}
          </Button>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">Textures</p>
                <p className="text-2xl font-bold">{stats.textureCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Models</p>
                <p className="text-2xl font-bold">{stats.modelCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Size</p>
                <p className="text-2xl font-bold">{formatBytes(stats.totalSize)}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleCleanOld}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Clean Old Cache (7+ days)
              </Button>
              
              <Button 
                variant="destructive" 
                onClick={handleClearAll}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Cache
              </Button>
              
              <Button 
                variant="ghost" 
                onClick={loadStats}
                disabled={loading}
              >
                Refresh
              </Button>
            </div>
          </>
        )}

        {message && (
          <div className={`p-3 rounded-md text-sm ${
            message.includes('Successfully') 
              ? 'bg-green-50 text-green-700 flex items-center gap-2' 
              : 'bg-red-50 text-red-700'
          }`}>
            {message.includes('Successfully') && <CheckCircle className="h-4 w-4" />}
            {message}
          </div>
        )}

        <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-md">
          <p className="font-semibold mb-1">ℹ️ About Caching:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Textures and models are cached locally for faster loading</li>
            <li>Cache persists across browser restarts</li>
            <li>Service Worker provides offline access</li>
            <li>Old items are automatically cleaned after 7 days</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
