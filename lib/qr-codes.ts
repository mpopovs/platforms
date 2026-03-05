import QRCode from 'qrcode';
import { generateModelId, type QRCodeData, type WorksheetLayout, type WorksheetElement } from './types/viewer';

// HTML escape helper
function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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

/**
 * Generate just the page content (single `.template` div) for a worksheet.
 * Used to build multi-page combined worksheets.
 * @param markerIdBase - Base marker ID for this model (uses 4 consecutive IDs)
 * @param lang - Language code for worksheet text (default: 'en')
 */

const WORKSHEET_TRANSLATIONS: Record<string, {
  howToUse: string;
  steps: string[];
  footer: string;
  paintMessage: string;
  scanQr: string;
}> = {
  en: {
    howToUse: 'How to use:',
    steps: [
      'Print this page in landscape',
      'Color or paint the texture area',
      '<strong>Keep all corner markers visible</strong>',
      'Take a photo with all 4 markers visible',
      'Scan QR code or upload via web',
      'Texture auto-applies to 3D model!',
    ],
    footer: 'Keep all 4 corner markers visible when photographing your colored texture',
    paintMessage: 'PAINT OR COLOR<br>THIS AREA',
    scanQr: 'Scan QR to upload',
  },
  lv: {
    howToUse: 'Kā lietot:',
    steps: [
      'Izdrukā šo lapu ainavas režīmā',
      'Iekrāso vai nokrāso faktūras zonu',
      '<strong>Pārliecinies, ka visi stūru marķieri ir redzami</strong>',
      'Uzņem fotoattēlu ar visiem 4 marķieriem',
      'Skenē QR kodu vai augšupielādē manuāli',
      'Faktūra automātiski tiek pielietota 3D modelim!',
    ],
    footer: 'Pārliecinies, ka visi 4 stūru marķieri ir redzami, fotografējot savu iekrāsoto faktūru',
    paintMessage: 'IEKRĀSO ŠO<br>ZONU',
    scanQr: 'Skenē QR, lai augšupielādētu',
  },
  lt: {
    howToUse: 'Kaip naudoti:',
    steps: [
      'Atspausdinkite šį lapą gulsčiai',
      'Nuspalvinkite arba nudažykite tekstūros sritį',
      '<strong>Pasirūpinkite, kad visi kampų žymekliai būtų matomi</strong>',
      'Nufotografuokite su visais 4 žymekliais',
      'Nuskenuokite QR kodą arba įkelkite per internetą',
      'Tekstūra automatiškai pritaikoma 3D modeliui!',
    ],
    footer: 'Pasirūpinkite, kad visi 4 kampų žymekliai būtų matomi fotografuojant',
    paintMessage: 'SPALVINKITE<br>ŠIĄ SRITĮ',
    scanQr: 'Nuskenuokite QR įkėlimui',
  },
  de: {
    howToUse: 'So geht\'s:',
    steps: [
      'Diese Seite im Querformat drucken',
      'Die Textur ausmalen oder bemalen',
      '<strong>Alle Eckmarkierungen sichtbar lassen</strong>',
      'Foto mit allen 4 Markierungen aufnehmen',
      'QR-Code scannen oder über das Web hochladen',
      'Textur wird automatisch auf das 3D-Modell angewendet!',
    ],
    footer: 'Alle 4 Eckmarkierungen beim Fotografieren der Textur sichtbar lassen',
    paintMessage: 'DIESEN BEREICH<br>AUSMALEN',
    scanQr: 'QR scannen zum Hochladen',
  },
  ru: {
    howToUse: 'Как использовать:',
    steps: [
      'Распечатайте страницу в альбомном режиме',
      'Раскрасьте область текстуры',
      '<strong>Убедитесь, что все угловые маркеры видны</strong>',
      'Сфотографируйте с видимыми 4 маркерами',
      'Отсканируйте QR-код или загрузите через сеть',
      'Текстура автоматически применяется к 3D-модели!',
    ],
    footer: 'Убедитесь, что все 4 угловых маркера видны при фотографировании',
    paintMessage: 'ЗАКРАСЬТЕ<br>ЭТУ ОБЛАСТЬ',
    scanQr: 'Отсканируйте QR для загрузки',
  },
  et: {
    howToUse: 'Kuidas kasutada:',
    steps: [
      'Prindi see leht rõhtpaigutuses',
      'Värvi tekstuuriala',
      '<strong>Hoia kõik nurgatähised nähtaval</strong>',
      'Tee foto kõigi 4 tähisega',
      'Skanni QR-kood või laadi üles veebi kaudu',
      'Tekstuur rakendatakse automaatselt 3D-mudelile!',
    ],
    footer: 'Hoia kõik 4 nurgatähist nähtaval, kui fotografeerid oma värvitud tekstuuri',
    paintMessage: 'VÄRVI SEE<br>ALA',
    scanQr: 'Skanni QR üleslaadimiseks',
  },
};

