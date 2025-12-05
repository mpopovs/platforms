import QRCode from 'qrcode';
import { generateModelId, type QRCodeData } from './types/viewer';

// ArUco ARUCO_6X6_1000 dictionary
// Format: Each marker is encoded as an array of bytes
// The bytes represent a 6x6 bit pattern (36 bits total = 5 bytes)
// This matches the OpenCV ArUco dictionary format exactly
// Source: https://github.com/opencv/opencv_contrib/blob/4.x/modules/aruco/src/predefined_dictionaries.hpp

// Extended dictionary to support more models (0-99 for up to 25 models)
// Each model uses 4 consecutive marker IDs
// Values from official OpenCV ARUCO_6X6_1000 / DICT_6X6_1000 dictionary
const ARUCO_6X6_1000_DICT: { [key: number]: number[] } = {
  0: [30, 61, 216, 42, 6],
  1: [14, 251, 163, 137, 1],
  2: [21, 144, 126, 172, 13],
  3: [201, 27, 48, 105, 14],
  4: [214, 7, 214, 225, 5],
  5: [216, 232, 224, 230, 8],
  6: [66, 104, 180, 31, 5],
  7: [136, 165, 15, 41, 10],
  8: [48, 125, 82, 79, 13],
  9: [60, 47, 52, 179, 12],
  10: [69, 223, 199, 78, 3],
  11: [72, 216, 91, 37, 7],
  12: [113, 5, 88, 252, 6],
  13: [134, 220, 250, 208, 7],
  14: [141, 114, 169, 63, 6],
  15: [162, 184, 157, 205, 14],
  16: [9, 253, 30, 156, 4],
  17: [21, 77, 189, 24, 15],
  18: [48, 10, 49, 14, 2],
  19: [72, 7, 239, 175, 13],
  20: [86, 223, 17, 219, 6],
  21: [102, 136, 50, 116, 12],
  22: [118, 232, 203, 120, 1],
  23: [154, 83, 217, 207, 3],
  // Markers 24+ from official OpenCV DICT_6X6_1000
  24: [169, 203, 132, 2, 4],
  25: [198, 117, 73, 73, 0],
  26: [193, 210, 136, 148, 1],
  27: [231, 72, 8, 82, 11],
  28: [234, 47, 202, 132, 8],
  29: [233, 99, 183, 123, 1],
  30: [250, 54, 101, 42, 15],
  31: [6, 91, 255, 123, 13],
  32: [5, 65, 215, 45, 6],
  33: [12, 247, 36, 106, 2],
  34: [19, 56, 163, 158, 11],
  35: [21, 168, 147, 231, 4],
  36: [58, 65, 126, 233, 14],
  37: [79, 17, 226, 108, 0],
  38: [83, 13, 182, 210, 0],
  39: [88, 155, 250, 227, 4],
  40: [100, 9, 232, 160, 11],
  41: [96, 83, 122, 137, 1],
  42: [97, 89, 6, 155, 10],
  43: [107, 255, 120, 215, 11],
  44: [112, 173, 150, 164, 15],
  45: [117, 132, 111, 113, 10],
  46: [122, 149, 25, 47, 12],
  47: [134, 9, 118, 10, 10],
  48: [138, 45, 68, 195, 15],
  49: [147, 235, 120, 177, 4],
  50: [152, 141, 168, 77, 4],
  51: [158, 222, 43, 60, 8],
  52: [165, 41, 224, 123, 8],
  53: [181, 147, 184, 85, 15],
  54: [183, 248, 228, 38, 15],
  55: [188, 32, 82, 37, 14],
  56: [192, 68, 135, 118, 5],
  57: [196, 195, 36, 37, 9],
  58: [197, 169, 27, 216, 13],
  59: [206, 115, 230, 178, 12],
  60: [205, 12, 166, 39, 2],
  61: [201, 67, 93, 68, 13],
  62: [207, 190, 128, 243, 4],
  63: [229, 125, 21, 135, 7],
  64: [239, 198, 133, 142, 9],
  65: [247, 126, 243, 119, 2],
  66: [44, 228, 63, 37, 4],
  67: [43, 220, 255, 75, 3],
  68: [55, 199, 221, 189, 10],
  69: [161, 162, 84, 224, 15],
  70: [169, 130, 193, 187, 5],
  71: [216, 27, 73, 176, 8],
  72: [3, 88, 41, 248, 6],
  73: [7, 196, 9, 95, 12],
  74: [15, 226, 102, 23, 11],
  75: [20, 72, 54, 68, 1],
  76: [16, 173, 95, 251, 7],
  77: [18, 130, 149, 83, 15],
  78: [22, 225, 49, 132, 12],
  79: [24, 122, 73, 107, 0],
  80: [26, 232, 134, 17, 2],
  81: [25, 19, 174, 10, 1],
  82: [27, 103, 181, 161, 7],
  83: [37, 220, 149, 240, 11],
  84: [40, 137, 97, 247, 6],
  85: [51, 84, 20, 106, 10],
  86: [49, 193, 108, 31, 7],
  87: [51, 203, 24, 198, 6],
  88: [62, 207, 228, 144, 15],
  89: [70, 69, 24, 163, 15],
  90: [68, 186, 112, 182, 7],
  91: [65, 156, 98, 62, 8],
  92: [72, 209, 145, 74, 1],
  93: [84, 244, 153, 246, 13],
  94: [87, 90, 156, 129, 3],
  95: [85, 131, 85, 178, 12],
  96: [87, 183, 118, 16, 15],
  97: [92, 52, 54, 254, 4],
  98: [92, 72, 252, 119, 14],
  99: [94, 110, 239, 64, 2]
};

