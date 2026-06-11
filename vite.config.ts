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
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'placeholder.svg'],
      manifest: {
        name: 'Dom Vere',
        short_name: 'DomVere',
        description: 'App do Cliente - Dom Vere Barbearia',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/cliente',
        start_url: '/cliente',
        icons: [
          {
            src: 'placeholder.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'placeholder.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
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
