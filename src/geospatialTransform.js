import * as THREE from 'three';

// WGS84 ellipsoid constants
const WGS84_A = 6378137.0;           // Semi-major axis (meters)
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
  // When heading = 0 (facing north): north = -Z, east = +X
  const cosH = Math.cos(calibration.headingRad);
  const sinH = Math.sin(calibration.headingRad);

  const localX = eastMeters * cosH - northMeters * sinH;
  const localZ = -(eastMeters * sinH + northMeters * cosH);
  const localY = upMeters;

  return new THREE.Vector3(localX, localY, localZ);
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
