import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    https: true,  // WebXR requires HTTPS
    host: true,   // Listen on all interfaces (so Quest can connect)
    port: 5173
  },
  build: {
    target: 'esnext'
  }
});
