# Geospatial AR Viewer

View georeferenced 3D Tiles in AR on Meta Quest 3S.

## Prerequisites

- Node.js 18+
- Meta Quest 3 or 3S
- Quest and computer on same WiFi network
- 3D Tiles tileset hosted somewhere accessible (S3, etc.)

## Setup

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The server will start on `https://YOUR_IP:5173`. Note the HTTPS - WebXR requires it.

## Usage

1. **On your Quest:** Open the Meta Quest Browser

2. **Navigate to:** `https://YOUR_COMPUTER_IP:5173`
   - Find your computer's IP with `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
   - Accept the self-signed certificate warning

3. **Fill in the form:**
   - **Tileset URL:** Full URL to your tileset.json
   - **Your Latitude/Longitude:** Where you're standing right now
   - **Your Altitude:** Height above sea level in meters (estimate is fine for testing)
   - **Heading:** Direction you're facing (0 = North, 90 = East, etc.)

4. **Tap "Enter AR"** and grant camera permissions

5. **Look around** - your 3D model should appear in the real world

## Getting Your Coordinates

### Quick method (Google Maps):
1. Open Google Maps on your phone
2. Long-press on your exact location
3. Coordinates appear at the top - tap to copy

### More accurate:
- Use a GPS app that shows coordinates (many free options)
- For altitude, use an altimeter app or look up your area's elevation

## Troubleshooting

### "AR not supported"
- Make sure you're using Quest Browser (not a sideloaded browser)
- Try restarting the Quest

### Model appears in wrong place
- Double-check your coordinates
- Heading is most likely culprit - try adjusting in 45° increments
- Altitude errors cause vertical offset

### Model doesn't appear at all
- Check browser console for errors
- Make sure tileset URL is accessible (CORS enabled)
- Verify tileset.json is valid 3D Tiles format

### Performance issues
- Move closer to the model
- Large tilesets may load slowly on first view

## URL Parameters

For convenience, you can pass parameters in the URL:

```
https://localhost:5173/?tileset=URL&lat=37.4419&lon=-122.143&alt=10&heading=0
```

## Architecture

```
src/
├── main.js                 # Entry point, WebXR setup
├── geospatialTransform.js  # WGS84 <-> local coordinate math
└── tilesetLoader.js        # 3D Tiles loading wrapper
```

## Next Steps (Phase 2)

- iPhone app that sends GPS coordinates over Bluetooth
- Continuous drift correction
- RTK GNSS support for centimeter accuracy
