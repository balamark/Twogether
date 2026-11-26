import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const version: string =
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version || '0.0.0'

const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
})()

const commitTime = (() => {
  try {
    return execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim()
  } catch {
    return new Date().toISOString()
  }
})()

export default defineConfig(({ mode }) => {
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
      "form-action 'self' https://payment-stage.ecpay.com.tw https://payment.ecpay.com.tw https://ccore.newebpay.com https://core.newebpay.com"
    ];

    if (mode === 'development') {
      baseCSP.push("connect-src 'self' ws: wss: http://localhost:* https://gqhoebnveeaishflmkqv.supabase.co https://*.supabase.co https://*.supabase.io");
    } else {
      baseCSP.push("connect-src 'self' https://gqhoebnveeaishflmkqv.supabase.co https://*.supabase.co https://*.supabase.io");
    }

    return baseCSP.join('; ');
  };

  return {
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(commitTime),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  base: './',
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
