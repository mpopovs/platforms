import { NextRequest, NextResponse } from 'next/server';
import { generateQRCodeBuffer } from '@/lib/qr-codes';
import { parseQRCodeData } from '@/lib/qr-codes';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/qr-code/[modelId]
 * Download QR code image for a model
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

    // qr_code_data is now a URL string, not JSON
    const qrCodeUrl = model.qr_code_data;
    if (!qrCodeUrl) {
      return NextResponse.json(
        { error: 'Invalid QR code data' },
        { status: 500 }
      );
    }

    // Generate QR code buffer from URL
    const qrCodeBuffer = await generateQRCodeBuffer(qrCodeUrl, {
      width: 1024, // High resolution
      margin: 2
    });

    // Return PNG image
    return new NextResponse(qrCodeBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="qr-code-${model.name.replace(/[^a-z0-9]/gi, '-')}.png"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('Error generating QR code:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}
