import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getTilesetOriginFromTransform, computeTilesetTransform, ecefToWgs84 } from './geospatialTransform.js';

let tilesRenderer = null;
let tilesetOriginWgs84 = null;

/**
 * Load a 3D Tiles tileset with DRACO support
 */
export async function loadTileset(url, scene, camera) {
  return new Promise(async (resolve, reject) => {
    console.log('Loading tileset from:', url);
    
    // Setup DRACO loader
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    console.log('DRACO loader initialized');
    
    // Setup GLTF loader with DRACO
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    console.log('GLTF loader configured with DRACO');
    
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
    
    // Register the GLTF loader with DRACO support
    // This is the correct API for 3d-tiles-renderer
    tilesRenderer.manager.addHandler(/\.gltf$|\.glb$/i, gltfLoader);
    console.log('Registered GLTF/GLB handler with DRACO');
    
    tilesRenderer.setCamera(camera);
    tilesRenderer.setResolutionFromRenderer(camera, window.renderer);
    
    // Loading settings - more aggressive for debugging
    tilesRenderer.errorTarget = 100;
    tilesRenderer.maxDepth = 15;
    tilesRenderer.loadSiblings = true;
    
    // Disable frustum culling on the group
    tilesRenderer.group.frustumCulled = false;
    
    // Track what's happening
    let loadedCount = 0;
    
    tilesRenderer.addEventListener('load-tile-set', (event) => {
      console.log('EVENT: load-tile-set - tileset.json loaded');
      console.log('Root children:', tilesRenderer.root?.children?.length);
    });
    
    tilesRenderer.addEventListener('load-content', (event) => {
      loadedCount++;
      const uri = event.tile?.content?.uri || 'unknown';
      console.log(`EVENT: load-content #${loadedCount} - ${uri}`);
      
      // Check what got loaded
      let meshCount = 0;
      tilesRenderer.group.traverse(obj => {
        if (obj.isMesh) meshCount++;
      });
      console.log(`Total meshes in group now: ${meshCount}`);
    });
    
    tilesRenderer.addEventListener('load-model', (event) => {
      console.log('EVENT: load-model', event);
    });
    
    tilesRenderer.addEventListener('error', (event) => {
      console.error('EVENT: error', event);
    });
    
    // Add to scene
    scene.add(tilesRenderer.group);
    console.log('Tileset group added to scene');
    
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
 * Debug: get the tileset's internal state
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
  
  console.log('=== Tileset Transform Debug ===');
  console.log('Root transform:', tilesRenderer.root.transform?.elements);
  console.log('Group position:', tilesRenderer.group.position);
  console.log('Group world position:', tilesRenderer.group.getWorldPosition(new THREE.Vector3()));
  console.log('Origin WGS84:', tilesetOriginWgs84);
  
  let meshCount = 0;
  let totalVerts = 0;
  tilesRenderer.group.traverse((obj) => {
    if (obj.isMesh) {
      meshCount++;
      totalVerts += obj.geometry.attributes.position?.count || 0;
    }
  });
  console.log('Meshes in group:', meshCount);
  console.log('Total vertices:', totalVerts);
  
  // Log stats
  console.log('Stats:', tilesRenderer.stats);
}
