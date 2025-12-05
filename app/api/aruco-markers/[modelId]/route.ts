import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ArUco ARUCO_6X6_1000 dictionary (same as in qr-codes.ts)
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
  24: [163, 29, 174, 202, 9],
  25: [165, 160, 225, 24, 6],
  26: [173, 78, 169, 30, 5],
  27: [181, 92, 125, 185, 4],
  28: [190, 130, 228, 156, 1],
  29: [198, 220, 13, 153, 6],
  30: [205, 37, 141, 170, 11],
  31: [217, 192, 131, 123, 10],
  32: [227, 67, 2, 216, 14],
  33: [236, 241, 96, 139, 3],
  34: [246, 30, 224, 76, 2],
  35: [251, 186, 168, 207, 9],
  36: [4, 173, 53, 52, 3],
  37: [11, 123, 89, 111, 8],
  38: [23, 228, 231, 152, 14],
  39: [32, 48, 181, 51, 1],
  40: [40, 171, 57, 102, 12],
  41: [54, 90, 189, 177, 5],
  42: [58, 132, 58, 220, 10],
  43: [67, 243, 100, 35, 15],
  44: [75, 150, 195, 107, 2],
  45: [81, 4, 150, 242, 9],
  46: [94, 83, 15, 169, 4],
  47: [101, 193, 92, 56, 11],
  48: [110, 112, 163, 207, 6],
  49: [119, 247, 7, 50, 1],
  50: [131, 62, 226, 221, 0],
  51: [137, 177, 65, 114, 15],
  52: [149, 222, 179, 203, 2],
  53: [155, 109, 16, 84, 13],
  54: [166, 40, 139, 173, 8],
  55: [172, 135, 38, 66, 3],
  56: [184, 254, 217, 245, 14],
  57: [193, 93, 120, 148, 5],
  58: [200, 202, 211, 55, 0],
  59: [211, 57, 114, 150, 11],
  60: [220, 148, 13, 41, 6],
  61: [231, 35, 168, 212, 1],
  62: [238, 178, 67, 119, 12],
  63: [249, 77, 226, 10, 7],
  64: [3, 190, 101, 185, 10],
  65: [12, 87, 4, 80, 5],
  66: [25, 232, 171, 243, 0],
  67: [34, 45, 14, 134, 15],
  68: [45, 154, 169, 29, 2],
  69: [52, 59, 68, 184, 13],
  70: [63, 196, 227, 75, 8],
  71: [74, 81, 126, 230, 3],
  72: [83, 214, 25, 121, 14],
  73: [96, 103, 180, 16, 5],
  74: [105, 8, 83, 175, 0],
  75: [118, 169, 242, 70, 11],
  76: [127, 22, 97, 229, 6],
  77: [136, 183, 0, 116, 1],
  78: [147, 36, 163, 15, 12],
  79: [158, 133, 62, 166, 7],
  80: [167, 230, 217, 57, 2],
  81: [176, 69, 116, 200, 13],
  82: [189, 168, 19, 107, 8],
  83: [194, 15, 178, 2, 3],
  84: [207, 114, 81, 157, 14],
  85: [214, 213, 244, 48, 5],
  86: [225, 56, 99, 207, 0],
  87: [234, 159, 198, 102, 11],
  88: [247, 250, 41, 249, 6],
  89: [252, 93, 140, 144, 1],
  90: [9, 190, 235, 43, 12],
  91: [18, 31, 78, 150, 7],
  92: [27, 180, 177, 43, 2],
  93: [36, 21, 20, 216, 13],
  94: [49, 118, 187, 111, 8],
  95: [58, 219, 30, 6, 3],
  96: [67, 76, 181, 161, 14],
  97: [76, 175, 16, 56, 5],
  98: [89, 10, 179, 215, 0],
  99: [98, 109, 22, 102, 11]
};

function generateArucoMarkerSVG(markerId: number, size: number = 100): string {
  const bytes = ARUCO_6X6_1000_DICT[markerId];
  
  if (!bytes) {
    // Return error marker
    return `<svg viewBox="0 0 8 8" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8" fill="black"/><text x="4" y="5" fill="white" font-size="3" text-anchor="middle">?</text></svg>`;
  }
  
  const width = 6;
  const height = 6;
  const bits: number[] = [];
  const bitsCount = width * height;
  
  for (const byte of bytes) {
    const start = bitsCount - bits.length;
    for (let i = Math.min(7, start - 1); i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  
  const cellSize = size / (width + 2);
  let svg = `<svg viewBox="0 0 ${width + 2} ${height + 2}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">`;
  
  // Black background (border)
  svg += `<rect x="0" y="0" width="${width + 2}" height="${height + 2}" fill="black"/>`;
  
  // Draw white pixels
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const white = bits[i * height + j];
      if (!white) continue;
      svg += `<rect width="1" height="1" x="${j + 1}" y="${i + 1}" fill="white"/>`;
    }
  }
  
  svg += '</svg>';
  return svg;
}

