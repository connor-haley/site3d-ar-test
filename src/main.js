import * as THREE from 'three';
import { 
  setCalibrationOrigin, 
  isCalibrated, 
  wgs84ToLocal,
  debugCalibration 
} from './geospatialTransform.js';
import { 
  loadTileset, 
  getTilesetOrigin, 
  updateTileset,
  debugTilesetTransform 
} from './tilesetLoader.js';

// Make renderer globally accessible for tilesetLoader
window.renderer = null;

// Three.js globals
let scene, camera, renderer;
let xrSession = null;
let xrRefSpace = null;

// Geospatial root - all georeferenced content goes under this
let geospatialRoot = null;

// State
let tilesetUrl = '';
let tilesetLoaded = false;

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
  // Check WebXR support
  if (!navigator.xr) {
    setStatus('WebXR not supported in this browser', 'error');
    return;
  }

  const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
  if (!arSupported) {
    setStatus('AR not supported on this device', 'error');
    return;
  }

  setStatus('AR supported! Fill in the form and tap Enter AR', 'success');
  enterArBtn.disabled = false;

  // Set up Three.js
  setupThreeJS();

  // Event listeners
  enterArBtn.addEventListener('click', startAR);
  
  // Auto-fill from URL params (useful for testing)
  const params = new URLSearchParams(window.location.search);
  if (params.get('tileset')) tilesetUrlInput.value = params.get('tileset');
  if (params.get('lat')) calibLatInput.value = params.get('lat');
  if (params.get('lon')) calibLonInput.value = params.get('lon');
  if (params.get('alt')) calibAltInput.value = params.get('alt');
  if (params.get('heading')) calibHeadingInput.value = params.get('heading');
}

function setupThreeJS() {
  // Scene
  scene = new THREE.Scene();

  // Camera (will be controlled by WebXR)
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10000);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.getElementById('app').appendChild(renderer.domElement);
  
  // Store globally for tilesetLoader
  window.renderer = renderer;

  // Geospatial root object
  geospatialRoot = new THREE.Group();
  geospatialRoot.name = 'GeospatialRoot';
  scene.add(geospatialRoot);

  // Basic lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 10);
  scene.add(directionalLight);

  // Debug: add a small marker at origin
  const originMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  originMarker.name = 'OriginMarker';
  scene.add(originMarker);

  // Handle resize
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function startAR() {
  // Validate inputs
  tilesetUrl = tilesetUrlInput.value.trim();
  const lat = parseFloat(calibLatInput.value);
  const lon = parseFloat(calibLonInput.value);
  const alt = parseFloat(calibAltInput.value) || 0;
  const heading = parseFloat(calibHeadingInput.value) || 0;

  if (!tilesetUrl) {
    setStatus('Please enter a tileset URL', 'error');
    return;
  }

  if (isNaN(lat) || isNaN(lon)) {
    setStatus('Please enter valid coordinates', 'error');
    return;
  }

  // Set calibration
  setCalibrationOrigin(lat, lon, alt, heading);
  debugCalibration();

  setStatus('Starting AR session...', '');
  
  try {
    // Request AR session with passthrough
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.getElementById('ar-status') }
    });

    xrSession.addEventListener('end', onSessionEnd);

    // Set up renderer for XR
    await renderer.xr.setSession(xrSession);
    
    // Get reference space
    xrRefSpace = await xrSession.requestReferenceSpace('local-floor');

    // Hide overlay, show AR status
    overlay.classList.add('hidden');
    arStatusEl.classList.add('visible');
    setArStatus('Loading tileset...');

    // Load tileset
    await loadTilesetAndPosition();

    // Start render loop
    renderer.setAnimationLoop(onXRFrame);

  } catch (error) {
    console.error('Failed to start AR:', error);
    setStatus('Failed to start AR: ' + error.message, 'error');
  }
}

async function loadTilesetAndPosition() {
  try {
    await loadTileset(tilesetUrl, geospatialRoot, camera);
    
    // Get the tileset's geospatial origin
    const origin = getTilesetOrigin();
    
    if (origin) {
      console.log('Tileset origin:', origin);
      
      // Compute where this should be in local coordinates
      const localPos = wgs84ToLocal(origin.lat, origin.lon, origin.alt);
      console.log('Tileset local position:', localPos);
      
      // Position the geospatial root
      // The tileset is a child of geospatialRoot, so moving geospatialRoot moves everything
      geospatialRoot.position.copy(localPos);
      
      setArStatus(`Loaded! Origin: ${origin.lat.toFixed(6)}, ${origin.lon.toFixed(6)}`);
    } else {
      setArStatus('Loaded (no geospatial origin found)');
    }
    
    tilesetLoaded = true;
    debugTilesetTransform();
    
  } catch (error) {
    console.error('Failed to load tileset:', error);
    setArStatus('Failed to load tileset: ' + error.message);
  }
}

function onXRFrame(time, frame) {
  if (!xrSession || !frame) return;

  // Update tileset LOD based on camera
  updateTileset(camera);

  // Render
  renderer.render(scene, camera);
}

function onSessionEnd() {
  xrSession = null;
  overlay.classList.remove('hidden');
  arStatusEl.classList.remove('visible');
  setStatus('AR session ended', '');
  renderer.setAnimationLoop(null);
}

// UI helpers
function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = type || '';
}

function setArStatus(text) {
  arStatusEl.textContent = text;
}

// Debug: expose to console
window.debug = {
  scene,
  camera,
  geospatialRoot,
  debugCalibration,
  debugTilesetTransform,
  wgs84ToLocal,
  getTilesetOrigin
};

console.log('Geospatial AR Viewer loaded. Use window.debug for debugging.');
