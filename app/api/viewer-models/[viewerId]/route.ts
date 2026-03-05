import { NextRequest, NextResponse } from 'next/server';
import { getViewerModelsWithTextures, getViewerModelsWithTexturesForClassroom, getViewerConfig } from '@/lib/viewers';

/**
 * GET /api/viewer-models/[viewerId]
 * Fetch all models with their latest textures for a viewer.
 * For classroom (child) viewers, fetches the parent's models but
 * filters textures to only those uploaded via this classroom's QR codes.
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

    // Check if this is a classroom (child) viewer
    const config = await getViewerConfig(viewerId);
    let models;

    if (config?.parentViewerId) {
      // Classroom viewer: show parent's models filtered to own uploads
      models = await getViewerModelsWithTexturesForClassroom(viewerId, config.parentViewerId);
    } else {
      // Normal museum viewer: show all textures
      models = await getViewerModelsWithTextures(viewerId);
    }

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
