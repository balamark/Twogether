import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const version: string =
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version || '0.0.0'

// Short commit hash of the build, baked into the bundle for the footer's
// release line. Falls back gracefully where git isn't available.
const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
})()

// Release time = the COMMIT's timestamp, not the build wall clock. This keeps
// builds deterministic: the same commit always produces byte-identical
// bundles. A wall-clock value here took production down — App Engine's Node
// buildpack reruns `npm run build` at deploy time, and the container's
// regenerated index.html pointed at a bundle hash the CI-uploaded static
// files didn't have (blank page, entry JS 404).
const commitTime = (() => {
  try {
    return execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim()
  } catch {
    return new Date().toISOString()
  }
})()

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Define CSP based on environment
  const getCSP = () => {
    const baseCSP = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "worker-src 'self' blob:",
      "frame-src 'none'",
      "object-src 'none'",
      // Allow the checkout form to POST to ECPay's hosted payment page.
      "form-action 'self' https://payment-stage.ecpay.com.tw https://payment.ecpay.com.tw"
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
  plugins: [react()],
  // Build metadata for the footer release line — refreshed on every build,
  // so each deployed commit shows its own version/time/hash.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(commitTime),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
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