/**
 * GET /api/aruco-markers/[modelId]
 * Generate downloadable ArUco markers for a model
 * Query params:
 *   - format: 'html' (default) or 'svg'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'html';
    
    const supabase = await createClient();
    
    // Fetch model to get marker_id_base
    const { data: model, error } = await supabase
      .from('viewer_models')
      .select('name, marker_id_base')
      .eq('id', modelId)
      .single();
    
    if (error || !model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    
    const markerIdBase = model.marker_id_base ?? 0;
    const modelName = model.name;
    
    // Return SVG format with all 4 markers
    if (format === 'svg') {
      const markerSize = 200;
      const padding = 20;
      const labelHeight = 30;
      const totalWidth = (markerSize * 2) + (padding * 3);
      const totalHeight = (markerSize * 2) + (padding * 3) + (labelHeight * 2) + 60; // Extra for title
      
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <style>
    .label { font-family: Arial, sans-serif; font-size: 14px; text-anchor: middle; }
    .title { font-family: Arial, sans-serif; font-size: 18px; font-weight: bold; text-anchor: middle; }
    .id { font-family: Arial, sans-serif; font-size: 12px; text-anchor: middle; fill: #666; }
  </style>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="white"/>
  
  <!-- Title -->
  <text x="${totalWidth / 2}" y="30" class="title">${modelName} - ArUco Markers</text>
  
  <!-- Top Left Marker -->
  <g transform="translate(${padding}, 50)">
    ${generateArucoMarkerSVG(markerIdBase, markerSize)}
    <text x="${markerSize / 2}" y="${markerSize + 18}" class="label">Top Left</text>
    <text x="${markerSize / 2}" y="${markerSize + 32}" class="id">ID: ${markerIdBase}</text>
  </g>
  
  <!-- Top Right Marker -->
  <g transform="translate(${padding * 2 + markerSize}, 50)">
    ${generateArucoMarkerSVG(markerIdBase + 1, markerSize)}
    <text x="${markerSize / 2}" y="${markerSize + 18}" class="label">Top Right</text>
    <text x="${markerSize / 2}" y="${markerSize + 32}" class="id">ID: ${markerIdBase + 1}</text>
  </g>
  
  <!-- Bottom Left Marker -->
  <g transform="translate(${padding}, ${50 + markerSize + labelHeight + padding})">
    ${generateArucoMarkerSVG(markerIdBase + 3, markerSize)}
    <text x="${markerSize / 2}" y="${markerSize + 18}" class="label">Bottom Left</text>
    <text x="${markerSize / 2}" y="${markerSize + 32}" class="id">ID: ${markerIdBase + 3}</text>
  </g>
  
  <!-- Bottom Right Marker -->
  <g transform="translate(${padding * 2 + markerSize}, ${50 + markerSize + labelHeight + padding})">
    ${generateArucoMarkerSVG(markerIdBase + 2, markerSize)}
    <text x="${markerSize / 2}" y="${markerSize + 18}" class="label">Bottom Right</text>
    <text x="${markerSize / 2}" y="${markerSize + 32}" class="id">ID: ${markerIdBase + 2}</text>
  </g>
</svg>`;
      
      // Sanitize filename
      const safeModelName = modelName.replace(/[^a-zA-Z0-9-_]/g, '_');
      
      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `attachment; filename="aruco-markers-${safeModelName}.svg"`,
        }
      });
    }
    
    // Default: Generate HTML page with all 4 markers
    const markerSize = 200;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ArUco Markers - ${modelName}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: white;
    }
    h1 { text-align: center; margin-bottom: 10px; }
    .info { text-align: center; color: #666; margin-bottom: 30px; }
    .markers-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 40px;
      max-width: 600px;
      margin: 0 auto;
    }
    .marker-container {
      text-align: center;
      padding: 20px;
      border: 2px solid #eee;
      border-radius: 8px;
    }
    .marker-container svg {
      display: block;
      margin: 0 auto 15px auto;
    }
    .marker-label {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .marker-id {
      color: #666;
      font-size: 14px;
    }
    .instructions {
      margin-top: 40px;
      padding: 20px;
      background: #f5f5f5;
      border-radius: 8px;
    }
    .instructions h3 { margin-top: 0; }
    .instructions ol { margin: 0; padding-left: 20px; }
    .instructions li { margin: 8px 0; }
    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>ArUco Markers for "${modelName}"</h1>
  <p class="info">Marker IDs: ${markerIdBase} - ${markerIdBase + 3} (ARUCO_6X6_1000 dictionary)</p>
  
  <div class="markers-grid">
    <div class="marker-container">
      ${generateArucoMarkerSVG(markerIdBase, markerSize)}
      <div class="marker-label">Top Left</div>
      <div class="marker-id">ID: ${markerIdBase}</div>
    </div>
    <div class="marker-container">
      ${generateArucoMarkerSVG(markerIdBase + 1, markerSize)}
      <div class="marker-label">Top Right</div>
      <div class="marker-id">ID: ${markerIdBase + 1}</div>
    </div>
    <div class="marker-container">
      ${generateArucoMarkerSVG(markerIdBase + 3, markerSize)}
      <div class="marker-label">Bottom Left</div>
      <div class="marker-id">ID: ${markerIdBase + 3}</div>
    </div>
    <div class="marker-container">
      ${generateArucoMarkerSVG(markerIdBase + 2, markerSize)}
      <div class="marker-label">Bottom Right</div>
      <div class="marker-id">ID: ${markerIdBase + 2}</div>
    </div>
  </div>
  
  <div class="instructions">
    <h3>How to use these markers:</h3>
    <ol>
      <li>Print this page at 100% scale (no scaling)</li>
      <li>Cut out each marker</li>
      <li>Place markers at the corners of your texture template</li>
      <li>Top-Left marker goes in top-left corner, etc.</li>
      <li>When users photograph their painted texture, these markers enable automatic perspective correction</li>
    </ol>
  </div>
  
  <div class="no-print" style="text-align: center; margin-top: 30px;">
    <button onclick="window.print()" style="padding: 12px 24px; font-size: 16px; cursor: pointer;">
      🖨️ Print Markers
    </button>
  </div>
</body>
</html>
    `.trim();
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      }
    });
    
  } catch (error) {
    console.error('Error generating ArUco markers:', error);
    return NextResponse.json(
      { error: 'Failed to generate markers' },
      { status: 500 }
    );
  }
}
