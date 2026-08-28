import { test, expect } from '@playwright/test';
import { seedAuth, seedClosure, seedQuota, EVENT_TITLE } from './helpers/closure';

// 對話 is a hub of cards, not a page with a sticky sub-tab row. The row could
// only ever hold two destinations and it cost vertical space on every screen
// below it; as cards, 說開一件事 and 情緒檢查 sit alongside 角色扮演, 我們的牆
// and 專業諮商師 and cost nothing when you are not looking at them.
//
// What this pins: every destination is reachable from the hub, each one owns
// the whole screen once opened, and the 對話 tab is the way back.

test.describe('對話 — a hub of cards', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await seedQuota(page, 1, 10);
    await seedClosure(page, { event: { status: 'open' } });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-talk').click();
  });

  test('the hub lists every way into a conversation, and no sub-tab row', async ({ page }) => {
    test.setTimeout(60000);

    await expect(page.getByTestId('talk-hub')).toBeVisible();
    for (const id of [
      'talk-events-entry',
      'talk-conflict-entry',
      'talk-roleplay-entry',
      'talk-wall-entry',
      'talk-therapists-entry',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // The row this replaced is gone for good.
    await expect(page.getByTestId('communicate-subtab-events')).toHaveCount(0);
    await expect(page.getByTestId('communicate-subtab-harmony')).toHaveCount(0);
  });

  test('說開一件事 opens full screen, with no third pill row', async ({ page }) => {
    test.setTimeout(60000);

    await page.getByTestId('talk-events-entry').click();

    // The old 歷史／開始對話／分析 row is gone — 開始對話 is a primary button in
    // the list header and 分析 is an icon beside it.
    await expect(page.getByRole('heading', { name: /說開一件事/ })).toBeVisible();
    await expect(page.getByTestId('events-compose-button')).toBeVisible();
    await expect(page.getByTestId('events-analytics-button')).toBeVisible();
    await expect(page.locator(`text=${EVENT_TITLE}`).first()).toBeVisible();

    // 分析 has to be escapable without a tab row to carry 歷史.
    await page.getByTestId('events-analytics-button').click();
    await expect(page.getByTestId('events-analytics-back')).toBeVisible();
    await page.getByTestId('events-analytics-back').click();
    await expect(page.getByTestId('events-compose-button')).toBeVisible();
  });

  test('the 對話 tab is the way back to the hub from a destination', async ({ page }) => {
    test.setTimeout(60000);

    await page.getByTestId('talk-conflict-entry').click();
    await expect(page.getByRole('heading', { name: /接住情緒/ })).toBeVisible();

    // 接住情緒 is a long page with its own sticky section nav; scrolling past it
    // must not strand you there.
    await page.mouse.wheel(0, 2000);
    await page.getByTestId('nav-tab-talk').click();
    await expect(page.getByTestId('talk-hub')).toBeVisible();

    await page.getByTestId('talk-events-entry').click();
    await expect(page.getByRole('heading', { name: /說開一件事/ })).toBeVisible();
  });

  test('寫下我的情緒，讓對方接住 lands on the composer, not the history list', async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.getByTestId('talk-conflict-entry').click();
    await page.getByTestId('conflict-compose-event').click();

    await expect(page.getByTestId('compose-raw-input')).toBeVisible();

    // Consume-once: leaving and coming back must NOT drop you in the composer
    // again.
    await page.getByTestId('nav-tab-talk').click();
    await page.getByTestId('talk-events-entry').click();
    await expect(page.getByTestId('events-compose-button')).toBeVisible();
    await expect(page.getByTestId('compose-raw-input')).toHaveCount(0);
  });
});