export function generateWorksheetPageContent(
  qrCodeDataUrl: string,
  modelName: string,
  viewerName: string,
  uvMapUrl?: string | null,
  uploadUrl?: string,
  markerIdBase: number = 0,
  lang: string = 'en',
  displayUploadUrl?: string,
): string {
  const tr = WORKSHEET_TRANSLATIONS[lang] ?? WORKSHEET_TRANSLATIONS.en;

  const markerTopLeft = generateArucoMarkerSVG(markerIdBase);
  const markerTopRight = generateArucoMarkerSVG(markerIdBase + 1);
  const markerBottomRight = generateArucoMarkerSVG(markerIdBase + 2);
  const markerBottomLeft = generateArucoMarkerSVG(markerIdBase + 3);

  return `
  <div class="template">
    <div class="content-wrapper">
      <div class="left-section">
        <div class="header">
          <h1>${modelName}</h1>
          <h2>${viewerName}</h2>
        </div>
        <div class="instructions">
          <strong>${tr.howToUse}</strong>
          <ol>
            ${tr.steps.map(s => `<li>${s}</li>`).join('\n            ')}
          </ol>
        </div>
        <div class="qr-section">
          <img src="${qrCodeDataUrl}" alt="QR Code">
          <div class="qr-url">${displayUploadUrl || uploadUrl || tr.scanQr}</div>
        </div>
        <div class="footer">
          ${tr.footer}
        </div>
      </div>
      <div class="texture-area" ${uvMapUrl ? `style="background-image: url('${uvMapUrl}'); background-size: 100% 100%; background-repeat: no-repeat; background-position: center;"` : ''}>
        <div class="aruco-marker marker-top-left">${markerTopLeft}</div>
        <div class="aruco-marker marker-top-right">${markerTopRight}</div>
        <div class="aruco-marker marker-bottom-right">${markerBottomRight}</div>
        <div class="aruco-marker marker-bottom-left">${markerBottomLeft}</div>
        ${!uvMapUrl ? `<div class="paint-message">${tr.paintMessage}</div>` : ''}
      </div>
    </div>
  </div>`.trim();
}

/**
 * Wrap multiple worksheet page contents into a single printable HTML document.
 * Each page content should come from generateWorksheetPageContent().
 */
