import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ArUco ARUCO_6X6_1000 dictionary (OpenCV DICT_6X6_1000)
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
  40: [106, 17, 74, 176, 5],
  41: [115, 216, 213, 65, 10],
  42: [124, 119, 116, 246, 15],
  43: [132, 8, 27, 71, 2],
  44: [143, 173, 182, 216, 13],
  45: [146, 86, 93, 149, 8],
  46: [157, 249, 248, 50, 3],
  47: [171, 64, 70, 175, 6],
  48: [174, 191, 229, 196, 1],
  49: [181, 226, 32, 125, 12],
  50: [184, 93, 131, 26, 7],
  51: [200, 30, 146, 243, 6],
  52: [203, 177, 49, 128, 1],
  53: [210, 248, 212, 57, 12],
  54: [217, 71, 119, 174, 7],
  55: [230, 166, 230, 21, 2],
  56: [237, 9, 69, 162, 13],
  57: [244, 96, 160, 59, 8],
  58: [251, 207, 3, 140, 3],
  59: [7, 170, 188, 79, 10],
  60: [10, 21, 31, 248, 5],
  61: [17, 124, 250, 97, 0],
  62: [24, 211, 89, 214, 11],
  63: [40, 176, 72, 29, 10],
  64: [43, 31, 235, 170, 5],
  65: [50, 118, 46, 51, 0],
  66: [57, 201, 141, 164, 11],
  67: [71, 32, 51, 113, 14],
  68: [74, 159, 144, 6, 1],
  69: [81, 230, 85, 159, 12],
  70: [88, 73, 246, 40, 7],
  71: [100, 12, 73, 205, 2],
  72: [107, 163, 234, 90, 13],
  73: [114, 202, 47, 227, 8],
  74: [121, 69, 140, 116, 3],
  75: [135, 144, 17, 177, 14],
  76: [138, 47, 178, 38, 1],
  77: [145, 102, 87, 159, 12],
  78: [152, 217, 244, 40, 7],
  79: [166, 48, 74, 173, 2],
  80: [169, 135, 233, 58, 13],
  81: [176, 238, 44, 131, 8],
  82: [183, 81, 143, 20, 3],
  83: [197, 18, 158, 253, 2],
  84: [200, 173, 61, 106, 13],
  85: [207, 196, 216, 211, 8],
  86: [214, 99, 123, 68, 3],
  87: [228, 200, 197, 177, 6],
  88: [231, 55, 102, 38, 1],
  89: [238, 142, 163, 159, 12],
  90: [245, 33, 0, 40, 7],
  91: [1, 68, 191, 173, 10],
  92: [8, 219, 28, 58, 5],
  93: [15, 162, 249, 131, 0],
  94: [22, 13, 90, 20, 11],
  95: [36, 70, 100, 241, 10],
  96: [41, 249, 199, 102, 5],
  97: [48, 144, 34, 219, 0],
  98: [55, 15, 129, 76, 11],
  99: [69, 76, 176, 165, 10]
};