/**
 * Generate SVG for an ArUco marker from ARUCO_6X6_1000 dictionary
 * Uses the same algorithm as the JavaScript marker generator
 */
function generateArucoMarkerSVG(markerId: number): string {
  const bytes = ARUCO_6X6_1000_DICT[markerId];
  
  if (!bytes) {
    console.warn(`ArUco marker ID ${markerId} not in dictionary`);
    // Return a simple error marker
    return '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8" fill="black"/></svg>';
  }
  
  const width = 6;
  const height = 6;
  const bits: number[] = [];
  const bitsCount = width * height;
  
  // Parse marker's bytes into bits (same algorithm as the JS generator)
  for (const byte of bytes) {
    const start = bitsCount - bits.length;
    for (let i = Math.min(7, start - 1); i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  
  // Generate SVG with border
  let svg = '<svg viewBox="0 0 ' + (width + 2) + ' ' + (height + 2) + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">';
  
  // Background rect (black border)
  svg += '<rect x="0" y="0" width="' + (width + 2) + '" height="' + (height + 2) + '" fill="black"/>';
  
  // Draw white pixels with PDF artifact fixes
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const white = bits[i * height + j];
      if (!white) continue;
      
      let pixelWidth = 1;
      let pixelHeight = 1;
      
      // Fix PDF rendering artifacts by extending adjacent white pixels
      if ((j < width - 1) && (bits[i * height + j + 1])) {
        pixelWidth = 1.5;
      }
      
      svg += '<rect width="' + pixelWidth + '" height="' + pixelHeight + '" x="' + (j + 1) + '" y="' + (i + 1) + '" fill="white"/>';
      
      // Add vertical extension for adjacent white pixels
      if ((i < height - 1) && (bits[(i + 1) * height + j])) {
        svg += '<rect width="1" height="1.5" x="' + (j + 1) + '" y="' + (i + 1) + '" fill="white"/>';
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}

/**
 * Generate QR code data for a 3D model
 * Returns a URL that users can scan to upload textures
 */
export function createQRCodeData(viewerId: string, modelId: string, baseUrl: string): string {
  return `${baseUrl}/upload/${viewerId}/${modelId}`;
}

/**
 * Parse QR code data from scanned code
 */
export function parseQRCodeData(data: string): QRCodeData | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.viewerId && parsed.modelId) {
      return parsed as QRCodeData;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate QR code image as data URL
 */
export async function generateQRCodeImage(
  qrCodeData: QRCodeData | string,
  options?: QRCode.QRCodeToDataURLOptions
): Promise<string> {
  const dataString = typeof qrCodeData === 'string' ? qrCodeData : JSON.stringify(qrCodeData);
  
  const defaultOptions: QRCode.QRCodeToDataURLOptions = {
    errorCorrectionLevel: 'L', // Low error correction = simpler, less dense QR code
    type: 'image/png',
    width: 512,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    ...options
  };
  
  return QRCode.toDataURL(dataString, defaultOptions);
}

/**
 * Generate QR code as buffer (for saving to file)
 */
export async function generateQRCodeBuffer(
  qrCodeData: QRCodeData | string,
  options?: QRCode.QRCodeToBufferOptions
): Promise<Buffer> {
  const dataString = typeof qrCodeData === 'string' ? qrCodeData : JSON.stringify(qrCodeData);
  
  const defaultOptions: QRCode.QRCodeToBufferOptions = {
    errorCorrectionLevel: 'L', // Low error correction = simpler QR code
    type: 'png',
    width: 1024, // High resolution for printing
    margin: 2,
    ...options
  };
  
  return QRCode.toBuffer(dataString, defaultOptions);
}

/**
 * Generate a printable texture template with QR code
 * Returns an HTML string that can be converted to PDF
 * @param markerIdBase - Base marker ID for this model (uses 4 consecutive IDs)
 */
export function generateTextureTemplate(
  qrCodeDataUrl: string,
  modelName: string,
  viewerName: string,
  uvMapUrl?: string | null,
  uploadUrl?: string,
  markerIdBase: number = 0 // Default to 0 for backward compatibility
): string {
  // Each model uses 4 consecutive marker IDs from ARUCO_6X6_1000
  // markerIdBase + 0 = top-left
  // markerIdBase + 1 = top-right  
  // markerIdBase + 2 = bottom-right
  // markerIdBase + 3 = bottom-left
  const markerTopLeft = generateArucoMarkerSVG(markerIdBase);
  const markerTopRight = generateArucoMarkerSVG(markerIdBase + 1);
  const markerBottomRight = generateArucoMarkerSVG(markerIdBase + 2);
  const markerBottomLeft = generateArucoMarkerSVG(markerIdBase + 3);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Texture Template - ${modelName}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 0;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background: white;
    }
    .template {
      width: 297mm;
      height: 210mm;
      padding: 15mm;
      box-sizing: border-box;
      position: relative;
      page-break-after: always;
      border: 2px solid #ccc;
    }
    .header {
      background: #333;
      color: white;
      padding: 8px;
      border-radius: 6px;
      text-align: center;
    }
    .header h1 {
      font-size: 12pt;
      margin: 0 0 3px 0;
      color: white;
    }
    .header h2 {
      font-size: 9pt;
      margin: 0;
      color: #ddd;
    }
    .content-wrapper {
      display: flex;
      gap: 15px;
      height: 100%;
      align-items: flex-start;
    }
    .left-section {
      flex: 0 0 85mm;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .instructions {
      background: #f5f5f5;
      padding: 8px;
      border-radius: 6px;
      font-size: 8pt;
    }
    .instructions strong {
      display: block;
      margin-bottom: 8px;
    }
    .instructions ol {
      margin: 0;
      padding-left: 18px;
    }
    .instructions li {
      margin: 4px 0;
      line-height: 1.4;
    }
    .qr-section {
      text-align: center;
    }
    .qr-section img {
      display: block;
      width: 120px;
      height: 120px;
      margin: 0 auto 6px auto;
    }
    .qr-url {
      font-size: 7pt;
      color: #666;
      word-break: break-all;
      line-height: 1.2;
      background: #f5f5f5;
      padding: 6px;
      border-radius: 4px;
    }
    .texture-area {
      width: 165mm;
      height: 165mm;
      position: relative;
      background: #fafafa;
      flex-shrink: 0;
      ${uvMapUrl ? `background-image: url('${uvMapUrl}'); background-size: 100% 100%; background-repeat: no-repeat; background-position: center;` : ''}
    }
    .aruco-marker {
      position: absolute;
      width: 40px;
      height: 40px;
      background: white;
      padding: 0;
    }
    .aruco-marker svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .marker-top-left {
      top: 0;
      left: 0;
    }
    .marker-top-right {
      top: 0;
      right: 0;
    }
    .marker-bottom-left {
      bottom: 0;
      left: 0;
    }
    .marker-bottom-right {
      bottom: 0;
      right: 0;
    }
    .paint-message {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 32pt;
      color: #ccc;
      text-align: center;
      font-weight: bold;
      user-select: none;
      pointer-events: none;
    }
    .footer {
      background: #f5f5f5;
      padding: 8px;
      border-radius: 6px;
      text-align: center;
      font-size: 7pt;
      color: #666;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div class="template">
    <div class="content-wrapper">
      <div class="left-section">
        <div class="header">
          <h1>${modelName}</h1>
          <h2>${viewerName}</h2>
        </div>
        
        <div class="instructions">
          <strong>How to use:</strong>
          <ol>
            <li>Print this page in landscape</li>
            <li>Color or paint the texture area</li>
            <li><strong>Keep all corner markers visible</strong></li>
            <li>Take a photo with all 4 markers visible</li>
            <li>Scan QR code or upload via web</li>
            <li>Texture auto-applies to 3D model!</li>
          </ol>
        </div>
        
        <div class="qr-section">
          <img src="${qrCodeDataUrl}" alt="QR Code">
          <div class="qr-url">${uploadUrl || 'Scan QR to upload'}</div>
        </div>
        
        <div class="footer">
          Keep all 4 corner markers visible when photographing your colored texture
        </div>
      </div>
      
      <div class="texture-area">
        <div class="aruco-marker marker-top-left">
          ${markerTopLeft}
        </div>
        <div class="aruco-marker marker-top-right">
          ${markerTopRight}
        </div>
        <div class="aruco-marker marker-bottom-right">
          ${markerBottomRight}
        </div>
        <div class="aruco-marker marker-bottom-left">
          ${markerBottomLeft}
        </div>
        
        ${!uvMapUrl ? `<div class="paint-message">
          PAINT OR COLOR<br>
          THIS AREA
        </div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
