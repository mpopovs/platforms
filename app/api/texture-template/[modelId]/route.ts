import { NextRequest, NextResponse } from 'next/server';
import { generateQRCodeImage, generateTextureTemplate, generateWorksheetFromLayout } from '@/lib/qr-codes';
import { parseQRCodeData } from '@/lib/qr-codes';
import { createClient } from '@/lib/supabase/server';
import type { WorksheetLayout } from '@/lib/types/viewer';

/**
 * GET /api/texture-template/[modelId]
 * Download printable texture template with QR code
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;

    // Create authenticated Supabase client
    const supabase = await createClient();
    
    // Get model
    const { data: model, error: modelError } = await supabase
      .from('viewer_models')
      .select('*')
      .eq('id', modelId)
      .single();
    
    if (modelError || !model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    // Get viewer
    const { data: viewer, error: viewerError } = await supabase
      .from('viewers')
      .select('*')
      .eq('id', model.viewer_id)
      .single();
    
    if (viewerError || !viewer) {
      return NextResponse.json(
        { error: 'Viewer not found' },
        { status: 404 }
      );
    }

    // qr_code_data is now a URL string, not JSON
    const qrCodeUrl = model.qr_code_data;
    if (!qrCodeUrl) {
      return NextResponse.json(
        { error: 'Invalid QR code data' },
        { status: 500 }
      );
    }

    // Generate QR code image as data URL
    const qrCodeDataUrl = await generateQRCodeImage(qrCodeUrl, {
      width: 512,
      margin: 2
    });

    // Use custom worksheet layout if the viewer has one configured
    const worksheetLayout: WorksheetLayout | null = viewer.settings?.worksheetLayout ?? null;

    const htmlContent = worksheetLayout
      ? generateWorksheetFromLayout(
          worksheetLayout,
          qrCodeDataUrl,
          model.uv_map_url,
          model.name,
          viewer.name,
          qrCodeUrl,
          model.marker_id_base ?? 0,
          undefined, // lang — use layout default
          model.id,  // modelId — for per-model content resolution
        )
      : generateTextureTemplate(
          qrCodeDataUrl,
          model.name,
          viewer.name,
          model.uv_map_url,
          qrCodeUrl,
          model.marker_id_base ?? 0
        );

    // Return HTML
    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="texture-template-${model.name.replace(/[^a-z0-9]/gi, '-')}.html"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating texture template:', error);
    return NextResponse.json(
      { error: 'Failed to generate template' },
      { status: 500 }
    );
  }
}
