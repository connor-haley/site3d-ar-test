import * as THREE from 'three';
import { initRemoteLogger, rlog } from './remoteLogger.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================
// CONFIGURATION - UPDATE THIS!
// ============================================================
// Set this to your computer's IP where log_server.py is running
const LOG_SERVER = 'http://192.168.1.XXX:8765';  // <-- CHANGE THIS!
// ============================================================

// Initialize remote logging first
initRemoteLogger(LOG_SERVER);
rlog.info('=== Geospatial AR Viewer Starting ===');

// Three.js globals
let scene, camera, renderer;
let xrSession = null;
let tilesRenderer = null;

// UI elements
const overlay = document.getElementById('overlay');
const enterArBtn = document.getElementById('enter-ar-btn');
const statusEl = document.getElementById('status');
const arStatusEl = document.getElementById('ar-status');

const tilesetUrlInput = document.getElementById('tileset-url');
const calibLatInput = document.getElementById('calib-lat');
const calibLonInput = document.getElementById('calib-lon');
const calibAltInput = document.getElementById('calib-alt');
const calibHeadingInput = document.getElementById('calib-heading');

// Initialize
init();

async function init() {
  rlog.info('init() called');
  
  // Check WebXR support
  if (!navigator.xr) {
    setStatus('WebXR not supported', 'error');
    rlog.error('WebXR not available');
    return;
  }

  const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
  rlog.info(`AR supported: ${arSupported}`);
  
  if (!arSupported) {
    setStatus('AR not supported on this device', 'error');
    return;
  }

  setStatus('AR supported! Fill in form and tap Enter AR', 'success');
  enterArBtn.disabled = false;

  setupThreeJS();
  enterArBtn.addEventListener('click', startAR);
  
  rlog.success('Initialization complete');
}

function setupThreeJS() {
  rlog.info('Setting up Three.js');
  
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10000);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.getElementById('app').appendChild(renderer.domElement);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // Red sphere at origin (0,0,0) - this is what you're seeing
  const originMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  originMarker.name = 'OriginMarker';
  scene.add(originMarker);
  rlog.info('Origin marker (red sphere) added at 0,0,0');

  // Add axis helper for orientation
  const axes = new THREE.AxesHelper(1);
  scene.add(axes);
  rlog.info('Axes helper added (R=X, G=Y, B=Z)');

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  rlog.success('Three.js setup complete');
}

async function startAR() {
  const tilesetUrl = tilesetUrlInput.value.trim();
  rlog.info(`Starting AR with tileset: ${tilesetUrl}`);

  setStatus('Starting AR session...', '');
  
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: arStatusEl }
    });
    rlog.success('XR session created');

    xrSession.addEventListener('end', onSessionEnd);
    await renderer.xr.setSession(xrSession);
    rlog.info('XR session attached to renderer');

    overlay.classList.add('hidden');
    arStatusEl.classList.add('visible');
    setArStatus('Loading tileset...');

    await loadTileset(tilesetUrl);

    renderer.setAnimationLoop(onXRFrame);
    rlog.success('Animation loop started');

  } catch (error) {
    rlog.error(`Failed to start AR: ${error.message}`);
    setStatus('Failed to start AR: ' + error.message, 'error');
  }
}

