/**
 * ClayPixels Embeddable Widget
 *
 * Usage:
 * <script src="https://yourplatform.com/widget/widget.js"></script>
 * <div id="claypixels-viewer" data-viewer-id="your-viewer-id"></div>
 *
 * Or with JavaScript:
 * ClayPixels.init({
 *   container: '#claypixels-viewer',
 *   viewerId: 'your-viewer-id'
 * });
 */

(function () {
  "use strict";

  // Configuration - detect API base from script src or use default
  function getApiBase() {
    // Check for explicit override
    if (window.CLAYPIXELS_API_BASE) {
      return window.CLAYPIXELS_API_BASE;
    }

    // Try to detect from the script tag that loaded this widget
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src || "";
      if (src.includes("/widget/widget.js")) {
        // Extract origin from script src
        try {
          const url = new URL(src);
          return url.origin;
        } catch (e) {
          // Fall through to default
        }
      }
    }

    // Default to current origin (for same-origin usage)
    return window.location.origin;
  }

  const API_BASE = getApiBase();
  // Use OpenCV.js from public folder
  const OPENCV_URL = `${API_BASE}/opencv/opencv.js`;
  const DB_NAME = "claypixels-textures";
  const DB_VERSION = 1;
  const STORE_NAME = "textures";
  // Using ARUCO_6X6_1000 dictionary for marker detection
  const ARUCO_DICT_NAME = "ARUCO_6X6_1000";

  // State
  let db = null;
  let cvModule = null;
  let cvReady = false;

  // ============================================
  // Confetti Celebration Effect
  // ============================================

  function celebrateWithConfetti(container) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const confettiCount = 100;
    const confettiElements = [];

    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.style.cssText = `
        position: absolute;
        width: ${Math.random() * 10 + 5}px;
        height: ${Math.random() * 10 + 5}px;
        background-color: ${colors[Math.floor(Math.random() * colors.length)]};
        top: 50%;
        left: 50%;
        opacity: 1;
        transform: translate(-50%, -50%);
        border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
        pointer-events: none;
        z-index: 10000;
      `;
      container.appendChild(confetti);
      confettiElements.push(confetti);

      // Animate
      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 200 + 100;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity - 200; // Initial upward velocity
      const gravity = 400;
      const rotationSpeed = Math.random() * 720 - 360;
      const startTime = Date.now();
      const duration = 2000;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;

        if (progress >= 1) {
          confetti.remove();
          return;
        }

        const x = vx * progress;
        const y = vy * progress + 0.5 * gravity * progress * progress;
        const rotation = rotationSpeed * progress;
        const opacity = 1 - progress;

        confetti.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rotation}deg)`;
        confetti.style.opacity = opacity;

        requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    }
  }

  // ============================================
  // IndexedDB Storage for Processed Textures
  // ============================================

  async function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: "id",
          });
          store.createIndex("modelId", "modelId", { unique: false });
          store.createIndex("viewerId", "viewerId", { unique: false });
          store.createIndex("uploadedAt", "uploadedAt", { unique: false });
        }
      };
    });
  }

  async function saveTexture(textureData) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const request = store.put({
        id: textureData.id,
        viewerId: textureData.viewerId,
        modelId: textureData.modelId,
        dataUrl: textureData.dataUrl,
        authorName: textureData.authorName,
        authorAge: textureData.authorAge,
        uploadedAt: textureData.uploadedAt || new Date().toISOString(),
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(textureData.id);
    });
  }

  async function getTexturesForModel(modelId) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("modelId");

      const request = index.getAll(modelId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async function getTexturesForViewer(viewerId) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("viewerId");

      const request = index.getAll(viewerId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async function getAllLocalTextures() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async function clearTexturesForViewer(viewerId) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("viewerId");

      const request = index.openCursor(IDBKeyRange.only(viewerId));
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          deletedCount++;
          cursor.continue();
        } else {
          console.log(
            `Cleared ${deletedCount} local textures for viewer ${viewerId}`
          );
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ============================================
  // OpenCV.js Loader
  // ============================================

  function hasArucoSupport(cv) {
    // Check if ArUco detection functions are available
    return (
      typeof cv.aruco_ArucoDetector === "function" ||
      typeof cv.detectMarkers === "function" ||
      (cv.aruco && typeof cv.aruco.detectMarkers === "function")
    );
  }

  async function loadOpenCV() {
    if (cvReady && cvModule) return cvModule;

    return new Promise((resolve, reject) => {
      // Check if already loaded globally
      if (typeof cv !== "undefined") {
        if (typeof cv.then === "function") {
          cv.then((module) => {
            cvModule = module;
            cvReady = true;
            if (!hasArucoSupport(module)) {
              console.warn("Loaded OpenCV does not have ArUco support");
            }
            resolve(cvModule);
          }).catch(reject);
        } else {
          cvModule = cv;
          cvReady = true;
          if (!hasArucoSupport(cv)) {
            console.warn("Loaded OpenCV does not have ArUco support");
          }
          resolve(cvModule);
        }
        return;
      }

      // Load from local public folder
      console.log("Loading OpenCV from:", OPENCV_URL);
      const script = document.createElement("script");
      script.src = OPENCV_URL;
      script.async = true;

      script.onload = () => {
        const checkReady = setInterval(() => {
          if (typeof cv !== "undefined") {
            if (typeof cv.then === "function") {
              cv.then((module) => {
                clearInterval(checkReady);
                cvModule = module;
                cvReady = true;
                console.log(
                  "OpenCV loaded successfully, ArUco support:",
                  hasArucoSupport(module)
                );
                resolve(cvModule);
              }).catch((err) => {
                clearInterval(checkReady);
                reject(err);
              });
            } else if (typeof cv.imread === "function") {
              clearInterval(checkReady);
              cvModule = cv;
              cvReady = true;
              console.log(
                "OpenCV loaded successfully, ArUco support:",
                hasArucoSupport(cv)
              );
              resolve(cvModule);
            }
          }
        }, 100);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkReady);
          reject(new Error("OpenCV.js failed to initialize"));
        }, 30000);
      };

      script.onerror = () => {
        console.error("Failed to load OpenCV from:", OPENCV_URL);
        reject(new Error("Failed to load OpenCV.js"));
      };

      document.head.appendChild(script);
    });
  }

  // ============================================
  // ArUco Marker Detection & Perspective Correction
  // ============================================

  // Relative marker position within a model's marker set (0-3)
  // Each model uses 4 consecutive marker IDs: base, base+1, base+2, base+3
  const MARKER_POSITION_MAP = {
    0: "top_left", // base + 0
    1: "top_right", // base + 1
    2: "bottom_right", // base + 2
    3: "bottom_left", // base + 3
  };

  const MARKER_CORNER_MAP = {
    top_left: 0,
    top_right: 1,
    bottom_right: 2,
    bottom_left: 3,
  };

  /**
   * Identify which model a set of markers belongs to based on marker IDs
   * Returns { modelId, markerIdBase } or null if no match
   */
  function identifyModelFromMarkers(markers, models) {
    if (!markers || markers.length === 0) return null;

    // Get all detected marker IDs
    const detectedIds = markers.map((m) => m.id);

    // Try to match against each model's marker range
    for (const model of models) {
      const base = model.marker_id_base ?? 0;
      const expectedIds = [base, base + 1, base + 2, base + 3];

      // Check if at least 3 of the 4 markers are from this model's set
      const matchCount = detectedIds.filter((id) =>
        expectedIds.includes(id)
      ).length;

      if (matchCount >= 3) {
        return {
          modelId: model.id,
          modelName: model.name,
          markerIdBase: base,
        };
      }
    }

    // Fallback: check if markers 0-3 are present (legacy/default markers)
    const defaultIds = [0, 1, 2, 3];
    const defaultMatches = detectedIds.filter((id) =>
      defaultIds.includes(id)
    ).length;
    if (defaultMatches >= 3 && models.length > 0) {
      // Assume first model for legacy templates
      return {
        modelId: models[0].id,
        modelName: models[0].name,
        markerIdBase: 0,
      };
    }

    return null;
  }

  /**
   * Get marker position name relative to a model's marker base
   */
  function getMarkerPosition(markerId, markerIdBase) {
    const relativeId = markerId - markerIdBase;
    return MARKER_POSITION_MAP[relativeId] || null;
  }

  async function detectArucoMarkers(canvas) {
    if (!cvModule) throw new Error("OpenCV not loaded");
    const cvm = cvModule;

    try {
      // Debug: Check what ArUco functions are available
      console.log("OpenCV ArUco check:", {
        aruco_getPredefinedDictionary: typeof cvm.aruco_getPredefinedDictionary,
        getPredefinedDictionary: typeof cvm.getPredefinedDictionary,
        aruco_Dictionary: typeof cvm.aruco_Dictionary,
        aruco_ArucoDetector: typeof cvm.aruco_ArucoDetector,
        aruco_DetectorParameters: typeof cvm.aruco_DetectorParameters,
        DICT_6X6_1000: cvm.DICT_6X6_1000,
        ARUCO_6X6_1000: cvm.ARUCO_6X6_1000,
        detectMarkers: typeof cvm.detectMarkers,
      });

      const src = cvm.imread(canvas);
      const gray = new cvm.Mat();
      cvm.cvtColor(src, gray, cvm.COLOR_RGBA2GRAY);

      console.log("Image loaded, size:", gray.cols, "x", gray.rows);

      // Create ArUco detector - try different methods
      let dictionary;
      let detector = null;
      let markerCorners = new cvm.MatVector();
      let markerIds = new cvm.Mat();
      let rejectedCandidates = new cvm.MatVector();

      // Method 1: New ArucoDetector class (OpenCV 4.7+)
      if (typeof cvm.aruco_ArucoDetector === "function") {
        console.log("Using aruco_ArucoDetector method with ARUCO_6X6_1000");
        const dictType = cvm.DICT_6X6_1000 || cvm.ARUCO_6X6_1000;

        if (!dictType) {
          console.error("ARUCO_6X6_1000 dictionary not available");
          throw new Error("ArUco dictionary not found");
        }

        if (typeof cvm.aruco_getPredefinedDictionary === "function") {
          dictionary = cvm.aruco_getPredefinedDictionary(dictType);
        } else if (typeof cvm.getPredefinedDictionary === "function") {
          dictionary = cvm.getPredefinedDictionary(dictType);
        } else {
          dictionary = new cvm.aruco_Dictionary(dictType);
        }

        const detectorParams = new cvm.aruco_DetectorParameters();
        try {
          const refineParams = new cvm.aruco_RefineParameters(10.0, 3.0, true);
          detector = new cvm.aruco_ArucoDetector(
            dictionary,
            detectorParams,
            refineParams
          );
        } catch {
          try {
            const refineParams = new cvm.aruco_RefineParameters(10, 3, 1);
            detector = new cvm.aruco_ArucoDetector(
              dictionary,
              detectorParams,
              refineParams
            );
          } catch (e2) {
            console.log(
              "Failed to create ArucoDetector with refine params:",
              e2
            );
            detector = new cvm.aruco_ArucoDetector(dictionary, detectorParams);
          }
        }

        detector.detectMarkers(
          gray,
          markerCorners,
          markerIds,
          rejectedCandidates
        );
      }
      // Method 2: Standalone detectMarkers function (older OpenCV versions)
      else if (typeof cvm.detectMarkers === "function") {
        console.log(
          "Using standalone detectMarkers method with ARUCO_6X6_1000"
        );
        const dictType = cvm.DICT_6X6_1000 || cvm.ARUCO_6X6_1000;

        if (!dictType) {
          console.error("ARUCO_6X6_1000 dictionary not available");
          throw new Error("ArUco dictionary not found");
        }

        if (typeof cvm.getPredefinedDictionary === "function") {
          dictionary = cvm.getPredefinedDictionary(dictType);
        } else {
          dictionary = new cvm.aruco_Dictionary(dictType);
        }
        const params = new cvm.aruco_DetectorParameters();
        cvm.detectMarkers(
          gray,
          dictionary,
          markerCorners,
          markerIds,
          params,
          rejectedCandidates
        );
      }
      // Method 3: aruco.detectMarkers
      else if (cvm.aruco && typeof cvm.aruco.detectMarkers === "function") {
        console.log("Using aruco.detectMarkers method with ARUCO_6X6_1000");
        const dictType = cvm.aruco.DICT_6X6_1000 || cvm.aruco.ARUCO_6X6_1000;

        if (!dictType) {
          console.error("ARUCO_6X6_1000 dictionary not available");
          throw new Error("ArUco dictionary not found");
        }

        dictionary = cvm.aruco.getPredefinedDictionary(dictType);
        const params = new cvm.aruco.DetectorParameters();
        cvm.aruco.detectMarkers(
          gray,
          dictionary,
          markerCorners,
          markerIds,
          params
        );
      } else {
        throw new Error(
          "No ArUco detection method available in this OpenCV build"
        );
      }

      console.log(
        "Detection complete. Rejected candidates:",
        rejectedCandidates.size()
      );

      const numMarkers = markerIds.rows;
      console.log("Number of markers detected:", numMarkers);

      const detectedMarkers = [];

      for (let i = 0; i < numMarkers; i++) {
        const markerId = markerIds.intAt(i, 0);
        const corners = markerCorners.get(i);
        const markerCornerPoints = [];

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
          corners: markerCornerPoints,
        });
      }

      // Cleanup
      src.delete();
      gray.delete();
      markerCorners.delete();
      markerIds.delete();
      rejectedCandidates.delete();

      return detectedMarkers;
    } catch (error) {
      console.error("ArUco detection error:", error);
      return null;
    }
  }

  async function correctPerspective(
    canvas,
    markers,
    targetSize,
    markerIdBase = 0
  ) {
    if (!cvModule) throw new Error("OpenCV not loaded");
    const cvm = cvModule;

    try {
      const srcPoints = {};

      for (const marker of markers) {
        // Get position relative to this model's marker base
        const positionName = getMarkerPosition(marker.id, markerIdBase);
        if (positionName) {
          const cornerIndex = MARKER_CORNER_MAP[positionName];
          srcPoints[positionName] = marker.corners[cornerIndex];
        }
      }

      const requiredCorners = [
        "top_left",
        "top_right",
        "bottom_right",
        "bottom_left",
      ];
      const missingCorners = requiredCorners.filter((c) => !(c in srcPoints));

      if (missingCorners.length > 0) {
        console.log("Missing markers:", missingCorners);
        return null;
      }

      const image = cvm.imread(canvas);

      const srcPointsArray = cvm.matFromArray(4, 1, cvm.CV_32FC2, [
        srcPoints.top_left.x,
        srcPoints.top_left.y,
        srcPoints.top_right.x,
        srcPoints.top_right.y,
        srcPoints.bottom_right.x,
        srcPoints.bottom_right.y,
        srcPoints.bottom_left.x,
        srcPoints.bottom_left.y,
      ]);

      const dstPointsArray = cvm.matFromArray(4, 1, cvm.CV_32FC2, [
        0,
        0,
        targetSize - 1,
        0,
        targetSize - 1,
        targetSize - 1,
        0,
        targetSize - 1,
      ]);

      const M = cvm.getPerspectiveTransform(srcPointsArray, dstPointsArray);
      const corrected = new cvm.Mat();
      const dsize = new cvm.Size(targetSize, targetSize);

      cvm.warpPerspective(image, corrected, M, dsize, cvm.INTER_CUBIC);

      // Create output canvas
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = targetSize;
      outputCanvas.height = targetSize;
      cvm.imshow(outputCanvas, corrected);

      // Cleanup
      srcPointsArray.delete();
      dstPointsArray.delete();
      M.delete();
      image.delete();
      corrected.delete();

      return outputCanvas;
    } catch (error) {
      console.error("Perspective correction error:", error);
      return null;
    }
  }

  async function processImage(file, targetSize = 2048) {
    await loadOpenCV();

    const canvas = await createCanvasFromFile(file);
    const markers = await detectArucoMarkers(canvas);

    if (markers && markers.length >= 4) {
      const processedCanvas = await correctPerspective(
        canvas,
        markers,
        targetSize,
        0
      );
      if (processedCanvas) {
        return processedCanvas.toDataURL("image/webp", 0.92);
      }
    }

    console.log("Not enough markers detected for automatic processing");
    return null;
  }

  /**
   * Process image with auto-detection of which model the texture belongs to
   * @param {File} file - Image file to process
   * @param {Array} models - Array of models with marker_id_base
   * @param {number} targetSize - Output texture size
   * @returns {{ dataUrl: string, detectedModel: object } | null}
   */
  async function processImageWithModelDetection(
    file,
    models,
    targetSize = 2048
  ) {
    await loadOpenCV();

    const canvas = await createCanvasFromFile(file);
    const markers = await detectArucoMarkers(canvas);

    if (!markers || markers.length < 3) {
      console.log("Not enough markers detected:", markers?.length || 0);
      return null;
    }

    // Identify which model based on marker IDs
    const detectedModel = identifyModelFromMarkers(markers, models);

    if (!detectedModel) {
      console.log(
        "Could not identify model from markers. Detected IDs:",
        markers.map((m) => m.id)
      );
      return null;
    }

    console.log(
      "Detected model:",
      detectedModel.modelName,
      "with marker base:",
      detectedModel.markerIdBase
    );

    // Process with the correct marker base
    const processedCanvas = await correctPerspective(
      canvas,
      markers,
      targetSize,
      detectedModel.markerIdBase
    );

    if (processedCanvas) {
      return {
        dataUrl: processedCanvas.toDataURL("image/webp", 0.92),
        detectedModel: detectedModel,
      };
    }

    return null;
  }

  function createCanvasFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  }

  // ============================================
  // Widget Core
  // ============================================

  class ClayPixelsWidget {
    constructor(options) {
      this.container =
        typeof options.container === "string"
          ? document.querySelector(options.container)
          : options.container;
      this.viewerId = options.viewerId;
      this.onTextureUpload = options.onTextureUpload || null;
      this.onError = options.onError || console.error;

      this.viewerConfig = null;
      this.models = [];
      this.displayModels = []; // Models to actually display (filtered based on textures)
      this.currentModelIndex = 0;
      this.currentTextureIndex = 0; // Index for cycling through textures on current model
      this.localTextures = new Map(); // modelId -> textures[]
      this.hasAnyTextures = false; // Track if any textures have been uploaded

      this.threeScene = null;
      this.threeRenderer = null;
      this.threeCamera = null;
      this.currentModel = null;

      this.init();
    }

    async init() {
      try {
        // Initialize IndexedDB
        await initDB();

        // Fetch viewer config from API
        await this.loadViewerConfig();

        // Load local textures from IndexedDB
        await this.loadLocalTextures();

        // Determine which models to display
        this.updateDisplayModels();

        // Create UI
        this.createUI();

        // Initialize 3D viewer
        await this.init3DViewer();

        // Start model display cycle
        this.startDisplayCycle();
      } catch (error) {
        this.onError("Widget initialization failed:", error);
        this.showError("Failed to load viewer. Please check the viewer ID.");
      }
    }

    async loadViewerConfig() {
      const response = await fetch(`${API_BASE}/api/widget/${this.viewerId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch viewer: ${response.status}`);
      }

      const data = await response.json();
      this.viewerConfig = data.viewer;
      this.models = data.models;
    }

    async loadLocalTextures() {
      const textures = await getTexturesForViewer(this.viewerId);

      for (const texture of textures) {
        if (!this.localTextures.has(texture.modelId)) {
          this.localTextures.set(texture.modelId, []);
        }
        this.localTextures.get(texture.modelId).push(texture);
      }
    }

    /**
     * Determine which models to display based on uploaded textures
     * - If no textures uploaded: show only the default model
     * - If textures uploaded: show only models that have textures
     */
    updateDisplayModels() {
      // Check if any model has LOCAL textures uploaded via widget
      // (Server textures from admin panel are not considered for display logic)
      this.hasAnyTextures = false;
      const modelsWithLocalTextures = [];

      for (const model of this.models) {
        const hasLocalTextures =
          this.localTextures.has(model.id) &&
          this.localTextures.get(model.id).length > 0;

        if (hasLocalTextures) {
          this.hasAnyTextures = true;
          modelsWithLocalTextures.push(model);
        }
      }

      if (this.hasAnyTextures) {
        // User has uploaded textures - sort models by newest texture first
        this.displayModels = modelsWithLocalTextures.sort((a, b) => {
          const aTextures = this.localTextures.get(a.id) || [];
          const bTextures = this.localTextures.get(b.id) || [];
          const aNewest = aTextures.length > 0 ? Math.max(...aTextures.map(t => new Date(t.uploadedAt).getTime())) : 0;
          const bNewest = bTextures.length > 0 ? Math.max(...bTextures.map(t => new Date(t.uploadedAt).getTime())) : 0;
          return bNewest - aNewest; // Newest first
        });
        console.log(
          "Showing models with uploaded textures (newest first):",
          this.displayModels.map((m) => m.name)
        );
      } else {
        // No textures uploaded via widget - show only the default model
        const defaultModelId = this.viewerConfig?.settings?.defaultModelId;
        let defaultModel = null;

        if (defaultModelId) {
          defaultModel = this.models.find((m) => m.id === defaultModelId);
          console.log(
            "Looking for default model with ID:",
            defaultModelId,
            "Found:",
            defaultModel?.name
          );
        }

        // Fall back to first model if default not found
        if (!defaultModel && this.models.length > 0) {
          defaultModel = this.models[0];
          console.log("Using fallback model:", defaultModel?.name);
        }

        this.displayModels = defaultModel ? [defaultModel] : [];
        console.log(
          "No textures uploaded, showing default model:",
          defaultModel?.name,
          "defaultModelId setting:",
          defaultModelId
        );
      }

      // Reset current model index
      this.currentModelIndex = 0;
    }

    createUI() {
      this.container.innerHTML = "";
      this.container.style.position = "relative";
      this.container.style.width = "100%";
      this.container.style.height = "100%";
      this.container.style.minHeight = "400px";
      this.container.style.backgroundColor =
        this.viewerConfig?.settings?.backgroundColor || "#000000";

      // 3D Canvas container
      this.canvasContainer = document.createElement("div");
      this.canvasContainer.style.cssText =
        "position:absolute;top:0;left:0;width:100%;height:100%;";
      this.container.appendChild(this.canvasContainer);

      // Upload button - circle with plus icon (Lucide style), bottom-right corner
      this.uploadButton = document.createElement("button");
      this.uploadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
      this.uploadButton.style.cssText = `
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 56px;
        height: 56px;
        padding: 0;
        background: rgba(75, 75, 75, 0.9);
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        z-index: 100;
        transition: background 0.2s, transform 0.2s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      this.uploadButton.onmouseover = () => {
        this.uploadButton.style.background = "rgba(90, 90, 90, 1)";
        this.uploadButton.style.transform = "scale(1.05)";
      };
      this.uploadButton.onmouseout = () => {
        this.uploadButton.style.background = "rgba(75, 75, 75, 0.9)";
        this.uploadButton.style.transform = "scale(1)";
      };
      this.uploadButton.onclick = () => this.showUploadDialog();
      this.container.appendChild(this.uploadButton);

      // Texture navigation (prev/next buttons for cycling textures)
      this.textureNavContainer = document.createElement("div");
      this.textureNavContainer.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 10px;
        z-index: 100;
      `;

      this.prevTextureBtn = document.createElement("button");
      this.prevTextureBtn.innerHTML = "◀";
      this.prevTextureBtn.style.cssText = `
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.9);
        color: #333;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
      `;
      this.prevTextureBtn.onclick = () => this.switchTexture(-1);

      this.textureIndicator = document.createElement("span");
      this.textureIndicator.style.cssText = `
        color: white;
        font-size: 14px;
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        min-width: 60px;
        text-align: center;
      `;

      this.nextTextureBtn = document.createElement("button");
      this.nextTextureBtn.innerHTML = "▶";
      this.nextTextureBtn.style.cssText = `
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.9);
        color: #333;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.2s;
      `;
      this.nextTextureBtn.onclick = () => this.switchTexture(1);

      this.textureNavContainer.appendChild(this.prevTextureBtn);
      this.textureNavContainer.appendChild(this.textureIndicator);
      this.textureNavContainer.appendChild(this.nextTextureBtn);
      this.container.appendChild(this.textureNavContainer);

      // Logo (if present)
      if (this.viewerConfig?.logoUrl) {
        const logo = document.createElement("img");
        logo.src = this.viewerConfig.logoUrl;
        logo.style.cssText = `
          position: absolute;
          bottom: 20px;
          left: 20px;
          height: 48px;
          width: auto;
          z-index: 100;
        `;
        this.container.appendChild(logo);
      }

      // Model name display (only if showModelName is enabled)
      const showModelName =
        this.viewerConfig?.settings?.showModelName !== false; // default true
      if (showModelName) {
        this.modelNameDisplay = document.createElement("div");
        this.modelNameDisplay.style.cssText = `
          position: absolute;
          top: 20px;
          left: 20px;
          color: white;
          font-size: 18px;
          font-weight: bold;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
          z-index: 100;
        `;
        this.container.appendChild(this.modelNameDisplay);
      } else {
        this.modelNameDisplay = null;
      }

      // Update UI based on textures
      this.updateTextureUI();
    }

    updateTextureUI() {
      // Show/hide texture navigation based on ALL stored textures (across all models)
      if (this.textureNavContainer) {
        const totalTextures = this.displayModels.reduce((count, model) => {
          const textures = this.localTextures.get(model.id) || [];
          return count + textures.length;
        }, 0);
        
        console.log('[Widget] updateTextureUI - Total textures:', totalTextures);
        
        if (totalTextures > 0) {
          this.textureNavContainer.style.display = "flex";
          // Calculate current texture's global index
          let globalIndex = 0;
          let found = false;
          for (let i = 0; i < this.displayModels.length; i++) {
            const model = this.displayModels[i];
            const textures = this.localTextures.get(model.id) || [];
            if (i === this.currentModelIndex) {
              globalIndex += this.currentTextureIndex || 0;
              found = true;
              break;
            }
            globalIndex += textures.length;
          }
          
          this.textureIndicator.textContent = `${globalIndex + 1} / ${totalTextures}`;
          
          // Enable buttons if more than one texture across all models
          this.prevTextureBtn.disabled = totalTextures <= 1;
          this.nextTextureBtn.disabled = totalTextures <= 1;
          this.prevTextureBtn.style.opacity = totalTextures <= 1 ? '0.5' : '1';
          this.nextTextureBtn.style.opacity = totalTextures <= 1 ? '0.5' : '1';
        } else {
          this.textureNavContainer.style.display = "none";
        }
      }
    }

    async switchTexture(direction) {
      // Navigate through ALL textures across ALL models
      const totalTextures = this.getTotalTextureCount();
      if (totalTextures <= 1) return;

      const currentGlobalIndex = this.getCurrentGlobalTextureIndex();
      const nextGlobalIndex = (currentGlobalIndex + direction + totalTextures) % totalTextures;
      
      await this.loadTextureByGlobalIndex(nextGlobalIndex);
    }
    
    getTotalTextureCount() {
      return this.displayModels.reduce((count, model) => {
        const textures = this.localTextures.get(model.id) || [];
        return count + textures.length;
      }, 0);
    }
    
    getCurrentGlobalTextureIndex() {
      let globalIndex = 0;
      for (let i = 0; i < this.displayModels.length; i++) {
        const model = this.displayModels[i];
        const textures = this.localTextures.get(model.id) || [];
        if (i === this.currentModelIndex) {
          globalIndex += this.currentTextureIndex || 0;
          break;
        }
        globalIndex += textures.length;
      }
      return globalIndex;
    }
    
    async loadTextureByGlobalIndex(globalIndex) {
      let currentIndex = 0;
      for (let i = 0; i < this.displayModels.length; i++) {
        const model = this.displayModels[i];
        const textures = this.localTextures.get(model.id) || [];
        
        if (globalIndex < currentIndex + textures.length) {
          // Found the model and texture
          const localTextureIndex = globalIndex - currentIndex;
          
          // Switch model if needed
          if (i !== this.currentModelIndex) {
            this.currentModelIndex = i;
            await this.loadModel(model);
          }
          
          // Apply texture
          this.currentTextureIndex = localTextureIndex;
          const sortedTextures = [...textures].sort(
            (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
          );
          const selectedTexture = sortedTextures[localTextureIndex];
          
          if (selectedTexture && this.currentModel) {
            const textureLoader = new THREE.TextureLoader();
            try {
              const texture = await new Promise((resolve, reject) => {
                textureLoader.load(
                  selectedTexture.dataUrl,
                  resolve,
                  undefined,
                  reject
                );
              });

              texture.flipY = false;
              texture.colorSpace = THREE.SRGBColorSpace;

              this.currentModel.traverse((child) => {
                if (child.isMesh) {
                  child.material.map = texture;
                  if (child.material.color) {
                    child.material.color.setHex(0xffffff);
                  }
                  child.material.needsUpdate = true;
                }
              });

              this.updateTextureUI();
            } catch (error) {
              console.error("Failed to load texture:", error);
            }
          }
          break;
        }
        currentIndex += textures.length;
      }
    }

    confirmReset() {
      // Create a child-friendly confirmation dialog
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialog = document.createElement("div");
      dialog.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 16px;
        max-width: 350px;
        width: 90%;
        text-align: center;
      `;

      dialog.innerHTML = `
        <div style="font-size:48px;margin-bottom:15px;">🗑️</div>
        <h2 style="margin:0 0 15px 0;font-size:20px;color:#333;">Start Over?</h2>
        <p style="margin:0 0 25px 0;color:#666;font-size:16px;">This will clear all your uploaded artwork.</p>
        <div style="display:flex;gap:10px;">
          <button id="cp-reset-cancel" style="flex:1;padding:14px;background:#f0f0f0;border:none;border-radius:8px;font-size:16px;cursor:pointer;">Keep It</button>
          <button id="cp-reset-confirm" style="flex:1;padding:14px;background:#dc3545;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:bold;">Clear All</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      dialog.querySelector("#cp-reset-cancel").onclick = () => {
        document.body.removeChild(overlay);
      };

      dialog.querySelector("#cp-reset-confirm").onclick = async () => {
        document.body.removeChild(overlay);
        await this.clearLocalTextures();
      };
    }

    async init3DViewer() {
      // Load Three.js if not already loaded
      if (typeof THREE === "undefined") {
        await this.loadThreeJS();
      }

      const width = this.canvasContainer.clientWidth;
      const height = this.canvasContainer.clientHeight;

      // Scene
      this.threeScene = new THREE.Scene();

      // Camera
      this.threeCamera = new THREE.PerspectiveCamera(
        75,
        width / height,
        0.1,
        1000
      );
      this.threeCamera.position.z = 3;

      // Renderer
      this.threeRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      this.threeRenderer.setSize(width, height);
      this.threeRenderer.setPixelRatio(window.devicePixelRatio);
      this.canvasContainer.appendChild(this.threeRenderer.domElement);

      // Lighting - Ambient + Left/Right (configurable via viewer settings)
      const ambientIntensity = this.viewerConfig?.settings?.ambientLightIntensity ?? 0.6;
      const directionalIntensity = this.viewerConfig?.settings?.directionalLightIntensity ?? 0.8;
      
      const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity);
      this.threeScene.add(ambientLight);

      // Left light
      const leftLight = new THREE.DirectionalLight(0xffffff, directionalIntensity);
      leftLight.position.set(-5, 2, 2);
      this.threeScene.add(leftLight);

      // Right light
      const rightLight = new THREE.DirectionalLight(0xffffff, directionalIntensity);
      rightLight.position.set(5, 2, 2);
      this.threeScene.add(rightLight);

      // Controls - TrackballControls for smooth unlimited rotation
      if (typeof THREE.TrackballControls !== "undefined") {
        this.controls = new THREE.TrackballControls(
          this.threeCamera,
          this.threeRenderer.domElement
        );
        this.controls.rotateSpeed = 2.5; // Responsive but smooth
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        this.controls.noZoom = false;
        this.controls.noPan = false;
        this.controls.staticMoving = false; // Enable inertia/momentum
        this.controls.dynamicDampingFactor = 0.08; // Low value = more momentum, natural deceleration
        this.controls.minDistance = 0.5; // Allow close zoom in
        this.controls.maxDistance = 10; // Farthest zoom (limit zoom out)
        
        // Track user interaction
        this.isUserInteracting = false;
        this.lastInteractionTime = 0;
        this.isMouseDown = false;
        
        const startInteraction = () => {
          this.isUserInteracting = true;
          this.isMouseDown = true;
        };
        
        const endInteraction = () => {
          this.isUserInteracting = false;
          this.isMouseDown = false;
          this.lastInteractionTime = Date.now();
        };
        
        const onMove = () => {
          if (this.isMouseDown) {
            this.isUserInteracting = true;
            this.lastInteractionTime = Date.now();
          }
        };
        
        this.threeRenderer.domElement.addEventListener('mousedown', startInteraction);
        this.threeRenderer.domElement.addEventListener('mouseup', endInteraction);
        this.threeRenderer.domElement.addEventListener('mousemove', onMove);
        this.threeRenderer.domElement.addEventListener('touchstart', startInteraction);
        this.threeRenderer.domElement.addEventListener('touchend', endInteraction);
        this.threeRenderer.domElement.addEventListener('touchmove', onMove);
        
        // Also listen to control change events
        this.controls.addEventListener('change', () => {
          this.lastInteractionTime = Date.now();
        });
      }

      // Handle resize
      window.addEventListener("resize", () => this.handleResize());

      // Start animation loop
      this.animate();

      // Load first model from display models
      if (this.displayModels.length > 0) {
        await this.loadModel(this.displayModels[0]);
      }
    }

    loadThreeJS() {
      return new Promise((resolve, reject) => {
        // Check if Three.js is already loaded
        if (typeof THREE !== "undefined" && THREE.Scene) {
          // Check if GLTFLoader is loaded
          if (typeof THREE.GLTFLoader !== "undefined") {
            resolve();
            return;
          }
          // Load only GLTFLoader and OrbitControls
          this.loadThreeExtensions().then(resolve).catch(reject);
          return;
        }

        // Check if script is already being loaded
        if (document.querySelector('script[src*="three.min.js"]')) {
          // Wait for it to load
          const waitForThree = setInterval(() => {
            if (typeof THREE !== "undefined" && THREE.Scene) {
              clearInterval(waitForThree);
              this.loadThreeExtensions().then(resolve).catch(reject);
            }
          }, 100);
          setTimeout(() => {
            clearInterval(waitForThree);
            reject(new Error("Timeout waiting for Three.js"));
          }, 10000);
          return;
        }

        const script = document.createElement("script");
        script.src =
          "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
        script.onload = () => {
          this.loadThreeExtensions().then(resolve).catch(reject);
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    loadThreeExtensions() {
      return new Promise((resolve, reject) => {
        // Check if already loaded
        if (
          typeof THREE.GLTFLoader !== "undefined" &&
          typeof THREE.TrackballControls !== "undefined"
        ) {
          resolve();
          return;
        }

        const loadGLTFLoader = () => {
          if (typeof THREE.GLTFLoader !== "undefined") {
            return Promise.resolve();
          }
          return new Promise((res, rej) => {
            if (document.querySelector('script[src*="GLTFLoader.js"]')) {
              const wait = setInterval(() => {
                if (typeof THREE.GLTFLoader !== "undefined") {
                  clearInterval(wait);
                  res();
                }
              }, 50);
              setTimeout(() => {
                clearInterval(wait);
                res();
              }, 5000);
              return;
            }
            const loaderScript = document.createElement("script");
            loaderScript.src =
              "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js";
            loaderScript.onload = res;
            loaderScript.onerror = rej;
            document.head.appendChild(loaderScript);
          });
        };

        const loadTrackballControls = () => {
          if (typeof THREE.TrackballControls !== "undefined") {
            return Promise.resolve();
          }
          return new Promise((res, rej) => {
            if (document.querySelector('script[src*="TrackballControls.js"]')) {
              const wait = setInterval(() => {
                if (typeof THREE.TrackballControls !== "undefined") {
                  clearInterval(wait);
                  res();
                }
              }, 50);
              setTimeout(() => {
                clearInterval(wait);
                res();
              }, 5000);
              return;
            }
            const controlsScript = document.createElement("script");
            controlsScript.src =
              "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TrackballControls.js";
            controlsScript.onload = res;
            controlsScript.onerror = rej;
            document.head.appendChild(controlsScript);
          });
        };

        loadGLTFLoader().then(loadTrackballControls).then(resolve).catch(reject);
      });
    }

    async loadModel(modelData) {
      if (this.currentModel) {
        this.threeScene.remove(this.currentModel);
      }

      if (this.modelNameDisplay) {
        this.modelNameDisplay.textContent = modelData.name;
      }
      this.currentTextureIndex = 0; // Reset texture index when loading new model

      const loader = new THREE.GLTFLoader();

      try {
        const gltf = await new Promise((resolve, reject) => {
          loader.load(modelData.model_file_url, resolve, undefined, reject);
        });

        this.currentModel = gltf.scene;

        // Center and scale model
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        let scale = 2 / maxDim;

        // Custom scale adjustments for specific models
        if (modelData.id === "model_1764850748646_hk3hz64g5") {
          scale *= 0.85; // Scale down this model by 15%
        }

        this.currentModel.scale.setScalar(scale);
        this.currentModel.position.sub(center.multiplyScalar(scale));

        // Apply texture
        await this.applyTexture(modelData);

        this.threeScene.add(this.currentModel);

        // Update texture navigation UI
        this.updateTextureUI();
      } catch (error) {
        console.error("Failed to load model:", error);
      }
    }

    async applyTexture(modelData) {
      // Check for local textures first
      const localTextures = this.localTextures.get(modelData.id) || [];

      let textureUrl;

      if (localTextures.length > 0) {
        // Use most recent local texture
        const latestLocal = localTextures.sort(
          (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
        )[0];
        textureUrl = latestLocal.dataUrl;
      } else if (modelData.textures && modelData.textures.length > 0) {
        // Use server texture
        textureUrl = modelData.textures[0].corrected_texture_url;
      } else if (modelData.texture_template_url) {
        // Use template
        textureUrl = modelData.texture_template_url;
      }

      if (textureUrl && this.currentModel) {
        const textureLoader = new THREE.TextureLoader();

        try {
          const texture = await new Promise((resolve, reject) => {
            textureLoader.load(textureUrl, resolve, undefined, reject);
          });

          texture.flipY = false;
          texture.colorSpace = THREE.SRGBColorSpace;

          this.currentModel.traverse((child) => {
            if (child.isMesh) {
              child.material.map = texture;
              // Set color to white so texture displays without color tinting
              if (child.material.color) {
                child.material.color.setHex(0xffffff);
              }
              child.material.needsUpdate = true;
            }
          });
        } catch (error) {
          console.error("Failed to load texture:", error);
        }
      }
    }

    animate() {
      requestAnimationFrame(() => this.animate());

      // Auto-rotate model on multiple axes when not being manually controlled
      if (this.currentModel && !this.isUserInteracting) {
        // Resume auto-rotation 1 second after user stops interacting
        const timeSinceInteraction = Date.now() - this.lastInteractionTime;
        if (timeSinceInteraction > 1000 || this.lastInteractionTime === 0) {
          const speed = this.viewerConfig?.settings?.rotationSpeed || 0.5;
          this.currentModel.rotation.y += speed * 0.01; // Horizontal spin
          this.currentModel.rotation.x += speed * 0.005; // Slight tilt for dynamic look
        }
      }

      if (this.controls) {
        this.controls.update();
      }

      this.threeRenderer.render(this.threeScene, this.threeCamera);
    }

    handleResize() {
      const width = this.canvasContainer.clientWidth;
      const height = this.canvasContainer.clientHeight;

      this.threeCamera.aspect = width / height;
      this.threeCamera.updateProjectionMatrix();
      this.threeRenderer.setSize(width, height);
    }

    startDisplayCycle() {
      // Auto-cycling disabled - widget now only displays the most recent texture
      // Clear any existing cycle
      if (this.displayCycleInterval) {
        clearInterval(this.displayCycleInterval);
      }
    }

    showUploadDialog() {
      // Check if smart ArUco detection is enabled for this viewer
      const enableArucoDetection =
        this.viewerConfig?.settings?.enableArucoDetection || false;

      // Create modal overlay
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialog = document.createElement("div");
      dialog.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
      `;

      // Model selection section - show different UI based on mode
      const modelSectionHTML = enableArucoDetection
        ? `
          <div id="cp-model-section" style="margin-bottom:20px;">
            <div id="cp-detected-model" style="display:none;padding:10px;background:#e8f5e9;border:1px solid #4caf50;border-radius:6px;">
              <span style="color:#2e7d32;">✓ Auto-detected: </span><strong id="cp-model-name"></strong>
            </div>
            <select id="cp-model-select" style="display:none;">
              ${this.models
                .map((m) => `<option value="${m.id}">${m.name}</option>`)
                .join("")}
            </select>
          </div>
        `
        : `
          <div id="cp-model-section" style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:bold;">Model:</label>
            <select id="cp-model-select" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:16px;">
              ${this.models
                .map((m) => `<option value="${m.id}">${m.name}</option>`)
                .join("")}
            </select>
          </div>
        `;

      // Show reset option if user has uploaded textures
      const resetSectionHTML = this.hasAnyTextures
        ? `
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid #eee;text-align:center;">
          <button id="cp-reset" style="padding:10px 20px;background:transparent;color:#dc3545;border:1px solid #dc3545;border-radius:8px;font-size:14px;cursor:pointer;">🗑️ Clear All My Artwork</button>
        </div>
      `
        : "";

      dialog.innerHTML = `
        <h2 style="margin:0 0 20px 0;font-size:24px;text-align:center;">📸 Upload Your Art!</h2>
        
        ${modelSectionHTML}

        <div style="margin-bottom:20px;">
          <label style="display:block;margin-bottom:8px;font-weight:bold;text-align:center;">Take a photo of your painted texture:</label>
          <input type="file" id="cp-file-input" accept="image/*" capture="environment" style="width:100%;padding:12px;border:2px dashed #3b82f6;border-radius:8px;font-size:16px;box-sizing:border-box;background:#f8fafc;cursor:pointer;" />
        </div>

        <div id="cp-preview" style="display:none;margin-bottom:20px;text-align:center;">
          <img id="cp-preview-img" style="max-width:100%;max-height:200px;border-radius:8px;" />
          <p id="cp-status" style="margin-top:10px;color:#666;"></p>
        </div>

        <div style="display:flex;gap:10px;">
          <button id="cp-cancel" style="flex:1;padding:14px;background:#f0f0f0;border:none;border-radius:8px;font-size:16px;cursor:pointer;">Cancel</button>
          <button id="cp-upload" style="flex:1;padding:14px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:bold;" disabled>🎨 Upload</button>
        </div>
        ${resetSectionHTML}
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Event handlers
      const fileInput = dialog.querySelector("#cp-file-input");
      const preview = dialog.querySelector("#cp-preview");
      const previewImg = dialog.querySelector("#cp-preview-img");
      const status = dialog.querySelector("#cp-status");
      const uploadBtn = dialog.querySelector("#cp-upload");
      const cancelBtn = dialog.querySelector("#cp-cancel");
      const modelSelect = dialog.querySelector("#cp-model-select");
      const detectedModelDiv = dialog.querySelector("#cp-detected-model");
      const modelNameSpan = dialog.querySelector("#cp-model-name");

      let selectedFile = null;
      let processedDataUrl = null;
      let detectedModel = null;

      fileInput.onchange = async (e) => {
        selectedFile = e.target.files[0];
        if (!selectedFile) return;

        preview.style.display = "block";
        previewImg.src = URL.createObjectURL(selectedFile);
        uploadBtn.disabled = true;
        detectedModelDiv.style.display = "none";

        if (enableArucoDetection) {
          // SMART MODE: Auto-detect model from markers + perspective correction
          status.textContent = "Processing image and detecting model...";

          try {
            const result = await processImageWithModelDetection(
              selectedFile,
              this.models
            );

            if (result) {
              processedDataUrl = result.dataUrl;
              detectedModel = result.detectedModel;

              previewImg.src = processedDataUrl;

              // Show detected model and hide selector
              if (detectedModel) {
                modelNameSpan.textContent = detectedModel.modelName;
                detectedModelDiv.style.display = "block";
                modelSelect.value = detectedModel.modelId;
              }

              status.textContent = "✅ Image processed successfully!";
              uploadBtn.disabled = false;
            } else {
              status.textContent =
                "⚠️ Could not detect markers or identify model. Please ensure all 4 corner markers are visible.";
              uploadBtn.disabled = true;
            }
          } catch (error) {
            status.textContent = "❌ Processing failed: " + error.message;
            uploadBtn.disabled = true;
          }
        } else {
          // STANDARD MODE: Perspective correction with manual model selection
          status.textContent = "Processing image...";

          try {
            // Use standard processImage with markers 0-3 (user selects model manually)
            const result = await processImage(selectedFile, 2048);

            if (result) {
              processedDataUrl = result;
              previewImg.src = processedDataUrl;
              status.textContent = "✅ Image processed successfully!";
              uploadBtn.disabled = false;
            } else {
              // If ArUco processing fails, allow upload of original image
              status.textContent =
                "⚠️ Could not detect markers. Using original image.";
              processedDataUrl = null;
              uploadBtn.disabled = false;
            }
          } catch (error) {
            status.textContent = "⚠️ Processing failed. Using original image.";
            processedDataUrl = null;
            uploadBtn.disabled = false;
          }
        }
      };

      cancelBtn.onclick = () => document.body.removeChild(overlay);

      // Reset button handler (only exists if user has textures)
      const resetBtn = dialog.querySelector("#cp-reset");
      if (resetBtn) {
        resetBtn.onclick = () => {
          document.body.removeChild(overlay);
          this.confirmReset();
        };
      }

      uploadBtn.onclick = async () => {
        if (!selectedFile) return;
        // For smart mode, we need detected model; for standard mode, user selects
        if (enableArucoDetection && !detectedModel) return;

        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading...";

        try {
          // In smart mode, use detected model; in standard mode, use selected model
          const modelId =
            enableArucoDetection && detectedModel
              ? detectedModel.modelId
              : dialog.querySelector("#cp-model-select").value;

          // Upload original to server
          const formData = new FormData();
          formData.append("file", selectedFile);
          formData.append("viewerId", this.viewerId);
          formData.append("modelId", modelId);
          formData.append("processedLocally", "true"); // Always process locally with ArUco

          const response = await fetch(`${API_BASE}/api/widget/upload`, {
            method: "POST",
            body: formData,
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || "Upload failed");
          }

          // For ArUco mode, save processed texture locally
          // For simple mode, use the original image URL from response or create data URL
          const textureId = result.textureId || `local_${Date.now()}`;

          // Get texture data URL - either processed (ArUco) or from original file (simple mode)
          let textureDataUrl = processedDataUrl;
          if (!textureDataUrl) {
            // Convert original file to data URL for local display
            textureDataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(selectedFile);
            });
          }

          await saveTexture({
            id: textureId,
            viewerId: this.viewerId,
            modelId: modelId,
            dataUrl: textureDataUrl,
            authorName: null,
            authorAge: null,
            uploadedAt: new Date().toISOString(),
          });

          // Update local textures cache
          if (!this.localTextures.has(modelId)) {
            this.localTextures.set(modelId, []);
          }
          this.localTextures.get(modelId).push({
            id: textureId,
            dataUrl: textureDataUrl,
            uploadedAt: new Date().toISOString(),
          });

          // Update display models based on new textures
          const hadTextures = this.hasAnyTextures;
          this.updateDisplayModels();

          // Update UI (show reset button, texture nav)
          this.updateTextureUI();

          // Always switch to and load the model that just got a texture
          const modelWithNewTexture = this.displayModels.find(
            (m) => m.id === modelId
          );
          if (modelWithNewTexture) {
            this.currentModelIndex =
              this.displayModels.indexOf(modelWithNewTexture);
            // Always load the model to ensure texture is applied correctly
            await this.loadModel(modelWithNewTexture);
          }

          // If this is the first texture upload, restart the display cycle
          if (!hadTextures && this.hasAnyTextures) {
            this.startDisplayCycle();
          }

          // Celebrate first texture upload!
          celebrateWithConfetti(this.container);

          // Callback
          if (this.onTextureUpload) {
            this.onTextureUpload({
              modelId,
              textureId,
            });
          }

          // Close dialog
          document.body.removeChild(overlay);
        } catch (error) {
          status.textContent = "❌ Upload failed: " + error.message;
          uploadBtn.disabled = false;
          uploadBtn.textContent = "🎨 Upload";
        }
      };
    }

    showError(message) {
      this.container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;background:#1a1a1a;color:white;text-align:center;padding:20px;">
          <div>
            <p style="font-size:18px;margin:0 0 10px 0;">⚠️ ${message}</p>
            <p style="font-size:14px;color:#888;margin:0;">Please check your configuration.</p>
          </div>
        </div>
      `;
    }

    /**
     * Clear all locally stored textures for this viewer and reset display
     */
    async clearLocalTextures() {
      await clearTexturesForViewer(this.viewerId);
      this.localTextures.clear();
      this.currentTextureIndex = 0;
      this.updateDisplayModels();

      // Update UI elements
      this.updateTextureUI();

      // Reload the default model
      if (this.displayModels.length > 0) {
        await this.loadModel(this.displayModels[0]);
      }

      // Restart display cycle
      this.startDisplayCycle();

      console.log("Local textures cleared, showing default model");
    }
  }

  // ============================================
  // Public API
  // ============================================

  window.ClayPixels = {
    init: function (options) {
      return new ClayPixelsWidget(options);
    },

    // Expose storage functions for advanced usage
    storage: {
      saveTexture,
      getTexturesForModel,
      getTexturesForViewer,
      getAllLocalTextures,
      clearTexturesForViewer,
    },

    // Expose processing functions
    processing: {
      processImage,
      loadOpenCV,
    },
  };

  // Auto-initialize widgets with data attributes
  document.addEventListener("DOMContentLoaded", function () {
    const widgets = document.querySelectorAll("[data-claypixels-viewer]");

    widgets.forEach((container) => {
      const viewerId = container.dataset.claypixelsViewer;
      if (viewerId) {
        window.ClayPixels.init({
          container: container,
          viewerId: viewerId,
        });
      }
    });
  });
})();
