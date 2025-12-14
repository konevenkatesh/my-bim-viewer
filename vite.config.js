// vite.config.js
import { defineConfig } from "vite";
import electron from "vite-plugin-electron";

export default defineConfig({
  plugins: [
    electron([
      {
        // Main-process entry file of the Electron app.
        entry: "electron/main.js",
      },
      {
        entry: "electron/preload.js",
        onstart(options) {
          // Notifies the preloader script to reload the page
          options.reload();
        },
      },
    ]),
  ],
  // This is needed for the OBC worker files
  server: {
    fs: {
      strict: false,
    },
  },
});