async function loadTileset(url) {
  rlog.info(`loadTileset() - URL: ${url}`);
  
  // First, let's verify the tileset.json is accessible
  try {
    rlog.info('Fetching tileset.json to verify access...');
    const resp = await fetch(url);
    rlog.info(`Fetch response: ${resp.status} ${resp.statusText}`);
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    
    const json = await resp.json();
    rlog.info(`Tileset parsed - version: ${json.asset?.version}`);
    rlog.info(`Root has ${json.root?.children?.length || 0} children`);
    rlog.info(`Root content URI: ${json.root?.content?.uri || 'none'}`);
    rlog.info(`Root geometricError: ${json.root?.geometricError}`);
    
  } catch (e) {
    rlog.error(`Failed to fetch/parse tileset.json: ${e.message}`);
    setArStatus(`Tileset fetch failed: ${e.message}`);
    return;
  }
  
  // Setup DRACO
  rlog.info('Setting up DRACO loader...');
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  rlog.info('DRACO + GLTF loaders configured');
  
  // Create TilesRenderer
  rlog.info('Creating TilesRenderer...');
  tilesRenderer = new TilesRenderer(url);
  tilesRenderer.manager.addHandler(/\.gltf$|\.glb$/i, gltfLoader);
  
  tilesRenderer.setCamera(camera);
  tilesRenderer.setResolutionFromRenderer(camera, renderer);
  
  // Very permissive settings for debugging
  tilesRenderer.errorTarget = 1000;
  tilesRenderer.maxDepth = 15;
  tilesRenderer.loadSiblings = true;
  rlog.info('TilesRenderer configured with permissive settings');
  
  // Event listeners for debugging
  let contentLoadCount = 0;
  
  tilesRenderer.addEventListener('load-tile-set', () => {
    rlog.success('EVENT: load-tile-set fired');
    rlog.info(`tilesRenderer.root exists: ${!!tilesRenderer.root}`);
  });
  
  tilesRenderer.addEventListener('load-content', (event) => {
    contentLoadCount++;
    const uri = event.tile?.content?.uri || 'unknown';
    rlog.success(`EVENT: load-content #${contentLoadCount} - ${uri}`);
    
    // Count meshes
    let meshCount = 0;
    let vertCount = 0;
    tilesRenderer.group.traverse((obj) => {
      if (obj.isMesh) {
        meshCount++;
        vertCount += obj.geometry?.attributes?.position?.count || 0;
      }
    });
    rlog.info(`Total meshes: ${meshCount}, vertices: ${vertCount}`);
  });
  
  tilesRenderer.addEventListener('dispose-model', (event) => {
    rlog.warn(`EVENT: dispose-model - ${event.tile?.content?.uri || 'unknown'}`);
  });
  
  tilesRenderer.addEventListener('tile-visibility-change', (event) => {
    const { tile, visible } = event;
    rlog.debug(`Tile visibility: ${visible} - ${tile?.content?.uri || 'root'}`);
  });
  
  // Error handling
  const originalOnLoadError = tilesRenderer.onLoadError;
  tilesRenderer.onLoadError = (tile, error) => {
    rlog.error(`TILE LOAD ERROR: ${tile?.content?.uri || 'unknown'} - ${error?.message || error}`);
    if (originalOnLoadError) originalOnLoadError.call(tilesRenderer, tile, error);
  };
  
  // Add to scene
  scene.add(tilesRenderer.group);
  rlog.info('TilesRenderer group added to scene');
  
  // Analyze bounding volume from tileset.json to understand positioning
  try {
    const resp = await fetch(url);
    const json = await resp.json();
    const box = json.root?.boundingVolume?.box;
    
    if (box && box.length >= 12) {
      const centerX = box[0];
      const centerY = box[1]; 
      const centerZ = box[2];
      
      rlog.warn(`=== BOUNDING VOLUME ANALYSIS ===`);
      rlog.info(`Tileset center: (${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${centerZ.toFixed(1)})`);
      
      // Check if center is far from origin
      const distance = Math.sqrt(centerX*centerX + centerY*centerY + centerZ*centerZ);
      rlog.info(`Distance from origin: ${distance.toFixed(1)} meters`);
      
      if (distance > 100) {
        rlog.warn(`Content is ${distance.toFixed(0)}m from origin - repositioning!`);
        
        // Move the group so content center is at (0, 0, -3) - 3m in front of camera
        tilesRenderer.group.position.set(-centerX, -centerY, -centerZ - 3);
        rlog.info(`Repositioned group to: ${tilesRenderer.group.position.toArray().map(v => v.toFixed(1))}`);
      }
      
      // Check if tileset might be Z-up (common in GIS data)
      if (Math.abs(centerZ) > Math.abs(centerY) * 2) {
        rlog.warn('Tileset may be Z-up, applying rotation');
        tilesRenderer.group.rotation.x = -Math.PI / 2;
      }
    }
  } catch (e) {
    rlog.error(`Failed to analyze bounding volume: ${e.message}`);
  }
  
  // Log final group transform
  rlog.info(`Final group position: ${tilesRenderer.group.position.toArray().map(v => v.toFixed(2))}`);
  rlog.info(`Final group rotation: ${tilesRenderer.group.rotation.toArray().map(v => v.toFixed(2))}`);
  rlog.info(`Group visible: ${tilesRenderer.group.visible}`);
  
  // Add a green cube near origin as a "did content load" test
  const testCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x00ff00 })
  );
  testCube.position.set(0, 0.25, -1); // 1 meter in front, slightly above ground
  testCube.name = 'TestCube';
  scene.add(testCube);
  rlog.info('Green test cube added at (0, 0.25, -1)');
  
  // Poll for loading status
  let pollCount = 0;
  const pollStatus = () => {
    pollCount++;
    
    const stats = {
      root: !!tilesRenderer.root,
      downloading: tilesRenderer.stats?.downloading || 0,
      parsing: tilesRenderer.stats?.parsing || 0,
      visible: tilesRenderer.stats?.visible || 0,
      used: tilesRenderer.stats?.used || 0,
    };
    
    if (pollCount <= 20 || pollCount % 10 === 0) {
      rlog.info(`Poll #${pollCount}: root=${stats.root}, downloading=${stats.downloading}, parsing=${stats.parsing}, visible=${stats.visible}`);
    }
    
    // Update AR status
    setArStatus(`Loading: ${stats.downloading} downloading, ${stats.parsing} parsing, ${contentLoadCount} loaded`);
    
    if (pollCount < 60) {
      setTimeout(pollStatus, 500);
    } else {
      rlog.info('Polling complete - check if content loaded');
      logSceneContents();
    }
  };
  
  pollStatus();
}

