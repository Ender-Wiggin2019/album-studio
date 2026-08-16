import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../packages/studio/src'),
      '@album-studio/common': resolve(__dirname, '../../packages/common/src/index.ts'),
      '@album-studio/studio': resolve(__dirname, '../../packages/studio/src/index.ts')
    }
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['../../packages/studio/src/test/setup.ts'],
    restoreMocks: true
  }
})
