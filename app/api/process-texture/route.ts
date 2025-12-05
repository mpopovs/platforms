import { NextRequest, NextResponse } from 'next/server';
import { createModelTexture } from '@/lib/viewers';
import { uploadProcessedTexture } from '@/lib/storage';
import { simpleCorrection } from '@/lib/perspective-correction';
import { supabase } from '@/lib/supabase';
// Note: ArUco marker detection and perspective correction now happens client-side using imageProcessor.ts

/**
 * POST /api/process-texture
 * Process uploaded texture with perspective correction
 * This is triggered after texture upload
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { textureId, viewerId, modelId, originalPhotoUrl, authorName, authorAge } = body;

    if (!textureId || !viewerId || !modelId || !originalPhotoUrl) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Download the original photo from storage
    const photoResponse = await fetch(originalPhotoUrl);
    
    if (!photoResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch original photo' },
        { status: 500 }
      );
    }

    const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());

    // Note: ArUco marker detection and perspective correction now happens client-side
    // This server-side endpoint only handles fallback processing for images without ArUco markers
    let correctedBuffer: Buffer;
    let correctionApplied = false;

    // Check if already corrected client-side (indicated by clientProcessed flag)
    const alreadyProcessed = body.clientProcessed === true;

    if (alreadyProcessed) {
      console.log('✅ Image already processed client-side with ArUco markers');
      // Image is already cropped - just use it as-is
      correctedBuffer = photoBuffer;
      correctionApplied = true;
    } else {
      // Fallback to simple correction if client-side processing was skipped
      console.log('⚠️ Using simple correction (no ArUco markers detected client-side)');
      correctedBuffer = await simpleCorrection(photoBuffer);
      correctionApplied = false;
    }

    // Convert to WebP format for better compression
    const sharp = require('sharp');
    const webpBuffer = await sharp(correctedBuffer)
      .webp({ quality: 90 })
      .toBuffer();
    
    console.log(`🗜️ Converted to WebP: ${correctedBuffer.length} → ${webpBuffer.length} bytes (${Math.round((1 - webpBuffer.length / correctedBuffer.length) * 100)}% reduction)`);

    // Upload corrected texture to storage
    const correctedTextureUrl = await uploadProcessedTexture(
      viewerId,
      modelId,
      textureId,
      webpBuffer
    );

    // Save texture record to database
    await createModelTexture(
      textureId,
      modelId,
      originalPhotoUrl,
      correctedTextureUrl,
      authorName,
      authorAge
    );

    console.log(`✅ Texture ${textureId} processed and saved. ArUco cropped: ${correctionApplied}`);

    return NextResponse.json({
      success: true,
      textureId,
      correctedTextureUrl,
      correctionApplied,
      message: correctionApplied
        ? 'Texture processed with ArUco markers successfully'
        : 'Texture processed with fallback correction'
    });

  } catch (error: any) {
    console.error('Error processing texture:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process texture',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
