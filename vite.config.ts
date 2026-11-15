import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the side panel into extension/, which is what Chrome loads unpacked.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "extension",
    emptyOutDir: true,
    target: "chrome116",
    rollupOptions: { input: "panel.html" },
  },
});
