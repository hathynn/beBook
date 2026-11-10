import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend không cài @types/node → khai báo tối thiểu cho process.env
declare const process: { env: Record<string, string | undefined> };

// Phải trùng với cổng của server (server/src/index.ts, mặc định 4000)
const API_PORT = process.env.BEBOOK_API_PORT || "4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
