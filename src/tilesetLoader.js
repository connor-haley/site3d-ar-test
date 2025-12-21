import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { getTilesetOriginFromTransform, computeTilesetTransform, ecefToWgs84 } from './geospatialTransform.js';

let tilesRenderer = null;
let tilesetOriginWgs84 = null;

/**
 * Load a 3D Tiles tileset
 * Returns a promise that resolves when the root tile is loaded
 */
export async function loadTileset(url, scene, camera) {
  return new Promise((resolve, reject) => {
    console.log('Loading tileset from:', url);
    
    tilesRenderer = new TilesRenderer(url);
    
    tilesRenderer.setCamera(camera);
    tilesRenderer.setResolutionFromRenderer(camera, window.renderer);
    
    // Called when root tileset.json is loaded
    tilesRenderer.addEventListener('load-tile-set', (event) => {
      console.log('Tileset JSON loaded');
      
      // Extract the geospatial origin from the root transform
      const root = tilesRenderer.root;
      if (root && root.transform) {
        // The transform is a THREE.Matrix4, get its elements
        const transformArray = root.transform.elements;
        tilesetOriginWgs84 = getTilesetOriginFromTransform(transformArray);
        console.log('Tileset origin (WGS84):', tilesetOriginWgs84);
      }
    });
    
    // Called when a tile's content (GLB) is loaded
    tilesRenderer.addEventListener('load-content', (event) => {
      console.log('Tile content loaded:', event.tile?.content?.uri);
    });
    
    // Handle errors
    tilesRenderer.addEventListener('error', (event) => {
      console.error('Tileset error:', event);
      reject(event);
    });
    
    // Add to scene
    scene.add(tilesRenderer.group);
    
    // Wait for initial load
    const checkLoaded = () => {
      if (tilesRenderer.root) {
        resolve(tilesRenderer);
      } else {
        setTimeout(checkLoaded, 100);
      }
    };
    
    // Start loading
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
 * Apply geospatial positioning to the tileset based on calibration
 */
export function positionTileset() {
  if (!tilesRenderer || !tilesetOriginWgs84) {
    console.warn('Cannot position tileset - not loaded yet');
    return;
  }

  const transform = computeTilesetTransform(tilesetOriginWgs84);
  
  // Apply to the tileset's group
  // Note: 3DTilesRenderer already applies the ECEF transform internally.
  // We need to counteract that and apply our local positioning instead.
  // This is the tricky part - we may need to adjust this approach.
  
  tilesRenderer.group.matrix.copy(transform);
  tilesRenderer.group.matrixAutoUpdate = false;
  
  console.log('Tileset positioned at:', tilesRenderer.group.position);
}

/**
 * Alternative approach: directly set position/rotation on the group
 */
export function positionTilesetDirect(position, rotation) {
  if (!tilesRenderer) {
    console.warn('Cannot position tileset - not loaded yet');
    return;
  }
  
  tilesRenderer.group.position.copy(position);
  if (rotation) {
    tilesRenderer.group.rotation.copy(rotation);
  }
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
    total: tilesRenderer.stats?.parsing || 0,
    loading: tilesRenderer.stats?.downloading > 0
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
  console.log('Group rotation:', tilesRenderer.group.rotation);
  console.log('Origin WGS84:', tilesetOriginWgs84);
}
