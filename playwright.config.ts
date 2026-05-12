import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.test so `npx playwright test` works without manual env exports.
// We intentionally do NOT load .env or .env.local here — tests must always
// use the locked-down test config which points at the local test DB.
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5174',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    /* Test against mobile viewports only for now */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'node scripts/setup-test-db.js && node server.js',
      url: 'http://localhost:8080',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://twogether:twogether123@localhost:5432/twogether_test',
        JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
        PORT: '8080'
      }
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 180 * 1000,
    }
  ],
});
