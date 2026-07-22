import { defineConfig } from "vite";

// Static build. `base: "./"` makes the built asset URLs relative so the app can
// be served from any subpath (e.g. GitHub Pages project sites).
export default defineConfig({
  base: "./",
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
