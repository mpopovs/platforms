import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { TextureCyclingSettings } from '@/lib/types/viewer';

/**
 * POST /api/update-viewer-settings
 * Update viewer texture cycling settings and widget settings
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { viewerId, textureCycling, rotationSpeed, backgroundColor, showModelName, widgetEnabled, storageMode, enableArucoDetection, defaultModelId } = body as {
      viewerId: string;
      textureCycling: TextureCyclingSettings;
      rotationSpeed?: number;
      backgroundColor?: string;
      showModelName?: boolean;
      widgetEnabled?: boolean;
      storageMode?: 'server' | 'local' | 'hybrid';
      enableArucoDetection?: boolean;
      defaultModelId?: string;
    };

    if (!viewerId) {
      return NextResponse.json(
        { error: 'Viewer ID is required' },
        { status: 400 }
      );
    }

    // Verify viewer ownership
    const { data: viewer, error: fetchError } = await supabase
      .from('viewers')
      .select('user_id, settings')
      .eq('id', viewerId)
      .single();

    if (fetchError || !viewer) {
      return NextResponse.json(
        { error: 'Viewer not found' },
        { status: 404 }
      );
    }

    if (viewer.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Update settings
    const updatedSettings = {
      ...viewer.settings,
      textureCycling,
      rotationSpeed: rotationSpeed ?? viewer.settings?.rotationSpeed ?? 0.5,
      backgroundColor: backgroundColor ?? viewer.settings?.backgroundColor ?? '#000000',
      showModelName: showModelName ?? viewer.settings?.showModelName ?? true,
      widgetEnabled: widgetEnabled ?? viewer.settings?.widgetEnabled ?? false,
      storageMode: storageMode ?? viewer.settings?.storageMode ?? 'hybrid',
      enableArucoDetection: enableArucoDetection ?? viewer.settings?.enableArucoDetection ?? false,
      defaultModelId: defaultModelId ?? viewer.settings?.defaultModelId ?? null
    };

    const { error: updateError } = await supabase
      .from('viewers')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .eq('id', viewerId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully'
    });

  } catch (error: any) {
    console.error('Error updating viewer settings:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update settings',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
