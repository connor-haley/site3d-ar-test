import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let tilesRenderer = null;

// Configurable tileset origin - the WGS84 position that corresponds to (0,0,0) in the tileset
// These defaults match the re-centered tileset
const DEFAULT_TILESET_ORIGIN = {
  lat: -23.262,
  lon: 117.778,
  alt: 473
};

let tilesetOriginWgs84 = { ...DEFAULT_TILESET_ORIGIN };

/**
 * Load a 3D Tiles tileset with DRACO support
 * @param {string} url - URL to tileset.json
 * @param {THREE.Object3D} parent - Parent object to add tileset to
 * @param {THREE.Camera} camera - Camera for LOD calculations
 * @param {object} [originOverride] - Optional {lat, lon, alt} to override default origin
 */
export async function loadTileset(url, parent, camera, originOverride = null) {
  return new Promise((resolve, reject) => {
    console.log('Loading tileset from:', url);
    
    // Set origin (use override if provided, otherwise defaults)
    if (originOverride) {
      tilesetOriginWgs84 = { ...originOverride };
      console.log('Using custom tileset origin:', tilesetOriginWgs84);
    } else {
      tilesetOriginWgs84 = { ...DEFAULT_TILESET_ORIGIN };
      console.log('Using default tileset origin:', tilesetOriginWgs84);
    }
    
    // Setup DRACO loader
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    
    // Setup GLTF loader with DRACO
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    console.log('DRACO loader configured');
    
    // Create TilesRenderer
    tilesRenderer = new TilesRenderer(url);
    
    // Register GLTF/GLB handler with DRACO support
    tilesRenderer.manager.addHandler(/\.gltf$|\.glb$/i, gltfLoader);
    
    // Configure camera for LOD
    tilesRenderer.setCamera(camera);
    tilesRenderer.setResolutionFromRenderer(camera, window.renderer);
    
    // Loading settings - permissive for testing
    tilesRenderer.errorTarget = 100;  // High value for testing (default ~6)
    tilesRenderer.maxDepth = 15;
    tilesRenderer.loadSiblings = true;
    
    // Debug event listeners
    let loadedCount = 0;
    
    tilesRenderer.addEventListener('load-tile-set', () => {
      console.log('EVENT: load-tile-set - tileset.json loaded');
      console.log('Root children:', tilesRenderer.root?.children?.length);
    });
    
    tilesRenderer.addEventListener('load-content', (event) => {
      loadedCount++;
      const uri = event.tile?.content?.uri || 'unknown';
      console.log(`EVENT: load-content #${loadedCount} - ${uri}`);
      
      let meshCount = 0;
      tilesRenderer.group.traverse(obj => {
        if (obj.isMesh) meshCount++;
      });
      console.log(`Total meshes in group: ${meshCount}`);
    });
    
    tilesRenderer.addEventListener('load-model', (event) => {
      console.log('EVENT: load-model', event.url || event);
    });
    
    tilesRenderer.addEventListener('error', (event) => {
      console.error('EVENT: error', event);
    });
    
    // Add to parent
    parent.add(tilesRenderer.group);
    console.log('Tileset group added to parent');
    
    // Wait for initial load
    const checkLoaded = () => {
      tilesRenderer.update();
      if (tilesRenderer.root) {
        console.log('Tileset root ready');
        resolve(tilesRenderer);
      } else {
        setTimeout(checkLoaded, 100);
      }
    };
    checkLoaded();
  });
}

/**
 * Get the WGS84 origin of the tileset (where tileset's 0,0,0 is in the real world)
 */
export function getTilesetOrigin() {
  return tilesetOriginWgs84;
}

/**
 * Set the tileset origin manually
 */
export function setTilesetOrigin(lat, lon, alt) {
  tilesetOriginWgs84 = { lat, lon, alt };
  console.log('Tileset origin updated:', tilesetOriginWgs84);
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
export function disposeTileset(parent) {
  if (tilesRenderer) {
    parent.remove(tilesRenderer.group);
    tilesRenderer.dispose();
    tilesRenderer = null;
  }
}

/**
 * Debug: log tileset state
 */
export function debugTilesetTransform() {
  if (!tilesRenderer) {
    console.log('Tileset not created yet');
    return;
  }
  
  if (!tilesRenderer.root) {
    console.log('Tileset root not loaded yet');
    return;
  }
  
  console.log('=== Tileset Debug ===');
  console.log('Origin WGS84:', tilesetOriginWgs84);
  console.log('Group position:', tilesRenderer.group.position);
  console.log('Group world position:', tilesRenderer.group.getWorldPosition(new THREE.Vector3()));
  
  let meshCount = 0;
  let totalVerts = 0;
  tilesRenderer.group.traverse((obj) => {
    if (obj.isMesh) {
      meshCount++;
      totalVerts += obj.geometry.attributes.position?.count || 0;
    }
  });
  console.log('Meshes:', meshCount);
  console.log('Total vertices:', totalVerts);
  console.log('Stats:', tilesRenderer.stats);
}
