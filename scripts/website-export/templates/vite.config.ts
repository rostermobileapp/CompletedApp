import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.join(root, "src"), "@assets": path.join(root, "assets"), "@shared": path.join(root, "shared") } },
  server: { host: "0.0.0.0", port: 5000, strictPort: true, allowedHosts: true },
  build: { outDir: "dist" },
});
