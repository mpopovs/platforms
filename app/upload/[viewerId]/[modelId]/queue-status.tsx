'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface QueueStatusProps {
  queueNumber: number;
  viewerId: string;
}

export function QueueStatus({ queueNumber, viewerId }: QueueStatusProps) {
  const [position, setPosition] = useState<number | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<number | null>(null);
  const [displayDuration, setDisplayDuration] = useState<number>(5); // Default 5 seconds
  const supabase = createClient();

  // Fetch viewer settings to get actual display duration
  useEffect(() => {
    async function fetchViewerSettings() {
      const { data, error } = await supabase
        .from('viewers')
        .select('settings')
        .eq('id', viewerId)
        .single();

      if (!error && data?.settings) {
        const settings = data.settings as any;
        // Use textureCycling.standardDisplayDuration if available, fallback to 5 seconds
        const duration = settings.textureCycling?.standardDisplayDuration || 
                        settings.displayModes?.standardMode?.duration || 
                        5;
        setDisplayDuration(duration);
      }
    }

    fetchViewerSettings();
  }, [viewerId]);

  useEffect(() => {
    // Initial fetch
    fetchQueuePosition();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'texture_queue',
          filter: `viewer_id=eq.${viewerId}`
        },
        () => {
          fetchQueuePosition();
        }
      )
      .subscribe();

    // Poll every 5 seconds as backup
    const interval = setInterval(fetchQueuePosition, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [queueNumber, viewerId, displayDuration]);

  async function fetchQueuePosition() {
    const { data, error } = await supabase
      .from('texture_queue')
      .select('*')
      .eq('viewer_id', viewerId)
      .in('status', ['waiting', 'displaying'])
      .order('queue_number', { ascending: true });

    if (error || !data) return;

    const myIndex = data.findIndex(item => item.queue_number === queueNumber);
    if (myIndex === -1) {
      // Not found or already completed
      setPosition(0);
      setEstimatedWait(0);
      return;
    }

    // Position in queue (1-based)
    const pos = myIndex + 1;
    setPosition(pos);

    // Estimated wait: actual display duration per texture ahead
    // Note: this is a simplified calculation that doesn't account for priority texture repeats
    const wait = pos > 1 ? (pos - 1) * displayDuration : 0;
    setEstimatedWait(wait);
  }

  if (position === null) {
    return (
      <div className="text-3xl animate-pulse">⏳</div>
    );
  }

  if (position === 0) {
    return (
      <div>
        <div className="text-5xl mb-2">🎉</div>
        <div className="text-xl text-purple-700">Displayed!</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <div className="text-4xl">Rindā</div>
        <div className="text-3xl font-bold text-purple-800">
          #{position}
        </div>
      </div>
      {estimatedWait !== null && estimatedWait > 0 && (
        <div className="flex items-center justify-center gap-2">
          <div className="text-3xl">Gaidīšanas laiks</div>
          <div className="text-2xl font-semibold text-purple-700">
            {estimatedWait >= 60 
              ? `${Math.ceil(estimatedWait / 60)}m` 
              : `${estimatedWait}s`}
          </div>
        </div>
      )}
    </div>
  );
}
