import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // dev only: the API comes from scripts/serve.py
  server: { host: "127.0.0.1", port: 5180, proxy: { "/api": "http://127.0.0.1:4180" } },
  preview: { host: "127.0.0.1", port: 4180 },
});
