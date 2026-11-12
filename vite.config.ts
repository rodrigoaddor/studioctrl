import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "StudioCTRL",
        short_name: "StudioCTRL",
        description: "A focused remote controller for OBS Studio Mode.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#080b0c",
        theme_color: "#080b0c",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
        navigateFallback: "/index.html",
        navigateFallbackAllowlist: [/^\/$/, /^\/studio\/?$/],
        cleanupOutdatedCaches: true,
        // New releases wait for the operator's explicit reload action.
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    allowedHosts: [".d.rodr.dev"],
    host: '0.0.0.0',
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