function generateArucoMarkerSVGContent(markerId: number, size: number = 50): string {
  const bytes = ARUCO_6X6_1000_DICT[markerId];
  
  if (!bytes) {
    return `<rect width="${size}" height="${size}" fill="black"/>`;
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
  let svg = `<rect width="${size}" height="${size}" fill="black"/>`;
  
  // Draw white pixels
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const white = bits[i * height + j];
      if (!white) continue;
      const x = (j + 1) * cellSize;
      const y = (i + 1) * cellSize;
      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="white"/>`;
    }
  }
  
  return svg;
}

async function fetchSvgContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.text();
    
    // Extract just the content inside the SVG tag (without the outer svg element)
    const match = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (match) {
      return match[1];
    }
    return null;
  } catch (error) {
    console.error('Error fetching SVG:', error);
    return null;
  }
}

/**
 * GET /api/texture-template-svg/[modelId]
 * Generate downloadable SVG texture template with ArUco markers
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const supabase = await createClient();
    
    // Fetch model details
    const { data: model, error } = await supabase
      .from('viewer_models')
      .select('name, marker_id_base, uv_map_url, viewer_id')
      .eq('id', modelId)
      .single();
    
    if (error || !model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    
    // Fetch viewer name
    const { data: viewer } = await supabase
      .from('viewers')
      .select('name')
      .eq('id', model.viewer_id)
      .single();
    
    const markerIdBase = model.marker_id_base ?? 0;
    const modelName = model.name;
    const viewerName = viewer?.name || 'ClayPixels';
    
    // Template dimensions (A4 landscape-ish proportions)
    const templateWidth = 800;
    const templateHeight = 600;
    const markerSize = 50;
    const textureAreaSize = 500;
    const textureAreaX = (templateWidth - textureAreaSize) / 2;
    const textureAreaY = 70;
    
    // Try to fetch UV map SVG content if it's an SVG
    let uvMapContent = '';
    if (model.uv_map_url && model.uv_map_url.toLowerCase().endsWith('.svg')) {
      const svgContent = await fetchSvgContent(model.uv_map_url);
      if (svgContent) {
        uvMapContent = `
          <g transform="translate(${textureAreaX}, ${textureAreaY})">
            <svg x="0" y="0" width="${textureAreaSize}" height="${textureAreaSize}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
              ${svgContent}
            </svg>
          </g>`;
      }
    } else if (model.uv_map_url) {
      // For non-SVG UV maps, embed as image
      uvMapContent = `
        <image href="${model.uv_map_url}" x="${textureAreaX}" y="${textureAreaY}" width="${textureAreaSize}" height="${textureAreaSize}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${templateWidth}" height="${templateHeight}" viewBox="0 0 ${templateWidth} ${templateHeight}">
  <defs>
    <style>
      .title { font-family: Arial, sans-serif; font-size: 18px; font-weight: bold; }
      .subtitle { font-family: Arial, sans-serif; font-size: 12px; fill: #666; }
      .instruction { font-family: Arial, sans-serif; font-size: 10px; fill: #888; }
    </style>
  </defs>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="white"/>
  
  <!-- Title -->
  <text x="${templateWidth / 2}" y="30" text-anchor="middle" class="title">${modelName}</text>
  <text x="${templateWidth / 2}" y="50" text-anchor="middle" class="subtitle">${viewerName}</text>
  
  <!-- Texture Area Background -->
  <rect x="${textureAreaX}" y="${textureAreaY}" width="${textureAreaSize}" height="${textureAreaSize}" fill="#fafafa" stroke="#ddd" stroke-width="1"/>
  
  <!-- UV Map (if available) -->
  ${uvMapContent}
  
  <!-- ArUco Markers -->
  <!-- Top Left -->
  <g transform="translate(${textureAreaX}, ${textureAreaY})">
    ${generateArucoMarkerSVGContent(markerIdBase, markerSize)}
  </g>
  
  <!-- Top Right -->
  <g transform="translate(${textureAreaX + textureAreaSize - markerSize}, ${textureAreaY})">
    ${generateArucoMarkerSVGContent(markerIdBase + 1, markerSize)}
  </g>
  
  <!-- Bottom Right -->
  <g transform="translate(${textureAreaX + textureAreaSize - markerSize}, ${textureAreaY + textureAreaSize - markerSize})">
    ${generateArucoMarkerSVGContent(markerIdBase + 2, markerSize)}
  </g>
  
  <!-- Bottom Left -->
  <g transform="translate(${textureAreaX}, ${textureAreaY + textureAreaSize - markerSize})">
    ${generateArucoMarkerSVGContent(markerIdBase + 3, markerSize)}
  </g>
  
  <!-- Instructions -->
  <text x="${templateWidth / 2}" y="${textureAreaY + textureAreaSize + 30}" text-anchor="middle" class="instruction">Color or paint the texture area. Keep all 4 corner markers visible when photographing.</text>
  <text x="${templateWidth / 2}" y="${textureAreaY + textureAreaSize + 45}" text-anchor="middle" class="instruction">Markers: ${markerIdBase}, ${markerIdBase + 1}, ${markerIdBase + 2}, ${markerIdBase + 3} (ARUCO_6X6_1000)</text>
</svg>`;
    
    // Sanitize filename
    const safeModelName = modelName.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `attachment; filename="texture-template-${safeModelName}.svg"`,
      }
    });
    
  } catch (error) {
    console.error('Error generating SVG template:', error);
    return NextResponse.json(
      { error: 'Failed to generate template' },
      { status: 500 }
    );
  }
}
