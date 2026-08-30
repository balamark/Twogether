import { test, expect } from '@playwright/test';
import { seedAuth, seedClosure, seedQuota, EVENT_TITLE } from './helpers/closure';

// 對話 lands straight on 說開一件事 (its core). The other four destinations
// live in a thin sticky switcher present on every 對話-family view, so you hop
// between them without going back. It replaced a card-hub landing page, which
// replaced a two-item sub-tab row.
//
// What this pins: the direct landing, the five-chip switcher, jumping between
// destinations, and that the switcher is still there on a destination page.

test.describe('對話 — a persistent switcher over 說開一件事', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await seedQuota(page, 1, 10);
    await seedClosure(page, { event: { status: 'open' } });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-talk').click();
  });

  test('對話 opens 說開一件事 directly, with a five-chip switcher and no sub-tab row', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Landed on 說開一件事, not a hub screen.
    await expect(page.getByRole('heading', { name: /說開一件事/ })).toBeVisible();
    await expect(page.locator(`text=${EVENT_TITLE}`).first()).toBeVisible();

    // The switcher carries all five, with 說開一件事 active.
    await expect(page.getByTestId('talk-switcher')).toBeVisible();
    for (const id of [
      'talk-events-entry',
      'talk-conflict-entry',
      'talk-roleplay-entry',
      'talk-wall-entry',
      'talk-therapists-entry',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('talk-events-entry')).toHaveAttribute('aria-selected', 'true');

    // The old sub-tab row is gone; so is the events 歷史／開始對話／分析 pill row.
    await expect(page.getByTestId('communicate-subtab-events')).toHaveCount(0);
    await expect(page.getByTestId('communicate-subtab-harmony')).toHaveCount(0);
    await expect(page.getByTestId('events-compose-button')).toBeVisible();
    await expect(page.getByTestId('events-analytics-button')).toBeVisible();
  });

  test('the switcher jumps straight to a sibling, and is still there when you arrive', async ({
    page,
  }) => {
    test.setTimeout(60000);

    await page.getByTestId('talk-conflict-entry').click();
    await expect(page.getByRole('heading', { name: /接住情緒/ })).toBeVisible();
    // Still switchable from here — no going back to find the others.
    await expect(page.getByTestId('talk-switcher')).toBeVisible();
    await expect(page.getByTestId('talk-conflict-entry')).toHaveAttribute('aria-selected', 'true');

    // Hop back to 說開一件事 from the destination itself.
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
    await page.getByTestId('talk-conflict-entry').click();
    await page.getByTestId('talk-events-entry').click();
    await expect(page.getByTestId('events-compose-button')).toBeVisible();
    await expect(page.getByTestId('compose-raw-input')).toHaveCount(0);
  });
});
