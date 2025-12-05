import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// CORS headers for widget access from any domain
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

/**
 * OPTIONS /api/widget/[viewerId]
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, { 
    status: 204,
    headers: corsHeaders 
  });
}

/**
 * GET /api/widget/[viewerId]
 * Public API to fetch viewer config and models for widget embedding
 * Returns viewer info, models, and their textures for client-side display
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewerId: string }> }
) {
  try {
    const { viewerId } = await params;

    const supabase = await createClient();

    // Fetch viewer by ID or short_code
    const { data: viewer, error: viewerError } = await supabase
      .from('viewers')
      .select('*')
      .or(`id.eq.${viewerId},short_code.eq.${viewerId}`)
      .single();

    if (viewerError || !viewer) {
      return NextResponse.json(
        { error: 'Viewer not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Check if widget mode is enabled for this viewer
    const settings = viewer.settings || {};
    if (settings.widgetEnabled === false) {
      return NextResponse.json(
        { error: 'Widget access not enabled for this viewer' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Fetch all models for this viewer
    const { data: models, error: modelsError } = await supabase
      .from('viewer_models')
      .select('*')
      .eq('viewer_id', viewer.id)
      .order('order_index', { ascending: true });

    if (modelsError) {
      return NextResponse.json(
        { error: 'Failed to fetch models' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Fetch all textures for each model
    const modelsWithTextures = await Promise.all(
      (models || []).map(async (model) => {
        const { data: textures } = await supabase
          .from('model_textures')
          .select('*')
          .eq('model_id', model.id)
          .order('uploaded_at', { ascending: false });

        return {
          id: model.id,
          name: model.name,
          model_file_url: model.model_file_url,
          texture_template_url: model.texture_template_url,
          uv_map_url: model.uv_map_url,
          qr_code_data: model.qr_code_data,
          short_code: model.short_code,
          order_index: model.order_index,
          marker_id_base: model.marker_id_base ?? (model.order_index * 4), // Include marker ID base for auto-detection
          textures: textures || []
        };
      })
    );

    // Return viewer config for widget
    const widgetConfig = {
      viewer: {
        id: viewer.id,
        name: viewer.name,
        shortCode: viewer.short_code,
        logoUrl: viewer.logo_url,
        settings: {
          backgroundColor: settings.backgroundColor || '#000000',
          rotationSpeed: settings.rotationSpeed || 0.5,
          showModelName: settings.showModelName !== false, // default true
          displayModes: settings.displayModes,
          textureCycling: settings.textureCycling,
          // Widget-specific settings
          storageMode: settings.storageMode || 'hybrid', // 'server', 'local', 'hybrid'
          enableArucoDetection: settings.enableArucoDetection || false, // Auto-detect model from ArUco markers
          defaultModelId: settings.defaultModelId || null, // Default model to show when no textures
        }
      },
      models: modelsWithTextures,
      // Endpoints for widget to use
      endpoints: {
        upload: `/api/widget/upload`,
        models: `/api/widget/${viewer.id}`,
      }
    };

    return NextResponse.json(widgetConfig, { 
      status: 200,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Widget API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
