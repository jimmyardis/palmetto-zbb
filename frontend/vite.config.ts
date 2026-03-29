import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/agencies':       'http://localhost:8001',
      '/agency':         'http://localhost:8001',
      '/ask':            'http://localhost:8001',
      '/scenario':       'http://localhost:8001',
      '/sandbox':        'http://localhost:8001',
      '/health':         'http://localhost:8001',
      '/reconciliation': 'http://localhost:8001',
    },
  },
})
