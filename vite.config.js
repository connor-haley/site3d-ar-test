import { defineConfig } from 'vite';

export default defineConfig({
  base: '/site3d-ar-test/',  // Your repo name
  server: {
    https: false,
    host: true,
    port: 5173
  },
  build: {
    target: 'esnext'
  }
});