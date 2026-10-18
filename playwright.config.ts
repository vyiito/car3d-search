import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // The shared CI runner renders WebGL on the CPU; parallel viewers contend for it.
  workers: process.env.CI ? 1 : undefined,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  reporter: 'list',
})
