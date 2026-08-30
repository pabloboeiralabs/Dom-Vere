import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/uazapi": {
        target: "https://ipazua.uazapi.com",
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            // Dynamic routing: use X-Target-Api-Url header if provided
            const targetUrl = req.headers["x-target-api-url"] as string;
            if (targetUrl) {
              try {
                const parsed = new URL(targetUrl);
                proxyReq.setHeader("host", parsed.host);
                // Update the proxy target dynamically
                (req as any).__targetUrl = targetUrl;
              } catch {}
            }
          });
        },
        router: (req: any) => {
          const targetUrl = req.headers["x-target-api-url"] as string;
          if (targetUrl) {
            try {
              const parsed = new URL(targetUrl);
              return `${parsed.protocol}//${parsed.host}`;
            } catch {}
          }
          return "https://ipazua.uazapi.com";
        },
        rewrite: (path) => path.replace(/^\/api\/uazapi/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Core vendor
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router")) return "vendor";
          // UI library
          if (id.includes("node_modules/@radix-ui")) return "ui";
          // Charts
          if (id.includes("node_modules/recharts")) return "charts";
          // Supabase
          if (id.includes("node_modules/@supabase")) return "supabase";
          // Date utilities
          if (id.includes("node_modules/date-fns")) return "datefns";
          // Large isolated libs
          if (id.includes("node_modules/xlsx")) return "xlsx";
          if (id.includes("node_modules/framer-motion")) return "framer";
          if (id.includes("node_modules/qrcode")) return "qrcode";
          if (id.includes("node_modules/@xyflow")) return "xyflow";
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Use custom service worker with push/notification handlers
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,json,woff2}'],
      },
      includeAssets: ['favicon.ico', 'placeholder.svg', 'client-icon-192.png', 'client-icon-512.png', 'barber-icon-192.png', 'barber-icon-512.png'],
      manifest: {
        name: 'Dom Vere - Cliente',
        short_name: 'DomVere',
        description: 'App do Cliente - Dom Vere Barbearia',
        theme_color: '#10162e',
        background_color: '#10162e',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'client-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'client-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
