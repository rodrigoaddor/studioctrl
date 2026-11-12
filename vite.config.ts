import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    allowedHosts: [".d.rodr.dev"],
    https:
      command === "serve" && mode !== "test"
        ? {
            key: readFileSync(new URL("./.cert/key.pem", import.meta.url)),
            cert: readFileSync(new URL("./.cert/cert.pem", import.meta.url)),
          }
        : undefined,
  },
  test: { environment: "node", include: ["tests/**/*.test.{ts,tsx}"] },
}));