export function wrapWorksheetPages(pagesHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Classroom Worksheets</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: white; }
    .template {
      width: 297mm; height: 210mm; padding: 15mm; box-sizing: border-box;
      position: relative; page-break-after: always;
    }
    .header { background: #333; color: white; padding: 8px; border-radius: 6px; text-align: center; }
    .header h1 { font-size: 12pt; margin: 0 0 3px 0; color: white; }
    .header h2 { font-size: 9pt; margin: 0; color: #ddd; }
    .content-wrapper { display: flex; gap: 15px; height: 100%; align-items: flex-start; }
    .left-section { flex: 0 0 85mm; display: flex; flex-direction: column; gap: 10px; }
    .instructions { background: #f5f5f5; padding: 8px; border-radius: 6px; font-size: 8pt; }
    .instructions strong { display: block; margin-bottom: 8px; }
    .instructions ol { margin: 0; padding-left: 18px; }
    .instructions li { margin: 4px 0; line-height: 1.4; }
    .qr-section { text-align: center; }
    .qr-section img { display: block; width: 120px; height: 120px; margin: 0 auto 6px auto; }
    .qr-url { font-size: 7pt; color: #666; word-break: break-all; line-height: 1.2; background: #f5f5f5; padding: 6px; border-radius: 4px; }
    .texture-area {
      width: 165mm; height: 165mm; position: relative; flex-shrink: 0;
    }
    .aruco-marker { position: absolute; width: 40px; height: 40px; background: white; padding: 0; }
    .aruco-marker svg { width: 100%; height: 100%; display: block; }
    .marker-top-left { top: 0; left: 0; }
    .marker-top-right { top: 0; right: 0; }
    .marker-bottom-left { bottom: 0; left: 0; }
    .marker-bottom-right { bottom: 0; right: 0; }
    .paint-message {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 32pt; color: #ccc; text-align: center; font-weight: bold;
    }
    .footer { background: #f5f5f5; padding: 8px; border-radius: 6px; text-align: center; font-size: 7pt; color: #666; }
    /* ─── Instruction page ─── */
    .ws-page { width: 297mm; height: 210mm; position: relative; overflow: hidden; background: white; page-break-after: always; box-sizing: border-box; }
    .instr-page { padding: 12mm 12mm 8mm 12mm; display: flex; flex-direction: column; gap: 6mm; }
    .instr-header { border-bottom: 2px solid #333; padding-bottom: 4mm; }
    .instr-header h1 { margin: 0; font-size: 16pt; color: #333; }
    .instr-body { display: flex; flex-direction: column; flex: 1; gap: 4mm; }
    .instr-body-row { display: flex; gap: 8mm; align-items: flex-start; flex: 1; }
    .instr-section { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3mm; padding: 5mm; background: #f8f8f8; border-radius: 6px; border: 1px solid #e0e0e0; }
    .instr-section h2 { margin: 0; font-size: 11pt; color: #444; text-align: center; }
    .instr-section .instr-qr { width: 40mm; height: 40mm; display: block; }
    .instr-section .instr-url { font-size: 6.5pt; color: #666; word-break: break-all; text-align: center; line-height: 1.3; }
    .instr-section .instr-hint { font-size: 7pt; color: #888; text-align: center; line-height: 1.4; margin: 0; }
    .instr-pin { background: #fff8e6; border-color: #f5c842; }
    .pin-display { font-size: 32pt; font-family: monospace; font-weight: bold; letter-spacing: 6px; color: #b8860b; background: white; border: 2px solid #f5c842; border-radius: 8px; padding: 4mm 8mm; text-align: center; }
    .instr-custom { font-size: 8pt; color: #555; background: #f0f4ff; border: 1px solid #c0cff8; border-radius: 6px; padding: 4mm 6mm; line-height: 1.5; }
    .instr-extras { display: flex; flex-wrap: wrap; gap: 4mm; }
    .instr-extra-text { flex: 1; min-width: 40mm; font-size: 8pt; color: #333; line-height: 1.6; white-space: pre-wrap; padding: 3mm 4mm; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 4px; }
    .instr-extra-image { display: flex; align-items: center; justify-content: center; }
    .instr-extra-image img { max-height: 30mm; display: block; }
    .instr-extra-url { flex: 1; min-width: 50mm; display: flex; align-items: center; gap: 4mm; padding: 3mm 4mm; background: #f5f8ff; border: 1px solid #d0dcf8; border-radius: 4px; }
    .instr-extra-url .url-qr { width: 18mm; height: 18mm; flex-shrink: 0; display: block; }
    .instr-extra-url-info .url-label { font-size: 8pt; font-weight: 600; color: #444; margin-bottom: 1mm; }
    .instr-extra-url-info .url-text { font-size: 7pt; word-break: break-all; color: #333; }
    .instr-pin-url { display: flex; align-items: center; gap: 3mm; margin-top: 2mm; padding-top: 2mm; border-top: 1px dashed rgba(0,0,0,0.15); width: 100%; justify-content: center; }
    .instr-pin-url img { width: 16mm; height: 16mm; display: block; flex-shrink: 0; }
    .instr-pin-url-text { font-size: 6pt; color: #888; word-break: break-all; line-height: 1.4; }
    .instr-teacher-survey { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3mm; padding: 5mm; background: #f0fdf4; border-radius: 6px; border: 1px solid #86efac; }
    .instr-teacher-survey h2 { margin: 0; font-size: 11pt; color: #15803d; text-align: center; }
    .instr-teacher-survey .ts-qr { width: 36mm; height: 36mm; display: block; }
    .instr-teacher-survey .ts-url { font-size: 6pt; color: #16a34a; word-break: break-all; text-align: center; line-height: 1.3; }
    .instr-teacher-survey .ts-hint { font-size: 7pt; color: #4ade80; text-align: center; font-style: italic; margin: 0; }
    /* Portrait instruction page */
    @page portrait-instr { size: A4 portrait; margin: 0; }
    .instr-portrait { page: portrait-instr; width: 210mm; height: 297mm; }
  </style>
</head>
<body>
${pagesHtml}
</body>
</html>`.trim();
}

/**
 * Generate HTML content for an A4-landscape teacher instruction page.
 * Returns a <div class="ws-page instr-page"> to be inserted into wrapWorksheetPages.
 *
 * @param klaseUrl            - Full URL to the /klase registration page
 * @param pin                 - Plain-text PIN (if already known); undefined for placeholder
 * @param observerSurveyUrl   - URL for the novērotājs (observer) survey, or undefined
 * @param lang                - Language code: 'lv' | 'en' | 'lt'
 * @param customText          - Optional extra instructions (bottom of page)
 */
export interface InstrSectionStyleOpts {
  bg?: string;
  borderColor?: string;
  headingStyle?: { fontSize?: number; fontWeight?: string; fontStyle?: string; color?: string; textAlign?: string; backgroundColor?: string };
  bodyStyle?:   { fontSize?: number; fontWeight?: string; fontStyle?: string; color?: string; textAlign?: string; backgroundColor?: string };
}
export interface InstrPageOpts {
  orientation?: 'landscape' | 'portrait';
  /** The classroom viewer display URL (/v/shortCode) shown in the PIN section */
  viewerUrl?: string;
  showHeader?: boolean;
  showKlase?: boolean;
  showPin?: boolean;
  showObserver?: boolean;
  showKlaseUrlInPin?: boolean;
  klaseUrlQrSizeMm?: number;
  klaseUrlTextSizePt?: number;
  /** Order of the three body sections; default ['klase','pin','observer'] */
  sectionOrder?: string[];
  bodyItemOrder?: string[];
  /** Multi-row body layout. When present, overrides bodyItemOrder/sectionOrder. */
  bodyRows?: Array<{ id: string; items: string[] }>;
  /** URL for the teacher survey fill-in page (/ts/[viewerId]) */
  teacherSurveyUrl?: string;
  teacherSurvey?: {
    enabled?: boolean;
    title?: Record<string, string>;
    questions?: Array<{ id: string; type: 'open' | 'checkbox'; text: Record<string, string>; options?: Array<Record<string, string>> }>;
  };
  extraBlocks?: Array<{
    id: string;
    type: 'text' | 'image' | 'url';
    position?: 'body' | 'after-header' | 'after-body' | 'after-footer';
    widthPercent?: number;
    content?: Record<string, string>;
    /** Text style overrides for type=text blocks */
    textStyle?: { fontSize?: number; fontWeight?: string; fontStyle?: string; color?: string; textAlign?: string; backgroundColor?: string };
    imageUrl?: string;
    imageMaxWidthMm?: number;
    url?: string;
    urlLabel?: Record<string, string>;
    showQr?: boolean;
  }>;
  sectionStyles?: {
    header?: InstrSectionStyleOpts;
    klase?: InstrSectionStyleOpts;
    pin?: InstrSectionStyleOpts;
    observer?: InstrSectionStyleOpts;
    footer?: InstrSectionStyleOpts;
  };
}

export async function generateKlaseInstructionPageContent(
  klaseUrl: string,
  pin: string | undefined,
  observerSurveyUrl: string | undefined,
  lang: string,
  customText?: string,
  customTranslations?: Record<string, { title?: string; klaseSection?: string; klaseHint?: string; pinSection?: string; pinHint?: string; observerSection?: string; observerHint?: string }>,
  opts?: InstrPageOpts,
): Promise<string> {
  const LABELS: Record<string, { title: string; klaseSection: string; klaseHint: string; pinSection: string; pinHint: string; observerSection: string; observerHint: string }> = {
    lv: {
      title: 'Skolotāja instrukcija',
      klaseSection: 'Klases reģistrācija',
      klaseHint: 'Skenē QR kodu vai atvēri saiti, lai reģistrētu klasi un saņemtu darba lapas',
      pinSection: 'PIN kods',
      pinHint: 'Ievadi šo PIN kodu, lai atvērtu klases displeju',
      observerSection: 'Novērotāja aptauja',
      observerHint: 'Skenē QR kodu, lai aizpildītu novērotāja aptauju',
    },
    en: {
      title: 'Teacher Instruction',
      klaseSection: 'Class Registration',
      klaseHint: 'Scan QR or open the link to register your class and get worksheets',
      pinSection: 'PIN Code',
      pinHint: 'Enter this PIN to unlock the classroom display',
      observerSection: 'Observer Survey',
      observerHint: 'Scan QR to fill in the observer survey',
    },
    lt: {
      title: 'Mokytojo instrukcija',
      klaseSection: 'Klasės registracija',
      klaseHint: 'Skenk QR arba atidark nuorodą, kad registruotum klasę ir gautum darbo lapus',
      pinSection: 'PIN kodas',
      pinHint: 'Įvesk šį PIN kodą, kad atidarytum klasės ekraną',
      observerSection: 'Stebėtojo apklausa',
      observerHint: 'Skenk QR, kad užpildytum stebėtojo apklausą',
    },
  };
  const base = LABELS[lang] ?? LABELS.en;
  const overrides = customTranslations?.[lang] ?? {};
  const l = { ...base, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== '' && v != null)) };
  const pinDisplay = escapeHtml(pin ?? '_ _ _ _');

  const showHeader  = opts?.showHeader  ?? true;
  const showKlase   = opts?.showKlase   ?? true;
  const showPin     = opts?.showPin     ?? true;
  const showObs     = opts?.showObserver ?? true;
  const showKlaseUrlInPin = opts?.showKlaseUrlInPin ?? true;
  const klaseUrlQrSizeMm  = opts?.klaseUrlQrSizeMm ?? 16;
  const klaseUrlTextSizePt = opts?.klaseUrlTextSizePt ?? 6;
  const orientation = opts?.orientation ?? 'landscape';
  const viewerUrl   = opts?.viewerUrl ?? klaseUrl;
  const sectionOrder = opts?.sectionOrder ?? ['klase', 'pin', 'observer'];
  const ss          = opts?.sectionStyles ?? {};

  const klaseQr = (showKlase || showKlaseUrlInPin) ? await generateQRCodeImage(klaseUrl, { width: 256, margin: 1 }) : null;
  const viewerQr = showKlaseUrlInPin ? await generateQRCodeImage(viewerUrl, { width: Math.max(128, klaseUrlQrSizeMm * 12), margin: 1 }) : null;
  const observerQr  = showObs && observerSurveyUrl
    ? await generateQRCodeImage(observerSurveyUrl, { width: 256, margin: 1 })
    : null;

  const headerStyle  = ss.header?.borderColor   ? ` style="border-color:${ss.header.borderColor}"` : '';

  function tsToInlineStyle(s?: { fontSize?: number; fontWeight?: string; fontStyle?: string; color?: string; textAlign?: string; backgroundColor?: string }) {
    if (!s) return '';
    const parts: string[] = [];
    if (s.fontSize)       parts.push(`font-size:${s.fontSize}pt`);
    if (s.fontWeight)     parts.push(`font-weight:${s.fontWeight}`);
    if (s.fontStyle)      parts.push(`font-style:${s.fontStyle}`);
    if (s.color)          parts.push(`color:${s.color}`);
    if (s.textAlign)      parts.push(`text-align:${s.textAlign}`);
    if (s.backgroundColor) parts.push(`background-color:${s.backgroundColor}`);
    return parts.join(';');
  }

  const klaseStyle   = [ss.klase?.bg && `background:${ss.klase.bg}`, ss.klase?.borderColor && `border-color:${ss.klase.borderColor}`].filter(Boolean).join(';');
  const pinStyle     = [ss.pin?.bg   && `background:${ss.pin.bg}`,   ss.pin?.borderColor   && `border-color:${ss.pin.borderColor}`  ].filter(Boolean).join(';');
  const obsStyle     = [ss.observer?.bg && `background:${ss.observer.bg}`, ss.observer?.borderColor && `border-color:${ss.observer.borderColor}`].filter(Boolean).join(';');
  const footerStyle  = [ss.footer?.bg && `background:${ss.footer.bg}`, ss.footer?.borderColor && `border-color:${ss.footer.borderColor}`].filter(Boolean).join(';');

  const klaseSection = showKlase && klaseQr ? `
    <div class="instr-section"${klaseStyle ? ` style="${klaseStyle}"` : ''}>
      <h2${tsToInlineStyle(ss.klase?.headingStyle) ? ` style="${tsToInlineStyle(ss.klase?.headingStyle)}"` : ''}>${l.klaseSection}</h2>
      <img src="${klaseQr}" class="instr-qr" alt="Klase QR">
      <p class="instr-url">${escapeHtml(klaseUrl)}</p>
      <p class="instr-hint"${tsToInlineStyle(ss.klase?.bodyStyle) ? ` style="${tsToInlineStyle(ss.klase?.bodyStyle)}"` : ''}>${l.klaseHint}</p>
    </div>` : '';

  const pinUrlBlock = showPin && showKlaseUrlInPin
    ? `<div class="instr-pin-url">${viewerQr ? `<img src="${viewerQr}" style="width:${klaseUrlQrSizeMm}mm;height:${klaseUrlQrSizeMm}mm;" alt="URL QR">` : ''}<span class="instr-pin-url-text" style="font-size:${klaseUrlTextSizePt}pt">${escapeHtml(viewerUrl)}</span></div>`
    : '';

  const pinSection = showPin ? `
    <div class="instr-section instr-pin"${pinStyle ? ` style="${pinStyle}"` : ''}>
      <h2${tsToInlineStyle(ss.pin?.headingStyle) ? ` style="${tsToInlineStyle(ss.pin?.headingStyle)}"` : ''}>${l.pinSection}</h2>
      <div class="pin-display">${pinDisplay}</div>
      <p class="instr-hint"${tsToInlineStyle(ss.pin?.bodyStyle) ? ` style="${tsToInlineStyle(ss.pin?.bodyStyle)}"` : ''}>${l.pinHint}</p>
      ${pinUrlBlock}
    </div>` : '';

  const observerSection = observerQr ? `
    <div class="instr-section"${obsStyle ? ` style="${obsStyle}"` : ''}>
      <h2${tsToInlineStyle(ss.observer?.headingStyle) ? ` style="${tsToInlineStyle(ss.observer?.headingStyle)}"` : ''}>${l.observerSection}</h2>
      <img src="${observerQr}" class="instr-qr" alt="Observer QR">
      <p class="instr-url">${escapeHtml(observerSurveyUrl ?? '')}</p>
      <p class="instr-hint"${tsToInlineStyle(ss.observer?.bodyStyle) ? ` style="${tsToInlineStyle(ss.observer?.bodyStyle)}"` : ''}>${l.observerHint}</p>
    </div>` : '';

  const footerHtml = customText
    ? `<div class="instr-custom"${footerStyle ? ` style="${footerStyle}${tsToInlineStyle(ss.footer?.bodyStyle) ? ';' + tsToInlineStyle(ss.footer?.bodyStyle) : ''}"` : (tsToInlineStyle(ss.footer?.bodyStyle) ? ` style="${tsToInlineStyle(ss.footer?.bodyStyle)}"` : '')}>${escapeHtml(customText)}</div>`
    : '';

  // ── Variable resolution for text blocks ────────────────────────────
  function resolveVars(raw: string): string {
    return raw
      .replace(/\{pin\}/gi, pin ?? '_ _ _ _')
      .replace(/\{klase_url\}/gi, klaseUrl)
      .replace(/\{display_url\}/gi, viewerUrl);
  }

  // ── Extra block renderer ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function renderExtraBlock(block: any): Promise<string> {
    const wPct: number | undefined = block.widthPercent;
    const widthStyle = wPct ? `flex:0 0 calc(${wPct}% - 4mm);max-width:calc(${wPct}% - 4mm);` : '';
    if (block.type === 'text') {
      const raw: string = block.content?.[lang] ?? block.content?.[Object.keys(block.content ?? {})[0]] ?? '';
      const text = resolveVars(raw);
      const ts = block.textStyle;
      const textInline = ts ? tsToInlineStyle(ts) : '';
      const combinedStyle = [widthStyle, textInline].filter(Boolean).join(';');
      return text ? `<div class="instr-extra-text"${combinedStyle ? ` style="${combinedStyle}"` : ''}>${escapeHtml(text)}</div>` : '';
    }
    if (block.type === 'image' && block.imageUrl) {
      const maxW = block.imageMaxWidthMm ? `max-width:${block.imageMaxWidthMm}mm;` : 'max-width:80mm;';
      return `<div class="instr-extra-image"${widthStyle ? ` style="${widthStyle}"` : ''}><img src="${block.imageUrl}" style="${maxW}" alt=""></div>`;
    }
    if (block.type === 'url' && block.url) {
      const label: string = block.urlLabel?.[lang] ?? block.urlLabel?.[Object.keys(block.urlLabel ?? {})[0]] ?? '';
      const qrImg = block.showQr !== false ? await generateQRCodeImage(block.url, { width: 128, margin: 1 }) : null;
      return `<div class="instr-extra-url"${widthStyle ? ` style="${widthStyle}"` : ''}>${qrImg ? `<img src="${qrImg}" class="url-qr" alt="QR">` : ''}<div class="instr-extra-url-info">${label ? `<div class="url-label">${escapeHtml(label)}</div>` : ''}<div class="url-text">${escapeHtml(block.url)}</div></div></div>`;
    }
    return '';
  }

  // ── Teacher survey section renderer ─────────────────────────────────────
  const teacherSurveyUrl = opts?.teacherSurveyUrl;
  const teacherSurvey = opts?.teacherSurvey;
  let teacherSurveyHtml = '';
  if (teacherSurvey?.enabled && teacherSurveyUrl) {
    const tsQr = await generateQRCodeImage(teacherSurveyUrl, { width: 256, margin: 1 });
    const tsTitle = teacherSurvey.title?.[lang] ?? teacherSurvey.title?.[Object.keys(teacherSurvey.title ?? {})[0]] ?? 'Teacher Survey';
    teacherSurveyHtml = `<div class="instr-teacher-survey">
      <h2>${escapeHtml(tsTitle)}</h2>
      ${tsQr ? `<img src="${tsQr}" class="ts-qr" alt="Survey QR">` : ''}
      <p class="ts-url">${escapeHtml(teacherSurveyUrl)}</p>
    </div>`;
  }

  // ── Split extra blocks by position and render ────────────────────────
  const allExtraBlocks = opts?.extraBlocks ?? [];

  // Render body extra blocks individually so we can interleave them with sections
  const bodyExtraBlocks = allExtraBlocks.filter(b => b.position === 'body');
  const bodyExtraHtmlArr = await Promise.all(bodyExtraBlocks.map(renderExtraBlock));
  const bodyExtraHtmlMap: Record<string, string> = {};
  bodyExtraBlocks.forEach((b, i) => { bodyExtraHtmlMap[b.id] = bodyExtraHtmlArr[i]; });

  const [afterHeaderParts, afterBodyParts, afterFooterParts] = await Promise.all([
    Promise.all(allExtraBlocks.filter(b => b.position === 'after-header').map(renderExtraBlock)),
    Promise.all(allExtraBlocks.filter(b => b.position === 'after-body').map(renderExtraBlock)),
    Promise.all(allExtraBlocks.filter(b => !b.position || b.position === 'after-footer').map(renderExtraBlock)),
  ]);
  const afterHeaderExtrasHtml = afterHeaderParts.filter(Boolean).length
    ? `<div class="instr-extras">${afterHeaderParts.filter(Boolean).join('\n')}</div>` : '';
  const afterBodyExtrasHtml  = afterBodyParts.filter(Boolean).length
    ? `<div class="instr-extras">${afterBodyParts.filter(Boolean).join('\n')}</div>` : '';
  const afterFooterExtrasHtml = afterFooterParts.filter(Boolean).length
    ? `<div class="instr-extras">${afterFooterParts.filter(Boolean).join('\n')}</div>` : '';

  // ── Body rows rendering ──────────────────────────────────────────────
  const fixedSectionHtmlMap: Record<string, string> = {
    klase:           klaseSection,
    pin:             pinSection,
    observer:        observerSection,
    'teacher-survey': teacherSurveyHtml,
  };

  let bodyHtml: string;
  if (opts?.bodyRows && opts.bodyRows.length > 0) {
    // Multi-row layout
    const rows = opts.bodyRows.map(row => {
      const cells = row.items
        .map(id => fixedSectionHtmlMap[id] ?? bodyExtraHtmlMap[id] ?? '')
        .filter(Boolean).join('\n    ');
      return cells ? `<div class="instr-body-row">${cells}</div>` : '';
    }).filter(Boolean).join('\n  ');
    bodyHtml = `<div class="instr-body">
  ${rows}
</div>`;
  } else {
    // Flat order (backward compat)
    const flatOrder = opts?.bodyItemOrder ?? [...sectionOrder, ...bodyExtraBlocks.map(b => b.id)];
    const referencedIds = new Set(flatOrder);
    const unreferencedBodyIds = bodyExtraBlocks.map(b => b.id).filter(id => !referencedIds.has(id));
    const effectiveOrder = [...flatOrder, ...unreferencedBodyIds];
    const cells = effectiveOrder
      .map(id => fixedSectionHtmlMap[id] ?? bodyExtraHtmlMap[id] ?? '')
      .filter(Boolean).join('\n    ');
    bodyHtml = `<div class="instr-body">
  <div class="instr-body-row">${cells}</div>
</div>`;
  }

  const pageClass = orientation === 'portrait' ? 'ws-page instr-page instr-portrait' : 'ws-page instr-page';
  return `<div class="${pageClass}">
  ${showHeader ? `<div class="instr-header"${headerStyle}><h1${tsToInlineStyle(ss.header?.headingStyle) ? ` style="${tsToInlineStyle(ss.header?.headingStyle)}"` : ''}>${l.title}</h1></div>` : ''}
  ${afterHeaderExtrasHtml}
  ${bodyHtml}
  ${afterBodyExtrasHtml}
  ${footerHtml}
  ${afterFooterExtrasHtml}
</div>`.trim();
}

/**
 * Generate a full printable A4-landscape HTML worksheet from a WorksheetLayout JSON.
 * Each element is absolutely positioned using %-based coordinates.
 *
 * @param layout       - The WorksheetLayout saved in viewer settings
 * @param qrCodeDataUrl - QR code image data URL
 * @param uvMapUrl     - UV map image URL for this model (or null)
 * @param modelName    - Name of the model (replaces {modelName} in text)
 * @param viewerName   - Name of the viewer (replaces {viewerName} in text)
 * @param uploadUrl    - URL to display below the QR code
 * @param markerIdBase - Base ArUco marker ID for this model (0, 4, 8, …)
 * @param lang         - Language code for text content (falls back to defaultLang)
 */
export function generateWorksheetFromLayout(
  layout: WorksheetLayout,
  qrCodeDataUrl: string,
  uvMapUrl: string | null | undefined,
  modelName: string,
  viewerName: string,
  uploadUrl: string | undefined,
  markerIdBase: number = 0,
  lang?: string,
  modelId?: string,
  innerOnly?: boolean,
  displayUploadUrl?: string,
): string {
  const useLang = lang ?? layout.defaultLang;
  const fallback = layout.defaultLang;

  function getText(el: WorksheetElement): string {
    // Per-model scope: look up modelContent[modelId][lang] first
    if (el.scope === 'per-model' && modelId && el.modelContent?.[modelId]) {
      const mc = el.modelContent[modelId];
      const raw = mc[useLang] ?? mc[fallback] ?? Object.values(mc)[0] ?? '';
      return escapeHtml(raw)
        .replace(/\{modelName\}/g, escapeHtml(modelName))
        .replace(/\{viewerName\}/g, escapeHtml(viewerName));
    }
    const raw =
      (el.content ?? {})[useLang] ??
      (el.content ?? {})[fallback] ??
      Object.values(el.content ?? {})[0] ??
      '';
    return escapeHtml(raw)
      .replace(/\{modelName\}/g, escapeHtml(modelName))
      .replace(/\{viewerName\}/g, escapeHtml(viewerName));
  }

  function getImageUrl(el: WorksheetElement): string | undefined {
    if (el.scope === 'per-model' && modelId && el.modelImageUrl?.[modelId]) {
      return el.modelImageUrl[modelId];
    }
    return el.imageUrl;
  }

  const tl = generateArucoMarkerSVG(markerIdBase);
  const tr = generateArucoMarkerSVG(markerIdBase + 1);
  const br = generateArucoMarkerSVG(markerIdBase + 2);
  const bl = generateArucoMarkerSVG(markerIdBase + 3);

  const MARKER_SIZE = '15mm';

  const elementsHtml = layout.elements.map(el => {
    const pos = `position:absolute;left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;box-sizing:border-box;overflow:hidden;`;

    if (el.type === 'texture-zone') {
      const uvStyle = uvMapUrl
        ? `background-image:url('${uvMapUrl}');background-size:100% 100%;background-repeat:no-repeat;background-position:center;`
        : '';
      return `
<div style="${pos}${uvStyle}">
  <div style="position:absolute;top:0;left:0;width:${MARKER_SIZE};height:${MARKER_SIZE};background:white;">${tl}</div>
  <div style="position:absolute;top:0;right:0;width:${MARKER_SIZE};height:${MARKER_SIZE};background:white;">${tr}</div>
  <div style="position:absolute;bottom:0;right:0;width:${MARKER_SIZE};height:${MARKER_SIZE};background:white;">${br}</div>
  <div style="position:absolute;bottom:0;left:0;width:${MARKER_SIZE};height:${MARKER_SIZE};background:white;">${bl}</div>
  ${!uvMapUrl ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20pt;color:#ccc;font-weight:bold;text-align:center;pointer-events:none;">PAINT OR COLOR<br>THIS AREA</div>` : ''}
</div>`.trim();
    }

    if (el.type === 'qr-zone') {
      return `
<div style="${pos}display:flex;flex-direction:row;align-items:flex-end;justify-content:flex-start;gap:3px;padding:4px;box-sizing:border-box;overflow:hidden;">
  <img src="${qrCodeDataUrl}" alt="QR Code" style="flex-shrink:0;height:80%;width:auto;aspect-ratio:1/1;display:block;">
  <div style="display:flex;flex-direction:column;justify-content:flex-end;min-width:0;gap:2px;">
    <div style="font-size:7pt;font-weight:600;color:#555;white-space:nowrap;">Scan QR</div>
    <div style="font-size:5.5pt;color:#999;word-break:break-all;line-height:1.3;">${escapeHtml(displayUploadUrl || uploadUrl || '')}</div>
  </div>
</div>`.trim();
    }

    if (el.type === 'arrow') {
      const color = escapeHtml(el.arrowColor ?? '#333333');
      return `<div style="${pos}display:flex;align-items:center;justify-content:center;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>`;
    }

    if (el.type === 'image') {
      const imgUrl = getImageUrl(el);
      return imgUrl
        ? `<div style="${pos}"><img src="${imgUrl}" alt="" style="width:100%;height:100%;object-fit:${el.objectFit ?? 'contain'};"></div>`
        : `<div style="${pos}"></div>`;
    }

    // text
    const ts = el.textStyle;
    const textStyle = ts
      ? `font-size:${ts.fontSize}pt;font-weight:${ts.fontWeight};font-style:${ts.fontStyle};color:${ts.color};text-align:${ts.textAlign};${ts.backgroundColor ? `background-color:${ts.backgroundColor};` : ''}${ts.padding ? `padding:${ts.padding}px;` : ''}white-space:pre-wrap;line-height:1.4;`
      : 'font-size:10pt;color:#333333;white-space:pre-wrap;line-height:1.4;';
    return `<div style="${pos}${textStyle}">${getText(el)}</div>`;
  }).join('\n');

  // When embedding inside wrapWorksheetPages, return just the page div
  if (innerOnly) {
    return `<div class="ws-page" style="background:${layout.pageBackground ?? 'white'}">\n    ${elementsHtml}\n  </div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(modelName)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: white; }
    .ws-page { width: 297mm; height: 210mm; position: relative; overflow: hidden; background: ${layout.pageBackground ?? 'white'}; page-break-after: always; }
  </style>
</head>
<body>
  <div class="ws-page">
    ${elementsHtml}
  </div>
</body>
</html>`.trim();
}
