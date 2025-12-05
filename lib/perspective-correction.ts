import sharp from 'sharp';
import jsQR, { QRCode } from 'jsqr';

/**
 * Perspective correction using QR code corner detection
 * This function detects the QR code, calculates the transformation needed,
 * and corrects the perspective distortion of the texture
 */

export interface Point {
  x: number;
  y: number;
}

export interface CorrectionResult {
  correctedBuffer: Buffer;
  qrCorners: Point[];
  originalSize: { width: number; height: number };
  correctedSize: { width: number; height: number };
}

/**
 * Detect QR code and extract its corner positions
 */
export async function detectQRCode(imageBuffer: Buffer): Promise<{
  qrCode: QRCode;
  corners: Point[];
} | null> {
  // Process image with sharp
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  
  if (!metadata.width || !metadata.height) {
    return null;
  }

  // Get raw RGBA pixel data
  const { data: rawImageData, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Scan for QR code
  const qrCode = jsQR(
    new Uint8ClampedArray(rawImageData),
    info.width,
    info.height
  );

  if (!qrCode || !qrCode.location) {
    return null;
  }

  // Extract corner positions from QR code location
  const corners: Point[] = [
    { x: qrCode.location.topLeftCorner.x, y: qrCode.location.topLeftCorner.y },
    { x: qrCode.location.topRightCorner.x, y: qrCode.location.topRightCorner.y },
    { x: qrCode.location.bottomRightCorner.x, y: qrCode.location.bottomRightCorner.y },
    { x: qrCode.location.bottomLeftCorner.x, y: qrCode.location.bottomLeftCorner.y }
  ];

  return { qrCode, corners };
}

/**
 * Calculate rotation angle based on QR code orientation
 */
function calculateRotationAngle(corners: Point[]): number {
  // Use top edge of QR code to determine rotation
  const topLeft = corners[0];
  const topRight = corners[1];
  
  const dx = topRight.x - topLeft.x;
  const dy = topRight.y - topLeft.y;
  
  // Calculate angle in degrees
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  // Normalize to 0-360 range
  if (angle < 0) angle += 360;
  
  return angle;
}

/**
 * Apply perspective correction to image based on QR code detection
 */
export async function correctPerspective(
  imageBuffer: Buffer,
  targetSize: { width: number; height: number } = { width: 2048, height: 2048 }
): Promise<CorrectionResult | null> {
  try {
    // Detect QR code
    const detection = await detectQRCode(imageBuffer);
    
    if (!detection) {
      throw new Error('No QR code detected in image');
    }

    const { qrCode, corners } = detection;
    
    // Get original image metadata
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image metadata');
    }

    // Calculate rotation angle
    const rotationAngle = calculateRotationAngle(corners);
    
    // Determine if we need to rotate (if angle is significantly off from 0°, 90°, 180°, 270°)
    let needsRotation = false;
    let rotationDegrees = 0;
    
    if (rotationAngle > 45 && rotationAngle < 135) {
      needsRotation = true;
      rotationDegrees = 90;
    } else if (rotationAngle >= 135 && rotationAngle < 225) {
      needsRotation = true;
      rotationDegrees = 180;
    } else if (rotationAngle >= 225 && rotationAngle < 315) {
      needsRotation = true;
      rotationDegrees = 270;
    }

    // Start with the original image
    let processedImage = sharp(imageBuffer);

    // Apply rotation if needed
    if (needsRotation) {
      processedImage = processedImage.rotate(rotationDegrees);
    }

    // Crop to remove QR code area (assuming QR is in corner)
    // Calculate crop region to exclude QR code
    const qrSize = Math.max(
      corners[1].x - corners[0].x,
      corners[3].y - corners[0].y
    );
    
    const padding = Math.floor(qrSize * 0.2); // Add 20% padding
    
    // Determine which corner has the QR code
    const avgX = corners.reduce((sum, c) => sum + c.x, 0) / 4;
    const avgY = corners.reduce((sum, c) => sum + c.y, 0) / 4;
    
    const isLeft = avgX < metadata.width / 2;
    const isTop = avgY < metadata.height / 2;
    
    // Calculate crop dimensions to remove QR code
    let cropLeft = isLeft ? qrSize + padding : 0;
    let cropTop = isTop ? qrSize + padding : 0;
    let cropWidth = metadata.width - (isLeft ? qrSize + padding : 0);
    let cropHeight = metadata.height - (isTop ? qrSize + padding : 0);

    // Apply cropping
    processedImage = processedImage.extract({
      left: cropLeft,
      top: cropTop,
      width: Math.min(cropWidth, metadata.width - cropLeft),
      height: Math.min(cropHeight, metadata.height - cropTop)
    });

    // Resize to target size
    processedImage = processedImage
      .resize(targetSize.width, targetSize.height, {
        fit: 'cover',
        position: 'center'
      })
      .sharpen();

    // Only apply normalization if there's significant perspective distortion
    // (if rotation was needed, colors might need adjustment)
    if (needsRotation && Math.abs(rotationDegrees - 180) > 10) {
      processedImage = processedImage.modulate({
        brightness: 1.0,
        saturation: 1.0
      });
    }

    // Convert to PNG buffer
    const correctedBuffer = await processedImage.png().toBuffer();
    
    const correctedMetadata = await sharp(correctedBuffer).metadata();

    return {
      correctedBuffer,
      qrCorners: corners,
      originalSize: { width: metadata.width, height: metadata.height },
      correctedSize: { 
        width: correctedMetadata.width || targetSize.width, 
        height: correctedMetadata.height || targetSize.height 
      }
    };

  } catch (error) {
    console.error('Perspective correction error:', error);
    return null;
  }
}

/**
 * Simple perspective correction without QR detection
 * Used as fallback when QR code cannot be detected
 */
export async function simpleCorrection(
  imageBuffer: Buffer,
  targetSize: { width: number; height: number } = { width: 2048, height: 2048 }
): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(targetSize.width, targetSize.height, {
      fit: 'cover',
      position: 'center'
    })
    .sharpen()
    .png()
    .toBuffer();
}
