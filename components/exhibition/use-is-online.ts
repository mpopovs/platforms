'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getIsOnline, startConnectivityMonitor, subscribeConnectivity } from '@/lib/connectivity-monitor';

/** Live online/offline state from the shared connectivity monitor (started on first use). */
export function useIsOnline(): boolean {
  useEffect(() => {
    startConnectivityMonitor();
  }, []);
  return useSyncExternalStore(subscribeConnectivity, getIsOnline, () => true);
}
