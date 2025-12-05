import { getViewerConfig, getViewerSession } from '@/lib/viewers';
import { ViewerDisplay } from './viewer-display';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ viewerId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { viewerId } = await params;
  const config = await getViewerConfig(viewerId);
  
  if (!config) {
    return {
      title: 'Viewer Not Found'
    };
  }

  return {
    title: config.settings.displayTitle || config.name,
    description: config.settings.displayMessage || 'Secure viewer display',
  };
}

/**
 * Viewer Page - Displays 3D models with custom textures
 * 
 * Display Behavior:
 * - Shows ONE model at a time in rotation
 * - Models cycle based on texture upload order (earliest texture upload first)
 * - Each model displays for a configurable duration (e.g., 10-30 seconds)
 * - After timeout, automatically transitions to next model in queue
 * - Cycle repeats continuously: Model 1 → Model 2 → Model 3 → Model 1...
 * - Each model rotates slowly on its Y-axis while displayed
 * 
 * Model Selection Priority:
 * 1. Sort all models by their latest texture upload timestamp
 * 2. Models with newly uploaded textures appear first in rotation
 * 3. Models without textures display with default texture template
 * 4. If no textures exist for any model, cycle through all models with defaults
 * 
 * Real-time Updates:
 * - When new texture is uploaded via QR code scan
 * - That model's position in rotation queue updates based on upload time
 * - Currently displayed model finishes its duration before switching
 * - WebSocket or polling keeps texture data synchronized
 */
export default async function ViewerPage({ params }: Props) {
  const { viewerId } = await params;
  
  // Get viewer config
  const config = await getViewerConfig(viewerId);
  
  if (!config) {
    notFound();
  }

  // Check if user has valid session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('viewer_session')?.value;
  
  let isAuthenticated = false;
  if (sessionToken) {
    const session = await getViewerSession(sessionToken);
    if (session && session.viewerId === viewerId && session.expiresAt > Date.now()) {
      isAuthenticated = true;
    }
  }

  return <ViewerDisplay viewerId={viewerId} config={config} isAuthenticated={isAuthenticated} />;
}
