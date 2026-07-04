import { test, expect } from '@playwright/test';

// The footer release line (version | environment | build time | commit hash)
// is baked in at build time by vite.config.ts `define` and must render for
// every visitor — logged in or out.
test('footer shows the release line with version, env, build time, and commit hash', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const buildInfo = page.getByTestId('build-info');
  await buildInfo.scrollIntoViewIfNeeded();
  await expect(buildInfo).toBeVisible({ timeout: 10000 });

  // v1.0.0 | development | 2026/7/4 上午10:19:51 | ab12cd3
  await expect(buildInfo).toHaveText(
    /^v\d+\.\d+\.\d+ \| (development|production|test) \| .+ \| [0-9a-f]{7,}|unknown$/
  );
});
