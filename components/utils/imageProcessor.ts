import { ProcessedTexture, TextureProcessingOptions } from '@/lib/types/texture';

declare const cv: any;

// Resolved OpenCV module (handles builds that export a Promise)
let cvModule: any = null;
let cvReady = false;
let cvLoadingPromise: Promise<void> | null = null;

async function ensureOpenCVLoaded(): Promise<void> {
  if (cvReady && cvModule) {
    console.log('✅ OpenCV already loaded, skipping');
    return;
  }

  // If already loading, wait for that promise
  if (cvLoadingPromise) {
    console.log('⏳ OpenCV already loading, waiting...');
    return cvLoadingPromise;
  }

  // Create the loading promise
  cvLoadingPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('OpenCV.js can only be used in browser environment');
    }

    // If a global `cv` exists already
    if (typeof cv !== 'undefined') {
      console.log('🔍 Found global cv object');
      // Some builds expose `cv` as a Promise (cv.then)
      if (typeof (cv as any).then === 'function') {
        console.log('OpenCV provided as a Promise, awaiting resolution...');
        try {
          cvModule = await cv; // await the promise
          console.log('✅ Promise resolved successfully');
          console.log('📦 cvModule type:', typeof cvModule);
          console.log('📦 cvModule has imread?', typeof cvModule?.imread);
        } catch (err) {
          console.error('❌ Failed to await cv Promise:', err);
          cvLoadingPromise = null;
          throw new Error('Failed to resolve OpenCV Promise');
        }
      } else {
        console.log('✅ Using direct cv object');
        cvModule = cv; // direct object
      }
      
      // Verify cvModule is valid
      if (!cvModule || typeof cvModule.imread !== 'function') {
        console.error('❌ cvModule is invalid or missing imread');
        console.log('Available keys:', Object.keys(cvModule || {}).slice(0, 20));
        cvLoadingPromise = null;
        throw new Error('OpenCV module is not properly initialized');
      }
      
      cvReady = true;
      console.log('✅ OpenCV.js ready');
      return;
    }

    console.log('🔄 Loading OpenCV.js from /opencv/opencv.js...');
    
    // Otherwise, dynamically load from public folder
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/opencv/opencv.js';
      script.async = true;

      script.onload = async () => {
        console.log('📥 OpenCV.js script loaded');

        // Some distributions attach a Promise to `cv` (e.g. cv.then(...))
        const start = Date.now();
        const checkReady = setInterval(async () => {
          try {
            if (typeof (window as any).cv !== 'undefined') {
              const maybeCv = (window as any).cv;
              console.log('🔍 Checking cv readiness...', typeof maybeCv);
              
              if (typeof maybeCv.then === 'function') {
                console.log('⏳ Awaiting cv Promise...');
                cvModule = await maybeCv;
                console.log('✅ cv Promise resolved');
              } else {
                cvModule = maybeCv;
                console.log('✅ Using direct cv object');
              }

              if (cvModule && typeof cvModule.imread === 'function') {
                clearInterval(checkReady);
                cvReady = true;
                console.log('✅ OpenCV.js ready (from loaded script)');
                console.log('📦 Available ArUco functions:', Object.keys(cvModule).filter(k => k.toLowerCase().includes('aruco')).slice(0, 10));
                resolve();
              } else {
                console.log('⏳ Still waiting for valid cvModule...');
              }
            }
          } catch (err) {
            console.log('⚠️ Transient error during initialization:', err);
            // ignore transient errors while module initializes
          }

          if (Date.now() - start > 30000) {
            clearInterval(checkReady);
            console.error('❌ OpenCV.js failed to initialize after 30 seconds');
            cvLoadingPromise = null;
            reject(new Error('OpenCV.js failed to initialize after 30 seconds'));
          }
        }, 100);
      };

      script.onerror = () => {
        console.error('❌ Failed to load OpenCV.js script');
        cvLoadingPromise = null;
        reject(new Error('Failed to load OpenCV.js'));
      };
      
      document.head.appendChild(script);
    });
  })();

  return cvLoadingPromise;
}

interface DetectedMarker {
  id: number;
  corners: { x: number; y: number }[];
}

interface CornerPoints {
  top_left: { x: number; y: number };
  top_right: { x: number; y: number };
  bottom_right: { x: number; y: number };
  bottom_left: { x: number; y: number };
}

// Marker ID map: defines which marker ID corresponds to which corner
const MARKER_ID_MAP: { [key: number]: keyof CornerPoints } = {
  0: 'top_left',
  1: 'top_right',
  2: 'bottom_right',
  3: 'bottom_left'
};

// ArUco corner index mapping:
// 0: top-left, 1: top-right, 2: bottom-right, 3: bottom-left
const MARKER_CORNER_MAP: { [key: string]: number } = {
  'top_left': 0,
  'top_right': 1,
  'bottom_right': 2,
  'bottom_left': 3
};

