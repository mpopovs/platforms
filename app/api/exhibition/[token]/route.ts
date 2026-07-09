import { NextRequest, NextResponse } from 'next/server';
import { getExhibitionConfigByToken } from '@/lib/exhibition';

/**
 * GET /api/exhibition/[token]
 * Public, unauthenticated endpoint for the fullscreen /exhibition show route
 * running on the gallery/show computer — possession of the long, unguessable
 * access token IS the authorization (no Supabase login required there).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }

    const config = await getExhibitionConfigByToken(token);

    if (!config) {
      return NextResponse.json({ error: 'Exhibition not found' }, { status: 404 });
    }

    // Never echo the token back — the caller already has it, and this
    // response may end up logged/cached on the show machine.
    const { accessToken, userId, ...publicConfig } = config;

    return NextResponse.json({ success: true, config: publicConfig });
  } catch (error: any) {
    console.error('Error fetching exhibition config by token:', error);
    return NextResponse.json({ error: 'Failed to fetch exhibition config' }, { status: 500 });
  }
}
