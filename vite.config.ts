import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Define CSP based on environment
  const getCSP = () => {
    const baseCSP = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "frame-src 'none'",
      "object-src 'none'"
    ];

    // Development-specific connect-src
    if (mode === 'development') {
      baseCSP.push("connect-src 'self' ws: wss: http://localhost:* https://gqhoebnveeaishflmkqv.supabase.co https://*.supabase.co https://*.supabase.io");
    } else {
      // Production - more restrictive
      baseCSP.push("connect-src 'self' https://gqhoebnveeaishflmkqv.supabase.co https://*.supabase.co https://*.supabase.io");
    }

    return baseCSP.join('; ');
  };

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker filename
      filename: 'sw.js',
      // Include these assets in the pre-cache manifest
      includeAssets: [
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-152x152.png',
        'pwa-120x120.png',
        'images/**/*',
      ],
      manifest: {
        name: 'Twogether',
        short_name: 'Twogether',
        description: '專為現代情侶設計的親密時光追蹤應用程式，攜手共度，讓愛情更美好',
        theme_color: '#E91E63',
        background_color: '#1a0a1e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-120x120.png',
            sizes: '120x120',
            type: 'image/png',
          },
          {
            src: 'pwa-152x152.png',
            sizes: '152x152',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cache JS, CSS, HTML, images, fonts, and SVGs
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cache API responses with a network-first strategy
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache API calls to our own backend
            urlPattern: /\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // Add the base path here for production builds
  // This tells Vite to generate asset paths relative to the HTML file's location
  base: './', // <--- ADD THIS LINE FOR STATIC HOSTING
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      }
    },
          headers: {
        'Content-Security-Policy': getCSP()
      }
    },
      preview: {
      port: 5174,
      host: true,
    },
    build: {
      sourcemap: false,
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            vendor: ['lucide-react', '@headlessui/react', '@heroicons/react'],
            router: ['react-router-dom'],
            utils: ['date-fns', 'axios']
          }
        }
      }
    },
    esbuild: {
      legalComments: 'none',
    }
  };
});
