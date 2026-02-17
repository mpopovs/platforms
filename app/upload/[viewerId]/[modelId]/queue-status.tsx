'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Clock } from 'lucide-react';

interface QueueStatusProps {
  queueNumber: number;
  viewerId: string;
}

interface QueueTimingSettings {
  displayDuration: number;
  textureCyclingEnabled: boolean;
  priorityTimeWindowHours: number;
  priorityRepeatCount: number;
}

interface QueueEntry {
  queue_number: number;
  status: 'waiting' | 'displaying';
  created_at?: string;
}

function isUploadedToday(timestamp?: string): boolean {
  if (!timestamp) return false;

  const uploadDate = new Date(timestamp);
  const now = new Date();

  return (
    uploadDate.getFullYear() === now.getFullYear() &&
    uploadDate.getMonth() === now.getMonth() &&
    uploadDate.getDate() === now.getDate()
  );
}

export function QueueStatus({ queueNumber, viewerId }: QueueStatusProps) {
  const [position, setPosition] = useState<number | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<number | null>(null);
  const [timingSettings, setTimingSettings] = useState<QueueTimingSettings>({
    displayDuration: 5,
    textureCyclingEnabled: true,
    priorityTimeWindowHours: 2,
    priorityRepeatCount: 6
  });
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
        const textureCycling = settings.textureCycling || {};

        const displayDuration = textureCycling.standardDisplayDuration ??
          settings.displayModes?.standardMode?.duration ??
          5;

        setTimingSettings({
          displayDuration,
          textureCyclingEnabled: textureCycling.enabled ?? true,
          priorityTimeWindowHours: textureCycling.priorityTimeWindow ?? 2,
          priorityRepeatCount: textureCycling.priorityRepeatCount ?? 6
        });
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
  }, [queueNumber, viewerId, timingSettings]);

  async function fetchQueuePosition() {
    const { data, error } = await supabase
      .from('texture_queue')
      .select('*')
      .eq('viewer_id', viewerId)
      .in('status', ['waiting', 'displaying'])
      .order('queue_number', { ascending: true });

    if (error || !data) return;

    const queueEntries = data as QueueEntry[];

    // Ensure type-safe comparison (convert both to numbers)
    const myQueueNumber = Number(queueNumber);
    const myIndex = queueEntries.findIndex(item => Number(item.queue_number) === myQueueNumber);
    if (myIndex === -1) {
      // Not found or already completed
      setPosition(0);
      setEstimatedWait(0);
      return;
    }

    // Position in queue (1-based)
    const pos = myIndex + 1;
    setPosition(pos);

    // Estimated wait using viewer texture cycling settings
    const entriesAhead = queueEntries.slice(0, myIndex);

    const weightedSlotsAhead = entriesAhead.reduce((total, entry) => {
      if (!timingSettings.textureCyclingEnabled) {
        return total + 1;
      }

      // Priority is applied to works uploaded today
      const isPriority = isUploadedToday(entry.created_at);
      const repeatCount = Math.max(1, timingSettings.priorityRepeatCount);

      // Use a conservative multiplier to avoid overestimating queue time
      // while still reflecting priority repeat behavior.
      const estimatedPrioritySlots = 1 + (repeatCount - 1) * 0.3;

      return total + (isPriority ? estimatedPrioritySlots : 1);
    }, 0);

    const wait = Math.ceil(weightedSlotsAhead * timingSettings.displayDuration);
    setEstimatedWait(wait);
  }

  if (position === null) {
    return (
      <div className="text-3xl animate-pulse text-center">⏳</div>
    );
  }

  if (position === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-6 text-center">
      <div className="flex items-center gap-3">
        <Users className="size-10 text-gray-800" />
        <div className="text-3xl font-bold text-gray-800">
          {position}
        </div>
      </div>
      {estimatedWait !== null && estimatedWait > 0 && (
        <div className="flex items-center gap-2">
          <Clock className="size-8 text-gray-800" />
          <div className="text-2xl font-semibold text-gray-800">
            {/* {estimatedWait >= 60 
              ? `${Math.ceil(estimatedWait / 60)}min.` 
              : `${estimatedWait}s`} */}
              ~30 sec.
          </div>
        </div>
      )}
    </div>
  );
}
