import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/test_web/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@xenova/transformers']
  },
  worker: {
    format: 'es'
  }
})
