import { test, expect } from '@playwright/test';
import { seedAuth, seedClosure, seedQuota, EVENT_TITLE } from './helpers/closure';

// 好好說話's two sub-views used to look and sound like two different apps, and
// on a 390px screen they cost THREE rows of pills before any content (main nav
// → sub-tab chips → EventsView's 歷史/開始對話/分析). Part 3 of the closure
// review collapsed that; this pins what a user can actually see and reach.

test.describe('好好說話 — one feature, two sub-views', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await seedQuota(page, 1, 10);
    await seedClosure(page, { event: { status: 'open' } });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-communicate').click();
  });

  test('each sub-view is titled after the chip you tapped, with no third pill row', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // 說開一件事: the old 歷史／開始對話／分析 row is gone — 開始對話 is a primary
    // button in the list header and 分析 is an icon beside it.
    await expect(page.getByRole('heading', { name: /說開一件事/ })).toBeVisible();
    await expect(page.getByTestId('events-compose-button')).toBeVisible();
    await expect(page.getByTestId('events-analytics-button')).toBeVisible();
    await expect(page.locator(`text=${EVENT_TITLE}`).first()).toBeVisible();

    // 分析 has to be escapable without the tab row that used to carry 歷史.
    await page.getByTestId('events-analytics-button').click();
    await expect(page.getByTestId('events-analytics-back')).toBeVisible();
    await page.getByTestId('events-analytics-back').click();
    await expect(page.getByTestId('events-compose-button')).toBeVisible();

    await page.getByTestId('communicate-subtab-harmony').click();
    await expect(page.getByRole('heading', { name: /接住情緒/ })).toBeVisible();
  });

  test('the sub-tab row survives a scroll, so the other half stays reachable', async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.getByTestId('communicate-subtab-harmony').click();
    await expect(page.getByRole('heading', { name: /接住情緒/ })).toBeVisible();

    // 接住情緒 is a long page with its own sticky section nav. Before 3.3 that
    // nav was also at top-0 and REPLACED the sub-tab row on scroll, stranding
    // you in one sub-view.
    await page.mouse.wheel(0, 2000);
    await expect(page.getByTestId('communicate-subtab-events')).toBeInViewport();

    await page.getByTestId('communicate-subtab-events').click();
    await expect(page.getByRole('heading', { name: /說開一件事/ })).toBeVisible();
  });

  test('寫下我的情緒，讓對方接住 lands on the composer, not the history list', async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.getByTestId('communicate-subtab-harmony').click();
    await page.getByTestId('conflict-compose-event').click();

    await expect(page.getByTestId('compose-raw-input')).toBeVisible();

    // Consume-once: leaving and coming back must NOT drop you in the composer
    // again.
    await page.getByTestId('communicate-subtab-harmony').click();
    await page.getByTestId('communicate-subtab-events').click();
    await expect(page.getByTestId('events-compose-button')).toBeVisible();
    await expect(page.getByTestId('compose-raw-input')).toHaveCount(0);
  });
});
