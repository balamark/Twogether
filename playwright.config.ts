import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { TEST_NEWEBPAY } from './tests/helpers/newebpay';

dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true });

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5174',

    trace: 'on-first-retry',
    
    screenshot: 'only-on-failure',
    
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /(wall-media-ui|wall-media-edit-ui|mobile-tap-ergonomics|destructive-action-guards)\.spec\.ts/,
    },
  ],

  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',

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
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'test-admin-pw',
        MARKETPLACE_BOT_API_KEY: 'test-marketplace-bot-key',
        MARKETPLACE_BOT_AUTHOR_EMAIL: 'test-e2e@twogether.app',
        FRONTEND_URL: 'http://localhost:5174',
        LLM_PROVIDER: 'mock',
        LINE_CHANNEL_ID: 'test-line-channel',
        LINE_CHANNEL_SECRET: 'test-line-secret',
        NEWEBPAY_MERCHANT_ID: TEST_NEWEBPAY.merchantId,
        NEWEBPAY_HASH_KEY: TEST_NEWEBPAY.hashKey,
        NEWEBPAY_HASH_IV: TEST_NEWEBPAY.hashIV,
        APP_BASE_URL: 'http://localhost:8080',
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
