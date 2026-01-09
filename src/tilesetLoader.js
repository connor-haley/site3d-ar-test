import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getTilesetOriginFromTransform, computeTilesetTransform, ecefToWgs84 } from './geospatialTransform.js';

let tilesRenderer = null;
let tilesetOriginWgs84 = null;
let dracoLoader = null;

/**
 * Initialize DRACO loader (call once at startup)
 */
function initDracoLoader() {
  if (dracoLoader) return dracoLoader;
  
  dracoLoader = new DRACOLoader();
  // Use Google's hosted DRACO decoder (works everywhere, no local files needed)
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  dracoLoader.setDecoderConfig({ type: 'js' }); // Use JS decoder for maximum compatibility
  
  console.log('DRACO loader initialized');
  return dracoLoader;
}

/**
 * Load a 3D Tiles tileset with DRACO support
 */
export async function loadTileset(url, scene, camera) {
  return new Promise(async (resolve, reject) => {
    console.log('Loading tileset from:', url);
    
    // Initialize DRACO
    initDracoLoader();
    
    // Fetch tileset.json directly to get the transform
    try {
      const response = await fetch(url);
      const tilesetJson = await response.json();
      
      if (tilesetJson.root && tilesetJson.root.transform) {
        tilesetOriginWgs84 = getTilesetOriginFromTransform(tilesetJson.root.transform);
        console.log('Tileset origin (WGS84):', tilesetOriginWgs84);
      }
    } catch (e) {
      console.warn('Could not fetch tileset.json directly:', e);
    }
    
    tilesRenderer = new TilesRenderer(url);
    
    // Configure the GLTFLoader used by TilesRenderer to use DRACO
    tilesRenderer.manager.addHandler(/\.gltf$|\.glb$/i, {
      load(url, onLoad, onProgress, onError, loader) {
        const gltfLoader = new GLTFLoader(loader.manager);
        gltfLoader.setDRACOLoader(dracoLoader);
        gltfLoader.load(url, onLoad, onProgress, onError);
      }
    });
    
    tilesRenderer.setCamera(camera);
    tilesRenderer.setResolutionFromRenderer(camera, window.renderer);
    
    // Loading settings
    tilesRenderer.errorTarget = 50;
    tilesRenderer.maxDepth = 15;
    tilesRenderer.loadSiblings = true;
    
    // Disable frustum culling on the group
    tilesRenderer.group.frustumCulled = false;
    
    // Event listeners
    tilesRenderer.addEventListener('load-content', (event) => {
      console.log('Tile content loaded:', event.tile?.content?.uri);
    });
    
    tilesRenderer.addEventListener('load-model', (event) => {
      console.log('Model loaded');
    });
    
    tilesRenderer.addEventListener('load-tile-set', (event) => {
      console.log('Tileset loaded');
    });
    
    tilesRenderer.addEventListener('error', (event) => {
      console.error('Tileset error:', event);
    });
    
    // Add to scene
    scene.add(tilesRenderer.group);
    
    // Wait for initial load
    const checkLoaded = () => {
      if (tilesRenderer.root) {
        console.log('Tileset root ready');
        resolve(tilesRenderer);
      } else {
        setTimeout(checkLoaded, 100);
      }
    };
    
    tilesRenderer.update();
    checkLoaded();
  });
}

/**
 * Get the WGS84 origin of the loaded tileset
 */
export function getTilesetOrigin() {
  return tilesetOriginWgs84;
}

/**
 * Update the tileset renderer (call in render loop)
 */
export function updateTileset(camera) {
  if (tilesRenderer) {
    tilesRenderer.setCamera(camera);
    tilesRenderer.update();
  }
}

/**
 * Get loading stats
 */
export function getLoadingStats() {
  if (!tilesRenderer) {
    return { loaded: 0, total: 0, loading: false };
  }
  
  return {
    loaded: tilesRenderer.stats?.visible || 0,
    parsing: tilesRenderer.stats?.parsing || 0,
    downloading: tilesRenderer.stats?.downloading || 0,
    loading: (tilesRenderer.stats?.downloading || 0) > 0
  };
}

/**
 * Dispose of the tileset
 */
export function disposeTileset(scene) {
  if (tilesRenderer) {
    scene.remove(tilesRenderer.group);
    tilesRenderer.dispose();
    tilesRenderer = null;
    tilesetOriginWgs84 = null;
  }
}

/**
 * Debug: get the tileset's internal transform
 */
export function debugTilesetTransform() {
  if (!tilesRenderer || !tilesRenderer.root) {
    console.log('Tileset not loaded yet');
    return;
  }
  
  console.log('=== Tileset Transform Debug ===');
  console.log('Root transform:', tilesRenderer.root.transform?.elements);
  console.log('Group position:', tilesRenderer.group.position);
  console.log('Origin WGS84:', tilesetOriginWgs84);
  
  let meshCount = 0;
  tilesRenderer.group.traverse((obj) => {
    if (obj.isMesh) meshCount++;
  });
  console.log('Meshes in group:', meshCount);
}
