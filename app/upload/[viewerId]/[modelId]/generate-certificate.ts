async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous'; // Enable CORS to avoid tainted canvas
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });
}

export async function generateCertificate(
  queueNumber: number,
  modelName: string,
  previewCapture?: string | null,
  processedPreview?: string | null,
  preview?: string | null,
  viewerLogoUrl?: string | null
): Promise<string> {
  const sourceImage = previewCapture || processedPreview || preview;
  if (!sourceImage) {
    throw new Error('No preview available for certificate');
  }

  const previewImage = await loadImage(sourceImage);
  
  // Square canvas (1:1 ratio)
  const size = 2000;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create certificate canvas');
  }

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Draw 3D model capture with padding
  const padding = 100;
  const imageSize = size - (padding * 2);
  const scale = Math.min(imageSize / previewImage.width, imageSize / previewImage.height);
  const drawWidth = previewImage.width * scale;
  const drawHeight = previewImage.height * scale;
  const drawX = padding + (imageSize - drawWidth) / 2;
  const drawY = padding + (imageSize - drawHeight) / 2;
  ctx.drawImage(previewImage, drawX, drawY, drawWidth, drawHeight);

  // Top left corner: Order number only (dark grey)
  ctx.fillStyle = '#374151';
  ctx.font = 'bold 120px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const orderText = `#${queueNumber}`;
  const textPadding = 40;
  ctx.fillText(orderText, textPadding, textPadding);

  // Bottom right corner: Date and time (dark grey)
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const dateTime = new Date().toLocaleString();
  ctx.fillText(dateTime, size - textPadding, size - textPadding);

  // Bottom left corner: Viewer logo
  if (viewerLogoUrl) {
    try {
      const logoImage = await loadImage(viewerLogoUrl);
      const maxLogoSize = 200;
      const logoScale = Math.min(maxLogoSize / logoImage.width, maxLogoSize / logoImage.height);
      const logoWidth = logoImage.width * logoScale;
      const logoHeight = logoImage.height * logoScale;
      ctx.drawImage(logoImage, textPadding, size - textPadding - logoHeight, logoWidth, logoHeight);
    } catch (error) {
      console.warn('Failed to load viewer logo:', error);
    }
  }

  return canvas.toDataURL('image/png');
}
