import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  getViewerConfig,
  getEmbedToken,
  isViewerLocked,
  incrementViewerAttempts,
  resetViewerAttempts,
} from '@/lib/viewers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const pin = searchParams.get('pin');

    if (!token) {
      return new NextResponse(
        generateErrorHTML('Missing embed token'),
        { 
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Validate embed token
    const embedTokenData = await getEmbedToken(token);
    
    if (!embedTokenData) {
      return new NextResponse(
        generateErrorHTML('Invalid or expired embed token'),
        { 
          status: 401,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Get viewer config
    const config = await getViewerConfig(embedTokenData.viewerId);
    if (!config) {
      return new NextResponse(
        generateErrorHTML('Viewer not found'),
        { 
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // If no PIN provided, show PIN entry form
    if (!pin) {
      return new NextResponse(
        generatePinEntryHTML(token, config),
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'X-Frame-Options': 'ALLOWALL',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Get client IP
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';

    // Check if viewer is locked
    const locked = await isViewerLocked(embedTokenData.viewerId, ip);
    if (locked) {
      return new NextResponse(
        generateErrorHTML('Too many failed attempts. Please try again later.'),
        { 
          status: 429,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Validate PIN
    const isValidPin = await bcrypt.compare(pin, config.pin);
    
    if (!isValidPin) {
      // Increment failed attempts
      const attempts = await incrementViewerAttempts(embedTokenData.viewerId, ip);
      
      const remainingAttempts = 5 - attempts.count;
      const errorMessage = attempts.lockedUntil
        ? 'Too many failed attempts. Account locked for 15 minutes.'
        : `Invalid PIN. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`;
      
      return new NextResponse(
        generatePinEntryHTML(token, config, errorMessage),
        {
          status: 401,
          headers: {
            'Content-Type': 'text/html',
            'X-Frame-Options': 'ALLOWALL',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // PIN is valid - reset attempts and return viewer HTML
    await resetViewerAttempts(embedTokenData.viewerId, ip);
    
    const viewerHTML = generateViewerHTML(config, token, pin);
    
    return new NextResponse(viewerHTML, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Viewer embed auth error:', error);
    return new NextResponse(
      generateErrorHTML('Internal server error'),
      { 
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

function generateErrorHTML(message: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .error-container {
      text-align: center;
      padding: 2rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    .error-icon {
      font-size: 48px;
      margin-bottom: 1rem;
    }
    .error-message {
      color: #dc2626;
      font-size: 16px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <div class="error-message">${message}</div>
  </div>
</body>
</html>
  `.trim();
}

function generatePinEntryHTML(token: string, config: any, error?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enter PIN - ${config.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1rem;
    }
    .pin-container {
      background: white;
      border-radius: 16px;
      padding: 2rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .lock-icon {
      font-size: 48px;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      color: #1f2937;
    }
    p {
      color: #6b7280;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }
    .pin-input {
      width: 100%;
      padding: 1rem;
      font-size: 1.5rem;
      text-align: center;
      letter-spacing: 0.5rem;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .pin-input:focus {
      border-color: #667eea;
    }
    .submit-btn {
      width: 100%;
      padding: 1rem;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .submit-btn:hover {
      background: #5568d3;
    }
    .submit-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
    .error {
      background: #fee2e2;
      color: #991b1b;
      padding: 0.75rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    .loading {
      display: none;
      margin-top: 0.5rem;
      color: #6b7280;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="pin-container">
    <div class="lock-icon">🔒</div>
    <h1>Viewer Access Required</h1>
    <p>Enter your 6-digit PIN to access this viewer</p>
    
    ${error ? `<div class="error">${error}</div>` : ''}
    
    <form id="pinForm">
      <input 
        type="text" 
        id="pinInput" 
        class="pin-input" 
        placeholder="000000"
        maxlength="6"
        pattern="[0-9]*"
        inputmode="numeric"
        autocomplete="off"
        autofocus
        required
      />
      <button type="submit" class="submit-btn" id="submitBtn">
        Access Viewer
      </button>
      <div class="loading" id="loading">Verifying PIN...</div>
    </form>
  </div>
  
  <script>
    const form = document.getElementById('pinForm');
    const input = document.getElementById('pinInput');
    const submitBtn = document.getElementById('submitBtn');
    const loading = document.getElementById('loading');
    
    // Only allow numbers
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
    
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = input.value;
      
      if (pin.length !== 6) {
        return;
      }
      
      submitBtn.disabled = true;
      loading.style.display = 'block';
      
      // Redirect with PIN parameter
      const url = new URL(window.location.href);
      url.searchParams.set('pin', pin);
      window.location.href = url.toString();
    });
  </script>
</body>
</html>
  `.trim();
}

function generateViewerHTML(config: any, token: string, pin: string): string {
  const { settings } = config;
  const rotationSpeed = settings.rotationSpeed || 0.5;
  const displayDuration = settings.modelDisplayDuration || 20;
  const backgroundColor = settings.backgroundColor || '#000000';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${settings.displayTitle || config.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: ${backgroundColor};
      color: #ffffff;
      height: 100vh;
      overflow: hidden;
    }
    #viewer-container {
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      z-index: 10;
    }
    #loading.hidden {
      display: none;
    }
    .loader {
      width: 48px;
      height: 48px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    #model-info {
      position: absolute;
      bottom: 1.5rem;
      left: 1.5rem;
      right: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 5;
    }
    .info-box {
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(10px);
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      font-size: 0.875rem;
    }
    .model-name {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .model-date {
      opacity: 0.7;
      font-size: 0.75rem;
    }
    .model-count {
      font-size: 0.875rem;
    }
    #carousel-indicators {
      position: absolute;
      top: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 0.5rem;
      z-index: 5;
    }
    .indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transition: all 0.3s;
      cursor: pointer;
    }
    .indicator.active {
      width: 24px;
      background: white;
      border-radius: 4px;
    }
    #no-models {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      display: none;
    }
    #no-models.visible {
      display: block;
    }
  </style>
</head>
<body>
  <div id="viewer-container">
    <div id="loading">
      <div class="loader"></div>
      <div>Loading 3D models...</div>
    </div>
    <div id="no-models">
      <h2>${settings.displayTitle || config.name}</h2>
      <p style="margin-top: 1rem; opacity: 0.7;">No 3D models uploaded yet</p>
    </div>
    <div id="carousel-indicators"></div>
    <div id="model-info" style="display: none;">
      <div class="info-box">
        <div class="model-name" id="model-name"></div>
        <div class="model-date" id="model-date"></div>
      </div>
      <div class="info-box model-count" id="model-count"></div>
    </div>
  </div>

  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.181.0/examples/jsm/"
      }
    }
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

    let models = [];
    let currentModelIndex = 0;
    let scene, camera, renderer;
    let currentObject = null;
    let animationFrameId = null;

    async function fetchModels() {
      try {
        const response = await fetch('/api/viewer-models/${config.id}');
        const data = await response.json();
        return data.models || [];
      } catch (error) {
        console.error('Error fetching models:', error);
        return [];
      }
    }

    function initThreeJS() {
      const container = document.getElementById('viewer-container');
      
      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color('${backgroundColor}');
      
      // Camera
      camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.z = 5;
      
      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(renderer.domElement);
      
      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      
      const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight1.position.set(10, 10, 5);
      scene.add(directionalLight1);
      
      const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight2.position.set(-10, -10, -5);
      scene.add(directionalLight2);
      
      const pointLight = new THREE.PointLight(0xffffff, 0.5);
      pointLight.position.set(0, 5, 0);
      scene.add(pointLight);
      
      // Handle resize
      window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
    }

    async function loadModel(modelData) {
      const { model_file_url, texture_template_url, latest_texture } = modelData;
      const textureUrl = latest_texture?.corrected_texture_url || texture_template_url;
      
      return new Promise((resolve, reject) => {
        const fileExtension = model_file_url.split('.').pop().toLowerCase();
        
        const onLoad = (object) => {
          // Apply texture if available
          if (textureUrl) {
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(textureUrl, (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              object.traverse((child) => {
                if (child.isMesh) {
                  child.material.map = texture;
                  child.material.needsUpdate = true;
                }
              });
            });
          }
          resolve(object);
        };
        
        if (fileExtension === 'glb' || fileExtension === 'gltf') {
          const loader = new GLTFLoader();
          loader.load(model_file_url, (gltf) => onLoad(gltf.scene), undefined, reject);
        } else if (fileExtension === 'obj') {
          const loader = new OBJLoader();
          loader.load(model_file_url, onLoad, undefined, reject);
        } else {
          reject(new Error('Unsupported file format'));
        }
      });
    }

    function updateModelInfo() {
      const model = models[currentModelIndex];
      if (!model) return;
      
      document.getElementById('model-name').textContent = model.name;
      if (model.latest_texture) {
        const date = new Date(model.latest_texture.uploaded_at).toLocaleDateString();
        document.getElementById('model-date').textContent = \`Textured \${date}\`;
      } else {
        document.getElementById('model-date').textContent = 'No custom texture';
      }
      document.getElementById('model-count').textContent = \`\${currentModelIndex + 1} / \${models.length}\`;
      
      // Update indicators
      updateIndicators();
    }

    function updateIndicators() {
      const container = document.getElementById('carousel-indicators');
      container.innerHTML = '';
      
      models.forEach((_, index) => {
        const indicator = document.createElement('div');
        indicator.className = 'indicator' + (index === currentModelIndex ? ' active' : '');
        indicator.addEventListener('click', () => switchToModel(index));
        container.appendChild(indicator);
      });
    }

    async function switchToModel(index) {
      if (currentObject) {
        scene.remove(currentObject);
        currentObject = null;
      }
      
      currentModelIndex = index;
      const model = models[currentModelIndex];
      
      try {
        currentObject = await loadModel(model);
        scene.add(currentObject);
        updateModelInfo();
      } catch (error) {
        console.error('Error loading model:', error);
      }
    }

    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      
      if (currentObject) {
        currentObject.rotation.y += ${rotationSpeed} * 0.01;
      }
      
      renderer.render(scene, camera);
    }

    async function init() {
      // Fetch models
      models = await fetchModels();
      
      // Sort by texture upload time
      models.sort((a, b) => {
        const aTime = a.latest_texture?.uploaded_at ? new Date(a.latest_texture.uploaded_at).getTime() : 0;
        const bTime = b.latest_texture?.uploaded_at ? new Date(b.latest_texture.uploaded_at).getTime() : 0;
        if (aTime && bTime) return bTime - aTime;
        if (aTime) return -1;
        if (bTime) return 1;
        return a.order_index - b.order_index;
      });
      
      document.getElementById('loading').classList.add('hidden');
      
      if (models.length === 0) {
        document.getElementById('no-models').classList.add('visible');
        return;
      }
      
      // Show model info
      document.getElementById('model-info').style.display = 'flex';
      
      // Init Three.js
      initThreeJS();
      
      // Load first model
      await switchToModel(0);
      
      // Start animation
      animate();
      
      // Auto-rotate through models
      if (models.length > 1) {
        setInterval(async () => {
          const nextIndex = (currentModelIndex + 1) % models.length;
          await switchToModel(nextIndex);
        }, ${displayDuration} * 1000);
      }
      
      // Poll for updates every 30 seconds
      setInterval(async () => {
        const newModels = await fetchModels();
        if (JSON.stringify(newModels) !== JSON.stringify(models)) {
          console.log('Models updated, reloading...');
          location.reload();
        }
      }, 30000);
    }

    init();
  </script>
</body>
</html>
  `.trim();
}
