import { NextRequest, NextResponse } from 'next/server';
import { getViewerModelsWithAllTextures, getViewerModelsWithAllTexturesForClassroom, getViewerConfig } from '@/lib/viewers';

/**
 * GET /api/viewer-models-all-textures/[viewerId]
 * Fetch all models with ALL their textures for a viewer
 * Used for texture cycling display mode
 * Public endpoint (accessed after PIN authentication)
 * For classroom (child) viewers, fetches parent's models but filters textures
 * to only those uploaded via this classroom viewer.
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
      // Classroom viewer: use parent's models, filter textures to this classroom
      models = await getViewerModelsWithAllTexturesForClassroom(viewerId, config.parentViewerId);
    } else {
      // Normal viewer: fetch all textures for all models
      models = await getViewerModelsWithAllTextures(viewerId);
    }

    return NextResponse.json({
      success: true,
      models,
      count: models.length,
      totalTextures: models.reduce((sum, m) => sum + m.textures.length, 0)
    });

  } catch (error: any) {
    console.error('Error fetching viewer models with all textures:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch models',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
