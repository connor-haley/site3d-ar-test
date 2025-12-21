import * as THREE from 'three';

// WGS84 ellipsoid constants
const WGS84_A = 6378137.0;           // Semi-major axis (meters)
const WGS84_B = 6356752.314245;      // Semi-minor axis (meters)
const WGS84_E2 = 0.00669437999014;   // First eccentricity squared

// Meters per degree (approximate, varies with latitude)
const METERS_PER_DEGREE_LAT = 110540;

function metersPerDegreeLon(latDegrees) {
  const latRad = latDegrees * Math.PI / 180;
  return 111320 * Math.cos(latRad);
}

// Calibration state
let calibration = {
  isCalibrated: false,
  originLat: 0,
  originLon: 0,
  originAlt: 0,
  headingDegrees: 0,
  headingRad: 0,
};

/**
 * Set the calibration origin - the WGS84 position that corresponds to 
 * the Quest's current local origin (0,0,0)
 */
export function setCalibrationOrigin(lat, lon, alt, headingDegrees) {
  calibration.originLat = lat;
  calibration.originLon = lon;
  calibration.originAlt = alt;
  calibration.headingDegrees = headingDegrees;
  // Convert heading: geographic is clockwise from north, three.js rotation is CCW
  calibration.headingRad = -headingDegrees * Math.PI / 180;
  calibration.isCalibrated = true;
  
  console.log('Calibration set:', calibration);
}

export function isCalibrated() {
  return calibration.isCalibrated;
}

export function getCalibration() {
  return { ...calibration };
}

/**
 * Convert WGS84 lat/lon/alt to local three.js coordinates
 * Uses local tangent plane (ENU) approximation centered on calibration origin
 */
export function wgs84ToLocal(lat, lon, alt) {
  if (!calibration.isCalibrated) {
    console.warn('Not calibrated - returning zero vector');
    return new THREE.Vector3(0, 0, 0);
  }

  const deltaLat = lat - calibration.originLat;
  const deltaLon = lon - calibration.originLon;
  const deltaAlt = alt - calibration.originAlt;

  // Convert to meters in ENU (East-North-Up)
  const eastMeters = deltaLon * metersPerDegreeLon(calibration.originLat);
  const northMeters = deltaLat * METERS_PER_DEGREE_LAT;
  const upMeters = deltaAlt;

  // Apply heading rotation and convert to three.js coordinates
  // three.js: X = right, Y = up, Z = back (toward camera)
  // We want: when heading = 0 (facing north), north = -Z, east = +X
  const cosH = Math.cos(calibration.headingRad);
  const sinH = Math.sin(calibration.headingRad);

  const localX = eastMeters * cosH - northMeters * sinH;
  const localZ = -(eastMeters * sinH + northMeters * cosH);
  const localY = upMeters;

  return new THREE.Vector3(localX, localY, localZ);
}

/**
 * Convert ECEF (Earth-Centered Earth-Fixed) coordinates to WGS84 lat/lon/alt
 * This is what 3D Tiles uses in its transform matrices
 */
export function ecefToWgs84(x, y, z) {
  const p = Math.sqrt(x * x + y * y);
  const lon = Math.atan2(y, x);
  
  // Iterative calculation for latitude
  let lat = Math.atan2(z, p * (1 - WGS84_E2));
  for (let i = 0; i < 5; i++) {
    const sinLat = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    lat = Math.atan2(z + WGS84_E2 * N * sinLat, p);
  }
  
  const sinLat = Math.sin(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const alt = p / Math.cos(lat) - N;

  return {
    lat: lat * 180 / Math.PI,
    lon: lon * 180 / Math.PI,
    alt: alt
  };
}

/**
 * Convert WGS84 to ECEF
 */
export function wgs84ToEcef(lat, lon, alt) {
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);
  
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  
  const x = (N + alt) * cosLat * cosLon;
  const y = (N + alt) * cosLat * sinLon;
  const z = (N * (1 - WGS84_E2) + alt) * sinLat;
  
  return { x, y, z };
}

/**
 * Given a 3D Tiles transform matrix (column-major 4x4), extract the 
 * ECEF position and convert to WGS84
 */
export function getTilesetOriginFromTransform(transformArray) {
  // 3D Tiles transform is column-major, position is in last column
  // [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15]
  // Position: m12, m13, m14
  const ecefX = transformArray[12];
  const ecefY = transformArray[13];
  const ecefZ = transformArray[14];
  
  return ecefToWgs84(ecefX, ecefY, ecefZ);
}

/**
 * Compute the transform needed to position the tileset correctly in local space
 * Returns a THREE.Matrix4 to apply to the tileset's root object
 */
export function computeTilesetTransform(tilesetOriginWgs84) {
  if (!calibration.isCalibrated) {
    console.warn('Not calibrated - returning identity matrix');
    return new THREE.Matrix4();
  }

  // Get local position of the tileset origin
  const localPos = wgs84ToLocal(
    tilesetOriginWgs84.lat, 
    tilesetOriginWgs84.lon, 
    tilesetOriginWgs84.alt
  );

  // Create transform matrix
  const matrix = new THREE.Matrix4();
  
  // For now, just translation. The tileset's internal rotation (ENU to ECEF) 
  // is handled by 3DTilesRenderer. We just need to position it.
  // If alignment is off, we may need to add rotation here.
  matrix.setPosition(localPos);

  return matrix;
}

/**
 * Debug helper: print calibration info
 */
export function debugCalibration() {
  console.log('=== Calibration Debug ===');
  console.log('Origin:', calibration.originLat, calibration.originLon, calibration.originAlt);
  console.log('Heading:', calibration.headingDegrees, 'deg');
  console.log('Is calibrated:', calibration.isCalibrated);
  
  if (calibration.isCalibrated) {
    // Test conversion: 100m north should be roughly -100 on Z axis (when heading=0)
    const testPoint = wgs84ToLocal(
      calibration.originLat + 0.0009,  // ~100m north
      calibration.originLon,
      calibration.originAlt
    );
    console.log('Test: 100m north =>', testPoint);
  }
}
