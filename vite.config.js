// vite.config.js
import { resolve } from "path";
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
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer.html'),
        analysis: resolve(__dirname, 'analysis.html'),
      },
    },
  }
});