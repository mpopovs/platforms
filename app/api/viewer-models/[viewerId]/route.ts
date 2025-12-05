import { NextRequest, NextResponse } from 'next/server';
import { getViewerModelsWithTextures } from '@/lib/viewers';

/**
 * GET /api/viewer-models/[viewerId]
 * Fetch all models with their latest textures for a viewer
 * Public endpoint (accessed after PIN authentication)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewerId: string }> }
) {
  try {
    const { viewerId } = await params;

    if (!viewerId) {
      return NextResponse.json(
        { error: 'Viewer ID is required' },
        { status: 400 }
      );
    }

    // Fetch models with textures
    const models = await getViewerModelsWithTextures(viewerId);

    return NextResponse.json({
      success: true,
      models,
      count: models.length
    });

  } catch (error: any) {
    console.error('Error fetching viewer models:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch models',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
