// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  // This is needed for the OBC worker files
  server: {
    fs: {
      strict: false,
    },
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});