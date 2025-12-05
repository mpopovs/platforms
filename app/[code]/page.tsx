import { getViewerConfigByShortCode, getViewerSession } from '@/lib/viewers';
import { ViewerDisplay } from '@/app/viewer/[viewerId]/viewer-display';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  
  // Only process if it looks like a short code (4 characters, alphanumeric)
  if (!/^[0-9A-Za-z]{4}$/.test(code)) {
    return {
      title: 'Not Found'
    };
  }
  
  const config = await getViewerConfigByShortCode(code);
  
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
 * Short Viewer URL - Primary viewer access point
 * Renders viewer directly at short URL (e.g., claypixels.eu/hHk3)
 */
export default async function ShortViewerPage({ params }: Props) {
  const { code } = await params;
  
  // Only process if it looks like a short code (4 characters, alphanumeric)
  if (!/^[0-9A-Za-z]{4}$/.test(code)) {
    notFound();
  }
  
  // Get viewer config by short code
  const config = await getViewerConfigByShortCode(code);
  
  if (!config) {
    notFound();
  }

  // Check if user has valid session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('viewer_session')?.value;
  
  let isAuthenticated = false;
  if (sessionToken) {
    const session = await getViewerSession(sessionToken);
    if (session && session.viewerId === config.id && session.expiresAt > Date.now()) {
      isAuthenticated = true;
    }
  }

  return <ViewerDisplay viewerId={config.id} config={config} isAuthenticated={isAuthenticated} />;
}
