'use client';

import { useIsOnline } from './use-is-online';

export type ConnectionState = 'online' | 'saving' | 'offline';

const COLORS: Record<ConnectionState, string> = {
  online: '#22c55e',
  saving: '#f59e0b',
  offline: '#ef4444',
};

/**
 * Small status dot in the bottom-left corner: green = online and everything
 * saved for offline use, amber = online but still saving content, red =
 * offline (showing saved content). `placement` is 'fixed' on the fullscreen
 * show and 'absolute' inside the curation page's preview box.
 */
export function ConnectionIndicator({
  state,
  title,
  placement = 'fixed',
}: {
  state: ConnectionState;
  title: string;
  placement?: 'fixed' | 'absolute';
}) {
  return (
    <div
      role="status"
      aria-label={title}
      title={title}
      style={{
        position: placement,
        left: 12,
        bottom: 12,
        zIndex: 40,
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: COLORS[state],
        boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.45)',
      }}
    />
  );
}

/** Online/offline-only indicator for the curation page's preview (the preview doesn't save content for offline use). */
export function LiveConnectionIndicator() {
  const online = useIsOnline();
  return (
    <ConnectionIndicator
      state={online ? 'online' : 'offline'}
      title={online ? 'Online' : 'Offline'}
      placement="absolute"
    />
  );
}
