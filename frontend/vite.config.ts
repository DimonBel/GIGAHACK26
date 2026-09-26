import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // The API (server/: python -m api) is served under the same origin, so its session cookie just works.
  server: {
    proxy: { "/api": { target: process.env.API_URL ?? "http://127.0.0.1:8000", changeOrigin: false } },
  },
});
