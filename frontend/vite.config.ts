import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
      baseCSP.push("connect-src 'self' ws: wss: http://localhost:8080 https://gqhoebnveeaishflmkqv.supabase.co https://*.supabase.co https://*.supabase.io");
    } else {
      // Production - more restrictive
      baseCSP.push("connect-src 'self' https://gqhoebnveeaishflmkqv.supabase.co https://*.supabase.co https://*.supabase.io");
    }

    return baseCSP.join('; ');
  };

  return {
  plugins: [react()],
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
    },
    esbuild: {
      legalComments: 'none',
    }
  };
});
