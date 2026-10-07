import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/sim": "http://localhost:3000",
      "/mcp": "http://localhost:3000",
    },
  },
});
