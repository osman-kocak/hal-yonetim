import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-vendor'
          if (id.includes('xlsx')) return 'xlsx-vendor'
          if (id.includes('react-router')) return 'react-vendor'
          if (id.includes('/react/') || id.includes('react-dom')) return 'react-vendor'
          if (id.includes('lucide-react')) return 'ui-vendor'
          if (id.includes('zustand')) return 'ui-vendor'
        },
      },
    },
  },
})
