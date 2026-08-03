import { defineConfig, devices } from '@playwright/test';
const deployed = Boolean(process.env.PLAYWRIGHT_BASE_URL);
export default defineConfig({
  testDir: './tests', testMatch: 'homepage.spec.ts', use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4321', ...devices['Desktop Chrome'] },
  webServer: deployed ? undefined : { command: 'npm run preview -- --host 127.0.0.1', port: 4321, reuseExistingServer: false },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
