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
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tabs",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tooltip",
          ],
          charts: ["recharts"],
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
      registerType: 'autoUpdate',
      injectRegister: 'auto',
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
