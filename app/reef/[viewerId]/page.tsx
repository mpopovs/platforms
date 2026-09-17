import { getViewerConfig, getViewerSession } from '@/lib/viewers';
import { ReefDisplay } from './reef-display';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import type { ViewerSettings } from '@/lib/types/viewer';

type Props = {
  params: Promise<{ viewerId: string }>;
  searchParams: Promise<{ demo?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { viewerId } = await params;
  if (viewerId === 'demo') return { title: 'Living Reef (Demo)' };
  const config = await getViewerConfig(viewerId);
  if (!config) return { title: 'Reef Not Found' };
  return {
    title: `${config.settings.displayTitle || config.name} — Living Reef`,
    description: 'An underwater reef that comes alive as children color its creatures.',
  };
}

/**
 * Living Reef viewer — a fullscreen underwater scene where every child's colored
 * creature swims in alive and the reef heals with recent coloring activity.
 *
 * Reuses the standard viewer's PIN auth and the all-textures data feed.
 * `/reef/demo` (or `?demo=1`) runs a self-contained demo with placeholder
 * creatures — no login or database required.
 */
export default async function ReefPage({ params, searchParams }: Props) {
  const { viewerId } = await params;
  const { demo } = await searchParams;

  const isDemo = viewerId === 'demo' || demo === '1';

  if (isDemo) {
    const stubSettings = {} as ViewerSettings;
    return (
      <ReefDisplay
        viewerId={viewerId}
        config={{ id: viewerId, name: 'Living Reef (Demo)', settings: stubSettings, updatedAt: Date.now() }}
        isAuthenticated
        demo
      />
    );
  }

  const config = await getViewerConfig(viewerId);
  if (!config) notFound();

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('viewer_session')?.value;

  let isAuthenticated = false;
  if (sessionToken) {
    const session = await getViewerSession(sessionToken);
    if (session && session.viewerId === viewerId && session.expiresAt > Date.now()) {
      isAuthenticated = true;
    }
  }

  return (
    <ReefDisplay
      viewerId={viewerId}
      config={{
        id: config.id,
        name: config.name,
        logo_url: config.logo_url,
        parentViewerId: config.parentViewerId,
        settings: config.settings,
        updatedAt: config.updatedAt,
      }}
      isAuthenticated={isAuthenticated}
    />
  );
}