async function detectArucoMarkers(canvas: HTMLCanvasElement): Promise<DetectedMarker[] | null> {
  if (!cvModule) {
    throw new Error('OpenCV module not initialized');
  }

  const cvm = cvModule;

  try {
    console.log('🔍 Starting ArUco marker detection...');
    
    // Read image at full resolution
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = canvas.width;
    tmpCanvas.height = canvas.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    if (!tmpCtx) throw new Error('Could not get canvas context');
    tmpCtx.drawImage(canvas, 0, 0);

    const src = cvm.imread(tmpCanvas);
    console.log('📸 Image loaded at full resolution:', src.cols, 'x', src.rows);

    // Convert to grayscale for ArUco detection
    const gray = new cvm.Mat();
    cvm.cvtColor(src, gray, cvm.COLOR_RGBA2GRAY, 0);
    console.log('⚫ Converted to grayscale');

    // Check if ArUco functions are available
    console.log('🔍 Checking ArUco availability...');
    console.log('   - aruco_Dictionary:', typeof cvm.aruco_Dictionary);
    console.log('   - aruco_getPredefinedDictionary:', typeof cvm.aruco_getPredefinedDictionary);
    console.log('   - getPredefinedDictionary:', typeof cvm.getPredefinedDictionary);
    console.log('   - DICT_6X6_250:', typeof cvm.DICT_6X6_250);
    
    if (typeof cvm.aruco_Dictionary === 'undefined') {
      console.error('❌ ArUco module not found in this OpenCV.js build');
      console.log('📦 Available modules:', Object.keys(cvm).filter(k => k.includes('aruco') || k.includes('DICT')));
      throw new Error('ArUco module not found in this OpenCV.js build. Please rebuild with objdetect module.');
    }

    // Create ArUco dictionary using the predefined dictionary type
    let dictionary;
    if (typeof cvm.aruco_getPredefinedDictionary === 'function') {
      console.log('✅ Using cv.aruco_getPredefinedDictionary');
      dictionary = cvm.aruco_getPredefinedDictionary(cvm.DICT_6X6_250);
    } else if (typeof cvm.getPredefinedDictionary === 'function') {
      console.log('✅ Using cv.getPredefinedDictionary');
      dictionary = cvm.getPredefinedDictionary(cvm.DICT_6X6_250);
    } else {
      // Try creating dictionary with the predefined type using constructor
      console.log('🔧 Trying constructor with predefined dictionary type enum');
      try {
        dictionary = new cvm.aruco_Dictionary(cvm.DICT_6X6_250);
        console.log('✅ Dictionary created with single parameter (enum)');
      } catch (e1) {
        console.log('❌ Single param failed:', e1);
        try {
          if (typeof cvm.aruco_Dictionary.create === 'function') {
            dictionary = cvm.aruco_Dictionary.create(cvm.DICT_6X6_250);
            console.log('✅ Dictionary created with static create method');
          } else {
            throw new Error('No create method');
          }
        } catch (e2) {
          console.log('❌ Create method failed:', e2);
          throw new Error('Unable to load predefined ArUco dictionary.');
        }
      }
    }

    console.log('📚 Dictionary created successfully');

    // Create detector parameters
    const detectorParams = new cvm.aruco_DetectorParameters();
    console.log('⚙️ Detector parameters created');

    // Create detector with refine parameters
    let refineParams;
    let detector;

    console.log('🔧 Creating ArUco detector...');
    try {
      refineParams = new cvm.aruco_RefineParameters(10.0, 3.0, true);
      detector = new cvm.aruco_ArucoDetector(dictionary, detectorParams, refineParams);
      console.log('✅ Detector created with RefineParameters(10.0, 3.0, true)');
    } catch (e1) {
      console.log('⚠️ Failed with (10.0, 3.0, true):', e1);
      try {
        refineParams = new cvm.aruco_RefineParameters(10, 3, 1);
        detector = new cvm.aruco_ArucoDetector(dictionary, detectorParams, refineParams);
        console.log('✅ Detector created with RefineParameters(10, 3, 1)');
      } catch (e2) {
        console.log('⚠️ Failed with (10, 3, 1):', e2);
        try {
          refineParams = new cvm.aruco_RefineParameters(10.0, 3.0, 1);
          detector = new cvm.aruco_ArucoDetector(dictionary, detectorParams, refineParams);
          console.log('✅ Detector created with RefineParameters(10.0, 3.0, 1)');
        } catch (e3) {
          console.log('❌ All RefineParameters attempts failed:', e3);
          throw new Error('Could not create ArUco detector.');
        }
      }
    }

    // Vectors to store detected marker corners and IDs
    const markerCorners = new cvm.MatVector();
    const markerIds = new cvm.Mat();
    const rejectedCandidates = new cvm.MatVector();

    console.log('🎯 Detecting markers...');
    // Detect markers
    detector.detectMarkers(gray, markerCorners, markerIds, rejectedCandidates);

    const numMarkers = markerIds.rows;
    console.log('✅ ArUco markers detected:', numMarkers);

    if (numMarkers === 0) {
      console.log('❌ No ArUco markers detected in the image');
      src.delete();
      gray.delete();
      markerCorners.delete();
      markerIds.delete();
      rejectedCandidates.delete();
      return null;
    }

    // Extract markers
    const detectedMarkers: DetectedMarker[] = [];
    const detectedIds: number[] = [];
    
    for (let i = 0; i < numMarkers; i++) {
      const markerId = markerIds.intAt(i, 0);
      detectedIds.push(markerId);
      const corners = markerCorners.get(i);

      // Extract all 4 corners of the marker
      const markerCornerPoints: { x: number; y: number }[] = [];
      for (let j = 0; j < 4; j++) {
        let x, y;
        if (corners.channels() === 2) {
          const point = corners.floatPtr(0, j);
          x = point[0];
          y = point[1];
        } else {
          x = corners.floatAt(0, j * 2);
          y = corners.floatAt(0, j * 2 + 1);
        }
        markerCornerPoints.push({ x, y });
      }

      detectedMarkers.push({
        id: markerId,
        corners: markerCornerPoints
      });

      console.log(`  📍 Marker ${markerId}: corners =`, markerCornerPoints.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`));
    }

    console.log('🔍 Detected marker IDs:', detectedIds);
    console.log('🗺️ Expected marker IDs:', [0, 1, 2, 3]);

    // Clean up
    src.delete();
    gray.delete();
    markerCorners.delete();
    markerIds.delete();
    rejectedCandidates.delete();

    return detectedMarkers;
  } catch (error) {
    console.error('❌ Error detecting ArUco markers:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
    }
    return null;
  }
}

async function correctPerspective(
  canvas: HTMLCanvasElement,
  markers: DetectedMarker[],
  targetSize: number
): Promise<HTMLCanvasElement | null> {
  if (!cvModule) {
    throw new Error('OpenCV module not initialized');
  }

  const cvm = cvModule;

  try {
    console.log('🔧 Starting perspective correction...');
    console.log('  Input image size:', canvas.width, 'x', canvas.height);
    console.log('  Number of markers to process:', markers.length);

    // Map detected markers to their corner positions
    const srcPoints: Partial<CornerPoints> = {};

    for (const marker of markers) {
      if (marker.id in MARKER_ID_MAP) {
        const cornerName = MARKER_ID_MAP[marker.id];
        const cornerIndex = MARKER_CORNER_MAP[cornerName];

        // Get the specific corner point of the marker
        const corner = marker.corners[cornerIndex];
        srcPoints[cornerName] = corner;

        console.log(`  Marker ${marker.id} (${cornerName}): corner[${cornerIndex}] at (${corner.x.toFixed(1)}, ${corner.y.toFixed(1)})`);
      }
    }

    // Check if we have all 4 required corner points
    const requiredCorners: (keyof CornerPoints)[] = ['top_left', 'top_right', 'bottom_right', 'bottom_left'];
    const missingCorners = requiredCorners.filter(c => !(c in srcPoints));

    if (missingCorners.length > 0) {
      console.log(`❌ Error: Could not match ${missingCorners.length} required marker ID(s) to corner positions.`);
      console.log(`   Missing corners: ${missingCorners.join(', ')}`);
      return null;
    }

    const fullSrcPoints = srcPoints as CornerPoints;
    console.log('✅ All 4 corner markers matched!');

    // Read the canvas into OpenCV Mat
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = canvas.width;
    tmpCanvas.height = canvas.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    if (!tmpCtx) throw new Error('Could not get canvas context');
    tmpCtx.drawImage(canvas, 0, 0);

    const image = cvm.imread(tmpCanvas);

    // Create source and destination points for perspective transform
    const srcPointsArray = cvm.matFromArray(4, 1, cvm.CV_32FC2, [
      fullSrcPoints.top_left.x, fullSrcPoints.top_left.y,
      fullSrcPoints.top_right.x, fullSrcPoints.top_right.y,
      fullSrcPoints.bottom_right.x, fullSrcPoints.bottom_right.y,
      fullSrcPoints.bottom_left.x, fullSrcPoints.bottom_left.y
    ]);

    // Destination points (corners of target size image)
    const dstPointsArray = cvm.matFromArray(4, 1, cvm.CV_32FC2, [
      0, 0,
      targetSize - 1, 0,
      targetSize - 1, targetSize - 1,
      0, targetSize - 1
    ]);

    console.log('Source points created:', srcPointsArray.rows, 'x', srcPointsArray.cols);
    console.log('Destination points created:', dstPointsArray.rows, 'x', dstPointsArray.cols);

    // Calculate perspective transform matrix
    const M = cvm.getPerspectiveTransform(srcPointsArray, dstPointsArray);

    // Apply perspective warp with highest-quality interpolation
    const corrected = new cvm.Mat();
    const dsize = new cvm.Size(targetSize, targetSize);

    console.log('  Using interpolation method: CUBIC (high quality)');
    cvm.warpPerspective(image, corrected, M, dsize, cvm.INTER_CUBIC, cvm.BORDER_CONSTANT, new cvm.Scalar());

    console.log('✅ Successfully corrected perspective!');
    console.log('  Output image size:', corrected.cols, 'x', corrected.rows);

    // Apply white balance using background (matching crop.py)
    console.log('🎨 Applying white balance based on background...');
    const whiteBalanced = whiteBalanceUsingBackground(corrected);

    // Apply color, contrast, and sharpness enhancement (matching crop.py)
    console.log('🎨 Applying color and sharpness enhancements...');
    const enhanced = applyAutoColorAndSharpness(whiteBalanced);

    // Create output canvas
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = targetSize;
    outputCanvas.height = targetSize;
    cvm.imshow(outputCanvas, enhanced);

    // Clean up
    srcPointsArray.delete();
    dstPointsArray.delete();
    M.delete();
    image.delete();
    corrected.delete();
    whiteBalanced.delete();
    enhanced.delete();

    return outputCanvas;
  } catch (error) {
    console.error('Error in perspective correction:', error);
    return null;
  }
}

function whiteBalanceUsingBackground(image: any, sampleBorder: number = 40): any {
  if (!cvModule) return image;
  const cvm = cvModule;

  try {
    // Matching crop.py: white_balance_using_background
    const h = image.rows;
    const w = image.cols;
    const border = Math.max(5, Math.min(sampleBorder, Math.floor(h / 4), Math.floor(w / 4)));

    console.log(`  📏 Sampling border: ${border}px from edges`);

    // Convert to RGB if needed
    let rgb: any;
    if (image.channels() === 4) {
      rgb = new cvm.Mat();
      cvm.cvtColor(image, rgb, cvm.COLOR_RGBA2RGB);
    } else {
      rgb = image.clone();
    }

    // Extract border regions (top, bottom, left, right)
    const top = rgb.roi(new cvm.Rect(0, 0, w, border));
    const bottom = rgb.roi(new cvm.Rect(0, h - border, w, border));
    const left = rgb.roi(new cvm.Rect(0, 0, border, h));
    const right = rgb.roi(new cvm.Rect(w - border, 0, border, h));

    // Calculate mean BGR of all border samples
    const topMean = cvm.mean(top);
    const bottomMean = cvm.mean(bottom);
    const leftMean = cvm.mean(left);
    const rightMean = cvm.mean(right);

    // Average all border means
    const meanBGR = [
      (topMean[0] + bottomMean[0] + leftMean[0] + rightMean[0]) / 4 + 1e-6,
      (topMean[1] + bottomMean[1] + leftMean[1] + rightMean[1]) / 4 + 1e-6,
      (topMean[2] + bottomMean[2] + leftMean[2] + rightMean[2]) / 4 + 1e-6
    ];

    console.log(`  📊 Border mean BGR: [${meanBGR[0].toFixed(1)}, ${meanBGR[1].toFixed(1)}, ${meanBGR[2].toFixed(1)}]`);

    // Target white point (matching crop.py: 240, 240, 240)
    const target = [240.0, 240.0, 240.0];
    const scale = [
      target[0] / meanBGR[0],
      target[1] / meanBGR[1],
      target[2] / meanBGR[2]
    ];

    console.log(`  🎨 White balance scales: [${scale[0].toFixed(2)}, ${scale[1].toFixed(2)}, ${scale[2].toFixed(2)}]`);

    // Apply scaling to each channel
    const balanced = new cvm.Mat();
    rgb.convertTo(balanced, cvm.CV_32F);

    const channels = new cvm.MatVector();
    cvm.split(balanced, channels);

    const scaledChannels = new cvm.MatVector();
    for (let i = 0; i < 3; i++) {
      const ch = channels.get(i);
      const scaled = new cvm.Mat();
      ch.convertTo(scaled, -1, scale[i], 0);
      scaledChannels.push_back(scaled);
      scaled.delete();
    }

    const result32f = new cvm.Mat();
    cvm.merge(scaledChannels, result32f);

    // Clip to 0-255 using convertScaleAbs or by direct conversion with saturation
    const result = new cvm.Mat();
    // The conversion to CV_8U automatically clips to 0-255
    result32f.convertTo(result, cvm.CV_8U);

    // Convert back to RGBA if needed
    let finalResult;
    if (image.channels() === 4) {
      finalResult = new cvm.Mat();
      cvm.cvtColor(result, finalResult, cvm.COLOR_RGB2RGBA);
      result.delete();
    } else {
      finalResult = result;
    }

    // Clean up
    top.delete();
    bottom.delete();
    left.delete();
    right.delete();
    rgb.delete();
    balanced.delete();
    channels.delete();
    scaledChannels.delete();
    result32f.delete();

    console.log('✅ White balance applied using background');
    return finalResult;
  } catch (error) {
    console.error('⚠️ Error during white balance, returning original:', error);
    return image.clone();
  }
}

function applyAutoColorAndSharpness(image: any): any {
  if (!cvModule) return image;
  const cvm = cvModule;

  try {
    // Matching crop.py enhancement factors
    const brightnessFactor = 0.95;
    const contrastFactor = 1.1;
    const saturationFactor = 1.05;
    const sharpnessFactor = 1.3;

    console.log('  🎨 Applying brightness, contrast, saturation...');

    // Convert to float for processing
    const float32 = new cvm.Mat();
    image.convertTo(float32, cvm.CV_32F, 1.0 / 255.0);

    // Apply brightness (matching crop.py: 0.95)
    const brightened = new cvm.Mat();
    float32.convertTo(brightened, -1, brightnessFactor, 0);

    // Apply contrast (matching crop.py: 1.1)
    // contrast = (image - 0.5) * factor + 0.5
    const shifted = new cvm.Mat();
    brightened.convertTo(shifted, -1, 1.0, -0.5);
    const contrasted = new cvm.Mat();
    shifted.convertTo(contrasted, -1, contrastFactor, 0.5);

    // Apply saturation (matching crop.py: 1.05)
    // Convert to HSV, scale saturation, convert back
    const hsv = new cvm.Mat();
    let rgb: any;
    if (contrasted.channels() === 4) {
      rgb = new cvm.Mat();
      cvm.cvtColor(contrasted, rgb, cvm.COLOR_RGBA2RGB);
    } else {
      rgb = contrasted.clone();
    }
    cvm.cvtColor(rgb, hsv, cvm.COLOR_RGB2HSV);

    const hsvChannels = new cvm.MatVector();
    cvm.split(hsv, hsvChannels);
    const sChannel = hsvChannels.get(1);
    const sScaled = new cvm.Mat();
    sChannel.convertTo(sScaled, -1, saturationFactor, 0);

    // Rebuild channels with scaled saturation
    const hsvChannelsScaled = new cvm.MatVector();
    hsvChannelsScaled.push_back(hsvChannels.get(0)); // H
    hsvChannelsScaled.push_back(sScaled);             // S (scaled)
    hsvChannelsScaled.push_back(hsvChannels.get(2)); // V

    const hsvScaled = new cvm.Mat();
    cvm.merge(hsvChannelsScaled, hsvScaled);

    const saturated = new cvm.Mat();
    cvm.cvtColor(hsvScaled, saturated, cvm.COLOR_HSV2RGB);

    // Convert back to uint8
    const uint8Result = new cvm.Mat();
    saturated.convertTo(uint8Result, cvm.CV_8U, 255.0);

    console.log('  ✨ Applying sharpness enhancement...');

    // Apply sharpening using unsharp mask (matching crop.py: 1.3)
    const blurred = new cvm.Mat();
    cvm.GaussianBlur(uint8Result, blurred, new cvm.Size(0, 0), 2.0);

    const sharpened = new cvm.Mat();
    const weight = sharpnessFactor - 1.0;
    cvm.addWeighted(uint8Result, 1.0 + weight, blurred, -weight, 0, sharpened);

    // Convert back to RGBA if needed
    let finalResult;
    if (image.channels() === 4) {
      finalResult = new cvm.Mat();
      cvm.cvtColor(sharpened, finalResult, cvm.COLOR_RGB2RGBA);
      sharpened.delete();
    } else {
      finalResult = sharpened;
    }

    // Clean up
    float32.delete();
    brightened.delete();
    shifted.delete();
    contrasted.delete();
    hsv.delete();
    rgb.delete();
    hsvChannels.delete();
    sScaled.delete();
    hsvChannelsScaled.delete();
    hsvScaled.delete();
    saturated.delete();
    uint8Result.delete();
    blurred.delete();

    console.log('✅ Color and sharpness enhancement applied');
    return finalResult;
  } catch (error) {
    console.error('⚠️ Error during enhancement, returning original:', error);
    return image.clone();
  }
}

async function autoWhiteBalance(image: any): Promise<any> {
  if (!cvModule) {
    throw new Error('OpenCV module not initialized');
  }

  const cvm = cvModule;

  try {
    // Split RGB channels
    const channels = new cvm.MatVector();
    cvm.split(image, channels);

    // Calculate mean for each channel (gray world assumption)
    const means = [
      cvm.mean(channels.get(0))[0],
      cvm.mean(channels.get(1))[0],
      cvm.mean(channels.get(2))[0]
    ];

    const avgGray = (means[0] + means[1] + means[2]) / 3;

    // Calculate scaling factors
    const scaleFactors = [
      avgGray / means[0],
      avgGray / means[1],
      avgGray / means[2]
    ];

    console.log(`  📊 White balance scales: R=${scaleFactors[0].toFixed(2)}, G=${scaleFactors[1].toFixed(2)}, B=${scaleFactors[2].toFixed(2)}`);

    // Apply scaling to each channel
    const balancedChannels = new cvm.MatVector();
    for (let i = 0; i < 3; i++) {
      const scaled = new cvm.Mat();
      cvm.multiply(channels.get(i), new cvm.Mat(channels.get(i).rows, channels.get(i).cols, channels.get(i).type(), new cvm.Scalar(scaleFactors[i])), scaled);
      balancedChannels.push_back(scaled);
      scaled.delete();
    }

    // Merge channels back
    const result = new cvm.Mat();
    cvm.merge(balancedChannels, result);

    // Clean up
    channels.delete();
    balancedChannels.delete();

    return result;
  } catch (error) {
    console.error('⚠️ Error during white balance, returning original:', error);
    return image.clone();
  }
}




// Boundary detection methods (alternative to ArUco markers)
function orderCorners(corners: { x: number; y: number }[]): { x: number; y: number }[] {
  const center = {
    x: corners.reduce((sum, p) => sum + p.x, 0) / corners.length,
    y: corners.reduce((sum, p) => sum + p.y, 0) / corners.length
  };

  const withAngles = corners.map(p => ({
    point: p,
    angle: Math.atan2(p.y - center.y, p.x - center.x)
  }));

  withAngles.sort((a, b) => a.angle - b.angle);
  const ordered = withAngles.map(a => a.point);

  if (ordered[1].x < ordered[3].x) {
    return [ordered[0], ordered[3], ordered[2], ordered[1]];
  }

  return ordered;
}

function findSquareWithHoughLines(edges: any, originalImg: any): { x: number; y: number }[] | null {
  if (!cvModule) return null;
  const cvm = cvModule;

  try {
    const imgHeight = edges.rows;
    const imgWidth = edges.cols;

    // Matching crop.py: threshold=100
    const lines = new cvm.Mat();
    cvm.HoughLines(edges, lines, 1, Math.PI / 180, 100, 0, 0, 0, Math.PI);

    if (lines.rows === 0) {
      lines.delete();
      console.log('  ⚠️ No Hough lines found');
      return null;
    }

    console.log(`📏 Found ${lines.rows} Hough lines`);

    const horizontalLines: { rho: number; theta: number }[] = [];
    const verticalLines: { rho: number; theta: number }[] = [];

    // Matching crop.py angle tolerance
    for (let i = 0; i < lines.rows; i++) {
      const rho = lines.data32F[i * 2];
      const theta = lines.data32F[i * 2 + 1];

      if (Math.abs(theta) < Math.PI / 4 || Math.abs(theta - Math.PI) < Math.PI / 4) {
        horizontalLines.push({ rho, theta });
      } else if (Math.abs(theta - Math.PI / 2) < Math.PI / 4) {
        verticalLines.push({ rho, theta });
      }
    }

    lines.delete();

    console.log(`  📊 H-lines: ${horizontalLines.length}, V-lines: ${verticalLines.length}`);

    if (horizontalLines.length < 2 || verticalLines.length < 2) {
      console.log('  ⚠️ Not enough horizontal or vertical lines');
      return null;
    }

    // Sort by rho
    horizontalLines.sort((a, b) => a.rho - b.rho);
    verticalLines.sort((a, b) => a.rho - b.rho);

    // Get extreme lines (first and last)
    const hLines = [horizontalLines[0], horizontalLines[horizontalLines.length - 1]];
    const vLines = [verticalLines[0], verticalLines[verticalLines.length - 1]];

    // Visualize detected lines
    if (debugCallback && originalImg) {
      const visLines = originalImg.clone();
      for (const { rho, theta } of hLines) {
        const a = Math.cos(theta);
        const b = Math.sin(theta);
        const x0 = a * rho;
        const y0 = b * rho;
        const pt1 = new cvm.Point(Math.round(x0 + 1000 * (-b)), Math.round(y0 + 1000 * a));
        const pt2 = new cvm.Point(Math.round(x0 - 1000 * (-b)), Math.round(y0 - 1000 * a));
        cvm.line(visLines, pt1, pt2, new cvm.Scalar(0, 255, 0, 255), 2);
      }
      for (const { rho, theta } of vLines) {
        const a = Math.cos(theta);
        const b = Math.sin(theta);
        const x0 = a * rho;
        const y0 = b * rho;
        const pt1 = new cvm.Point(Math.round(x0 + 1000 * (-b)), Math.round(y0 + 1000 * a));
        const pt2 = new cvm.Point(Math.round(x0 - 1000 * (-b)), Math.round(y0 - 1000 * a));
        cvm.line(visLines, pt1, pt2, new cvm.Scalar(255, 0, 0, 255), 2);
      }
      debugShowImage('05a_hough_lines_detected', visLines);
      visLines.delete();
    }

    // Find intersections (matching crop.py exactly)
    const corners: { x: number; y: number }[] = [];
    for (const hLine of hLines) {
      for (const vLine of vLines) {
        const A = [
          [Math.cos(hLine.theta), Math.sin(hLine.theta)],
          [Math.cos(vLine.theta), Math.sin(vLine.theta)]
        ];
        const b = [hLine.rho, vLine.rho];

        // Solve 2x2 linear system
        const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
        if (Math.abs(det) < 1e-10) continue;

        const x = (A[1][1] * b[0] - A[0][1] * b[1]) / det;
        const y = (A[0][0] * b[1] - A[1][0] * b[0]) / det;

        console.log(`    Intersection: (${x.toFixed(1)}, ${y.toFixed(1)})`);

        // Check if point is within image bounds (matching crop.py: 0 <= point[0] < w)
        if (x >= 0 && x < imgWidth && y >= 0 && y < imgHeight) {
          corners.push({ x, y });
        }
      }
    }

    console.log(`  📍 Found ${corners.length} valid corner intersections`);

    if (corners.length === 4) {
      console.log('✅ Square found using Hough Lines');
      return orderCorners(corners);
    }

    return null;
  } catch (error) {
    console.error('Error in Hough Lines detection:', error);
    return null;
  }
}

function findSquareWithContours(edges: any, originalImg?: any): { x: number; y: number }[] | null {
  if (!cvModule) return null;
  const cvm = cvModule;

  try {
    const contours = new cvm.MatVector();
    const hierarchy = new cvm.Mat();
    // Matching crop.py: RETR_TREE, CHAIN_APPROX_SIMPLE
    cvm.findContours(edges, contours, hierarchy, cvm.RETR_TREE, cvm.CHAIN_APPROX_SIMPLE);

    if (contours.size() === 0) {
      contours.delete();
      hierarchy.delete();
      console.log('  ⚠️ No contours found');
      return null;
    }

    const imageArea = edges.rows * edges.cols;
    const minArea = 0.02 * imageArea; // Matching crop.py
    const candidates: { area: number; corners: { x: number; y: number }[]; approxPoints: number }[] = [];

    console.log(`📊 Found ${contours.size()} contours, filtering...`);

    // Visualize all contours
    if (debugCallback && originalImg) {
      const visContours = originalImg.clone();
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const color = new cvm.Scalar(
          Math.random() * 255,
          Math.random() * 255,
          Math.random() * 255,
          255
        );
        const contoursVec = new cvm.MatVector();
        contoursVec.push_back(cnt);
        cvm.drawContours(visContours, contoursVec, 0, color, 2);
        contoursVec.delete();
      }
      debugShowImage('05b_all_contours', visContours);
      visContours.delete();
    }

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cvm.contourArea(cnt);

      if (area < minArea) {
        cnt.delete();
        continue;
      }

      const peri = cvm.arcLength(cnt, true);
      const approx = new cvm.Mat();
      cvm.approxPolyDP(cnt, approx, 0.02 * peri, true); // Matching crop.py

      console.log(`  Contour ${i}: area=${area.toFixed(0)}, approx points=${approx.rows}`);

      if (approx.rows === 4) {
        const corners: { x: number; y: number }[] = [];
        for (let j = 0; j < 4; j++) {
          corners.push({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1]
          });
        }
        candidates.push({ area, corners, approxPoints: 4 });
      } else if (approx.rows >= 4) {
        // If more than 4 points, use minAreaRect (matching crop.py)
        const rect = cvm.minAreaRect(cnt);
        const box = cvm.RotatedRect.points(rect);
        const corners: { x: number; y: number }[] = [];
        for (let j = 0; j < 4; j++) {
          corners.push({ x: box[j].x, y: box[j].y });
        }
        candidates.push({ area, corners, approxPoints: approx.rows });
      }

      approx.delete();
      cnt.delete();
    }

    contours.delete();
    hierarchy.delete();

    console.log(`  📋 Found ${candidates.length} candidates`);

    if (candidates.length > 0) {
      // Sort by area descending (matching crop.py)
      candidates.sort((a, b) => b.area - a.area);
      console.log(`✅ Square found using contour (area: ${candidates[0].area.toFixed(0)}, points: ${candidates[0].approxPoints})`);

      // Visualize best candidate
      if (debugCallback && originalImg) {
        const visBest = originalImg.clone();
        const corners = candidates[0].corners;
        for (let i = 0; i < corners.length; i++) {
          cvm.circle(visBest, new cvm.Point(corners[i].x, corners[i].y), 10, new cvm.Scalar(0, 255, 0, 255), -1);
        }
        for (let i = 0; i < 4; i++) {
          const pt1 = new cvm.Point(corners[i].x, corners[i].y);
          const pt2 = new cvm.Point(corners[(i + 1) % 4].x, corners[(i + 1) % 4].y);
          cvm.line(visBest, pt1, pt2, new cvm.Scalar(255, 0, 0, 255), 3);
        }
        debugShowImage('05c_best_contour', visBest);
        visBest.delete();
      }

      return orderCorners(candidates[0].corners);
    }

    return null;
  } catch (error) {
    console.error('Error in contour detection:', error);
    return null;
  }
}

// Debug callback for visual debugging
let debugCallback: ((step: string, canvas: HTMLCanvasElement) => void) | null = null;

export function setDebugCallback(callback: ((step: string, canvas: HTMLCanvasElement) => void) | null) {
  debugCallback = callback;
}

function debugShowImage(stepName: string, mat: any) {
  if (!debugCallback || !cvModule) return;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = mat.cols;
    canvas.height = mat.rows;
    cvModule.imshow(canvas, mat);
    debugCallback(stepName, canvas);
  } catch (error) {
    console.error('Error in debug display:', error);
  }
}

function findSquareWithHarris(originalImg: any, edges: any): { x: number; y: number }[] | null {
  if (!cvModule) return null;
  const cvm = cvModule;

  try {
    console.log('🔍 Harris corner detection...');

    // Convert to grayscale if needed
    let gray;
    if (originalImg.channels() === 1) {
      gray = originalImg;
    } else {
      gray = new cvm.Mat();
      cvm.cvtColor(originalImg, gray, cvm.COLOR_RGBA2GRAY);
    }

    // Harris corner detection (matching crop.py parameters: blockSize=2, ksize=3, k=0.04)
    const dst = new cvm.Mat();
    cvm.cornerHarris(gray, dst, 2, 3, 0.04);

    // Dilate to mark the corners
    const dilated = new cvm.Mat();
    cvm.dilate(dst, dilated, cvm.Mat.ones(3, 3, cvm.CV_8U));

    // Find threshold (0.01 * max value, matching crop.py)
    const minMax = cvm.minMaxLoc(dilated);
    const threshold = 0.01 * minMax.maxVal;

    console.log(`  Harris threshold: ${threshold.toFixed(4)} (max: ${minMax.maxVal.toFixed(4)})`);

    // Extract corner coordinates
    const cornerCoords: { x: number; y: number }[] = [];
    for (let y = 0; y < dilated.rows; y++) {
      for (let x = 0; x < dilated.cols; x++) {
        if (dilated.floatAt(y, x) > threshold) {
          cornerCoords.push({ x, y });
        }
      }
    }

    console.log(`  Found ${cornerCoords.length} Harris corners`);

    if (cornerCoords.length < 4) {
      if (gray !== originalImg) gray.delete();
      dst.delete();
      dilated.delete();
      return null;
    }

    // Create convex hull from corner points
    const points = cvm.matFromArray(cornerCoords.length, 1, cvm.CV_32SC2,
      cornerCoords.flatMap(p => [p.x, p.y]));

    const hull = new cvm.Mat();
    cvm.convexHull(points, hull, false, true);

    if (hull.rows < 4) {
      points.delete();
      hull.delete();
      if (gray !== originalImg) gray.delete();
      dst.delete();
      dilated.delete();
      return null;
    }

    // Approximate polygon from hull
    const peri = cvm.arcLength(hull, true);
    const approx = new cvm.Mat();
    cvm.approxPolyDP(hull, approx, 0.02 * peri, true);

    console.log(`  Hull approximation: ${approx.rows} points`);

    let corners: { x: number; y: number }[] | null = null;

    if (approx.rows === 4) {
      corners = [];
      for (let i = 0; i < 4; i++) {
        corners.push({
          x: approx.data32S[i * 2],
          y: approx.data32S[i * 2 + 1]
        });
      }
      corners = orderCorners(corners);
      console.log('✅ Square found using Harris corner detection');
    }

    // Clean up
    points.delete();
    hull.delete();
    approx.delete();
    if (gray !== originalImg) gray.delete();
    dst.delete();
    dilated.delete();

    return corners;
  } catch (error) {
    console.error('Error in Harris corner detection:', error);
    return null;
  }
}

function boostBrightnessForDetection(src: any): any {
  if (!cvModule) return src;
  const cvm = cvModule;

  try {
    // Apply gamma correction to brighten the image (matching crop.py gamma=0.5)
    const gamma = 0.5;
    const lookupTable = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      lookupTable[i] = Math.pow(i / 255.0, 1.0 / gamma) * 255;
    }

    const lut = cvm.matFromArray(256, 1, cvm.CV_8UC1, Array.from(lookupTable));
    const brightened = new cvm.Mat();
    cvm.LUT(src, lut, brightened);
    lut.delete();

    // Increase contrast by 1.5x (matching crop.py)
    const contrasted = new cvm.Mat();
    brightened.convertTo(contrasted, -1, 1.5, 0);
    brightened.delete();

    return contrasted;
  } catch (error) {
    console.error('⚠️ Error boosting brightness:', error);
    return src.clone();
  }
}

function detectSquareBoundary(canvas: HTMLCanvasElement): { x: number; y: number }[] | null {
  if (!cvModule) {
    throw new Error('OpenCV module not initialized');
  }

  const cvm = cvModule;

  try {
    console.log('🔍 Starting boundary detection (matching crop.py)...');

    // Step 1: Read original image
    const image = cvm.imread(canvas);
    console.log('📸 Image loaded:', image.cols, 'x', image.rows);
    debugShowImage('00_original', image);

    // Step 2: Boost brightness for detection (matching crop.py boost_brightness_for_detection)
    console.log('💡 Boosting brightness for detection...');
    const detectionImage = boostBrightnessForDetection(image);
    debugShowImage('00b_brightened_for_detection', detectionImage);

    // Step 3: Convert to grayscale
    const gray = new cvm.Mat();
    cvm.cvtColor(image, gray, cvm.COLOR_RGBA2GRAY);
    debugShowImage('01_gray', gray);

    // Step 4: Apply Gaussian blur (matching crop.py - 5x5 kernel)
    const blurred = new cvm.Mat();
    cvm.GaussianBlur(gray, blurred, new cvm.Size(5, 5), 0);
    debugShowImage('02_blurred', blurred);

    // Step 5: Canny edge detection (matching crop.py - 50, 150, aperture=3)
    const edges = new cvm.Mat();
    cvm.Canny(blurred, edges, 50, 150, 3, false);
    debugShowImage('03_edges', edges);

    // Step 6: Morphological closing (matching crop.py - 3x3 kernel, iterations=2)
    const kernel = cvm.Mat.ones(3, 3, cvm.CV_8U);
    const closedEdges = new cvm.Mat();
    cvm.morphologyEx(edges, closedEdges, cvm.MORPH_CLOSE, kernel, new cvm.Point(-1, -1), 2);
    debugShowImage('04_closed_edges', closedEdges);

    // Try Hough Lines first (matching crop.py order)
    console.log('🎯 Trying Hough Lines detection...');
    let corners = findSquareWithHoughLines(closedEdges, image);

    if (!corners) {
      console.log('🎯 Trying contour approximation...');
      corners = findSquareWithContours(closedEdges, image);
    }

    // If still no corners, try Harris corner detection (matching crop.py)
    if (!corners) {
      console.log('🎯 Trying Harris corner detection...');
      corners = findSquareWithHarris(detectionImage, closedEdges);
    }

    // Display detected square if found
    if (corners) {
      const vis = image.clone();
      for (let i = 0; i < corners.length; i++) {
        cvm.circle(vis, new cvm.Point(corners[i].x, corners[i].y), 15, new cvm.Scalar(0, 255, 0, 255), -1);
      }
      for (let i = 0; i < 4; i++) {
        const pt1 = new cvm.Point(corners[i].x, corners[i].y);
        const pt2 = new cvm.Point(corners[(i + 1) % 4].x, corners[(i + 1) % 4].y);
        cvm.line(vis, pt1, pt2, new cvm.Scalar(0, 0, 255, 255), 5);
      }
      debugShowImage('06_detected_square', vis);
      vis.delete();
    }

    // Clean up
    image.delete();
    detectionImage.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    kernel.delete();
    closedEdges.delete();

    if (corners) {
      console.log('✅ Square boundary detected successfully');
      return corners;
    }

    console.log('❌ Could not detect square boundary');
    return null;
  } catch (error) {
    console.error('❌ Error detecting square boundary:', error);
    return null;
  }
}

function correctPerspectiveByBoundary(
  canvas: HTMLCanvasElement,
  corners: { x: number; y: number }[],
  targetSize: number
): HTMLCanvasElement | null {
  if (!cvModule) {
    throw new Error('OpenCV module not initialized');
  }

  const cvm = cvModule;

  try {
    console.log('🔧 Starting perspective correction with boundary points...');

    const src = cvm.imread(canvas);

    const srcPointsArray = cvm.matFromArray(4, 1, cvm.CV_32FC2, [
      corners[0].x, corners[0].y,
      corners[1].x, corners[1].y,
      corners[2].x, corners[2].y,
      corners[3].x, corners[3].y
    ]);

    const dstPointsArray = cvm.matFromArray(4, 1, cvm.CV_32FC2, [
      0, 0,
      targetSize - 1, 0,
      targetSize - 1, targetSize - 1,
      0, targetSize - 1
    ]);

    const M = cvm.getPerspectiveTransform(srcPointsArray, dstPointsArray);

    const corrected = new cvm.Mat();
    const dsize = new cvm.Size(targetSize, targetSize);
    cvm.warpPerspective(src, corrected, M, dsize, cvm.INTER_CUBIC, cvm.BORDER_CONSTANT, new cvm.Scalar());

    console.log('✅ Successfully corrected perspective!');

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = targetSize;
    outputCanvas.height = targetSize;
    cvm.imshow(outputCanvas, corrected);

    srcPointsArray.delete();
    dstPointsArray.delete();
    M.delete();
    src.delete();
    corrected.delete();

    return outputCanvas;
  } catch (error) {
    console.error('Error in perspective correction:', error);
    return null;
  }
}

export async function processImage(file: File, options: TextureProcessingOptions): Promise<ProcessedTexture | null> {
  try {
    await ensureOpenCVLoaded();

    const canvas = await createCanvasFromFile(file);
    const targetSize = options.targetSize || 2048;

    // Try ArUco marker detection first
    if (options.enableQRDetection !== false) {
      console.log('Attempting ArUco marker detection...');
      const markers = await detectArucoMarkers(canvas);

      if (markers && markers.length >= 4) {
        console.log(`Found ${markers.length} markers, attempting perspective correction`);
        const processedCanvas = await correctPerspective(canvas, markers, targetSize);

        if (processedCanvas) {
          const dataUrl = processedCanvas.toDataURL('image/png');
          return {
            dataUrl,
            width: processedCanvas.width,
            height: processedCanvas.height,
            canvas: processedCanvas
          };
        }
      } else {
        console.log('Not enough markers for automatic correction');
      }
    }

    // Fallback to manual alignment if provided
    if (options.manualCorners) {
      console.log('Using manual corners for perspective correction');
      const markers: DetectedMarker[] = [
        { id: 0, corners: [options.manualCorners.topLeft, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] },
        { id: 1, corners: [{ x: 0, y: 0 }, options.manualCorners.topRight, { x: 0, y: 0 }, { x: 0, y: 0 }] },
        { id: 2, corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, options.manualCorners.bottomRight, { x: 0, y: 0 }] },
        { id: 3, corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, options.manualCorners.bottomLeft] }
      ];

      const processedCanvas = await correctPerspective(canvas, markers, targetSize);

      if (processedCanvas) {
        const dataUrl = processedCanvas.toDataURL('image/png');
        return {
          dataUrl,
          width: processedCanvas.width,
          height: processedCanvas.height,
          canvas: processedCanvas
        };
      }
    }

    // No processing could be done
    console.log('No markers detected and no manual corners provided');
    return null;

  } catch (error) {
    console.error('Error processing image:', error);
    return null;
  }
}

export async function processImageByBoundary(file: File, targetSize: number = 2048): Promise<ProcessedTexture | null> {
  try {
    await ensureOpenCVLoaded();

    console.log('⏱️ Starting boundary detection method...');
    const startTime = performance.now();

    const canvas = await createCanvasFromFile(file);
    const corners = await detectSquareBoundary(canvas);

    if (!corners) {
      console.log('❌ Could not detect square boundary');
      return null;
    }

    const processedCanvas = await correctPerspectiveByBoundary(canvas, corners, targetSize);

    if (processedCanvas) {
      const endTime = performance.now();
      console.log(`⏱️ Boundary detection completed in ${(endTime - startTime).toFixed(0)}ms`);

      const dataUrl = processedCanvas.toDataURL('image/png');
      return {
        dataUrl,
        width: processedCanvas.width,
        height: processedCanvas.height,
        canvas: processedCanvas
      };
    }

    return null;

  } catch (error) {
    console.error('Error processing image by boundary:', error);
    return null;
  }
}

async function createCanvasFromFile(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}
