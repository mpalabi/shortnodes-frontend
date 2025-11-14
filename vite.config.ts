import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Avoid Node path/__dirname usage to keep TS happy without @types/node in CI

// Single config export
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': {}
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
        'process.env': '{}'
      }
    }
  },
  resolve: {
    alias: {}
  },
  css: {
    preprocessorOptions: {
      scss: {
        // keep default options; no includePaths (not supported in current typings)
      }
    }
  }
})
