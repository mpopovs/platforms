'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface QueueEntry {
  id: string;
  queue_number: number;
  status: string;
  created_at: string;
  displayed_at: string | null;
}

interface QueueControlProps {
  viewerId: string;
}

export function QueueControl({ viewerId }: QueueControlProps) {
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetchQueue();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('admin-queue-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'texture_queue',
          filter: `viewer_id=eq.${viewerId}`
        },
        () => {
          fetchQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewerId]);

  async function fetchQueue() {
    // Get all queue entries
    const { data: allEntries } = await supabase
      .from('texture_queue')
      .select('*')
      .eq('viewer_id', viewerId)
      .order('queue_number', { ascending: true });

    if (allEntries) {
      setQueueEntries(allEntries);
      
      // Find current displaying
      const current = allEntries.find(e => e.status === 'displaying');
      setCurrentNumber(current?.queue_number || null);
    }
  }

  async function advanceQueue() {
    setLoading(true);
    try {
      const response = await fetch('/api/queue/current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId })
      });

      if (response.ok) {
        await fetchQueue();
      }
    } catch (error) {
      console.error('Error advancing queue:', error);
    } finally {
      setLoading(false);
    }
  }

  async function setAsDisplaying(queueNumber: number) {
    setLoading(true);
    try {
      // Mark current as completed
      await supabase
        .from('texture_queue')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('viewer_id', viewerId)
        .eq('status', 'displaying');

      // Set selected as displaying
      await supabase
        .from('texture_queue')
        .update({ status: 'displaying', displayed_at: new Date().toISOString() })
        .eq('viewer_id', viewerId)
        .eq('queue_number', queueNumber);

      await fetchQueue();
    } catch (error) {
      console.error('Error setting display:', error);
    } finally {
      setLoading(false);
    }
  }

  const waitingEntries = queueEntries.filter(e => e.status === 'waiting');
  const displayingEntry = queueEntries.find(e => e.status === 'displaying');
  const completedEntries = queueEntries.filter(e => e.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Current Display */}
      <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
        <h2 className="text-xl font-bold text-green-900 mb-4">Currently Displaying</h2>
        {displayingEntry ? (
          <div className="flex items-center gap-4">
            <span className="text-6xl">🎫</span>
            <span className="text-7xl font-black text-green-900">
              #{displayingEntry.queue_number}
            </span>
          </div>
        ) : (
          <p className="text-gray-600">No entry currently displaying</p>
        )}
      </div>

      {/* Advance Button */}
      <Button
        onClick={advanceQueue}
        disabled={loading || waitingEntries.length === 0}
        className="w-full text-2xl py-8"
        size="lg"
      >
        {loading ? '⏳' : '⏭️'} Advance to Next
      </Button>

      {/* Waiting Queue */}
      <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6">
        <h2 className="text-xl font-bold text-blue-900 mb-4">
          Waiting in Queue ({waitingEntries.length})
        </h2>
        <div className="space-y-2">
          {waitingEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between bg-white p-4 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎫</span>
                <span className="text-2xl font-bold">#{entry.queue_number}</span>
                <span className="text-sm text-gray-500">
                  {new Date(entry.created_at).toLocaleTimeString()}
                </span>
              </div>
              <Button
                onClick={() => setAsDisplaying(entry.queue_number)}
                disabled={loading}
                variant="outline"
              >
                Display Now
              </Button>
            </div>
          ))}
          {waitingEntries.length === 0 && (
            <p className="text-gray-600 text-center py-4">Queue is empty</p>
          )}
        </div>
      </div>

      {/* Completed */}
      {completedEntries.length > 0 && (
        <details className="bg-gray-50 border border-gray-300 rounded-lg p-6">
          <summary className="text-lg font-semibold cursor-pointer">
            Completed ({completedEntries.length})
          </summary>
          <div className="mt-4 space-y-2">
            {completedEntries.slice(0, 10).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 text-gray-600"
              >
                <span className="text-xl">✅</span>
                <span className="font-semibold">#{entry.queue_number}</span>
                <span className="text-sm">
                  {new Date(entry.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
