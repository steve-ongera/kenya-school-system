import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
    server: {
    host: "0.0.0.0",
    port: 5174,
    allowedHosts: [
      "1c46-102-204-91-92.ngrok-free.app",
    ],
  }
});
