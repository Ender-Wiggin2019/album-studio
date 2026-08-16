import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../packages/studio/src'),
      '@album-studio/common': resolve(__dirname, '../../packages/common/src/index.ts'),
      '@album-studio/studio': resolve(__dirname, '../../packages/studio/src/index.ts')
    }
  },
  plugins: [react(), tailwindcss()],
  server: {
    open: true
  }
})
