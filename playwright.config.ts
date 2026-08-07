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
  /* Playwright's default is 30s, which several specs quietly outgrew: they
     drive real sign-up/upload flows against a live server and a cold Vite dev
     build, so a single `page.reload()` can eat most of the budget. They only
     stayed green because CI retries twice — locally, with retries off, they
     fail. Raising the floor makes the suite honest instead of retry-dependent.
     Specs that need longer still call test.setTimeout() themselves. */
  timeout: 60 * 1000,
  expect: {
    /* Matches the 15s waits several specs already pass explicitly. */
    timeout: 10 * 1000,
  },
  /* One worker everywhere, not just on CI. The DB-backed specs (custom-script,
     marketplace-flow, roleplay-favorites, user-journey, …) all drive the single
     shared account global-setup seeds, and several mutate the same script /
     favorite rows. `fullyParallel` runs different FILES concurrently, so with
     more than one worker those files corrupt each other's state — which is
     exactly why marketplace-flow already deletes its scripts in afterEach "to
     keep the parallel roleplay-favorites suite from flaking".

     Pinning to 1 makes local runs match CI, so a failure locally is a real
     failure rather than a collision artifact. The proper fix is per-file test
     accounts; until then, correctness beats wall-clock. */
  workers: 1,
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
    {
      // The iOS tap-offset class of bug only manifests in WebKit, so the specs
      // guarding it need a real WebKit run. Running all 40+ specs twice isn't
      // worth the CI minutes, hence the testMatch — keep this list to the specs
      // that actually assert mobile-Safari-specific behaviour.
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /(wall-media-ui|wall-media-edit-ui|mobile-tap-ergonomics|destructive-action-guards)\.spec\.ts/,
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
        // Enables the /admin dashboard in tests (adminAuth 503s without it).
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'test-admin-pw',
        // Deterministic + free: without this, a local .env with
        // LLM_PROVIDER=claude leaks into the test server and e2e runs bill
        // real Anthropic tokens with non-deterministic output.
        LLM_PROVIDER: 'mock',
        // Dummy LINE creds so isConfigured()=true and webhook signature verify
        // runs (sign+verify use the same test secret). Never the real secret —
        // that only lives in GitHub secrets → prod. Outbound push/reply no-op.
        LINE_CHANNEL_ID: 'test-line-channel',
        LINE_CHANNEL_SECRET: 'test-line-secret',
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
