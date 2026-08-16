import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev:test -- --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
})