function logSceneContents() {
  rlog.info('=== SCENE CONTENTS ===');
  
  let meshCount = 0;
  let objectList = [];
  
  scene.traverse((obj) => {
    if (obj.isMesh) {
      meshCount++;
      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      objectList.push(`  - ${obj.name || obj.type} at (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)}, ${wp.z.toFixed(2)})`);
    }
  });
  
  rlog.info(`Total meshes in scene: ${meshCount}`);
  objectList.forEach(line => rlog.info(line));
  
  // Camera info
  const camPos = camera.position;
  rlog.info(`Camera position: (${camPos.x.toFixed(2)}, ${camPos.y.toFixed(2)}, ${camPos.z.toFixed(2)})`);
}

let frameCount = 0;
function onXRFrame(time, frame) {
  if (!xrSession || !frame) return;
  
  frameCount++;
  
  // Update tileset
  if (tilesRenderer) {
    tilesRenderer.setCamera(camera);
    tilesRenderer.update();
  }
  
  // Log camera position occasionally
  if (frameCount % 300 === 0) { // Every ~5 seconds at 60fps
    const pos = camera.position;
    rlog.debug(`Frame ${frameCount}: Camera at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
  }
  
  renderer.render(scene, camera);
}

function onSessionEnd() {
  rlog.info('XR session ended');
  xrSession = null;
  overlay.classList.remove('hidden');
  arStatusEl.classList.remove('visible');
  renderer.setAnimationLoop(null);
}

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = type || '';
}

function setArStatus(text) {
  arStatusEl.textContent = text;
}

// Expose for console debugging
window.debug = {
  scene,
  camera,
  tilesRenderer: () => tilesRenderer,
  logScene: logSceneContents,
  rlog
};
