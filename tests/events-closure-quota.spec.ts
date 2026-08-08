import { test, expect } from '@playwright/test';
import {
  seedAuth,
  seedClosure,
  seedQuota,
  openEventDetail,
  AI_QUOTA_ERROR,
} from './helpers/closure';

// 幫我想一個 spends the daily AI budget, and the closure composer is the one
// place where running out must NOT block you: the commitment is yours to write,
// AI or not. Playbook §6 Q4 — the quota is a slope, not a wall.

test.describe('一起收尾 — 幫我想一個 quota', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test('the remaining-count hint is visible next to both AI buttons', async ({ page }) => {
    test.setTimeout(60000);
    await seedQuota(page, 3, 10);
    await seedClosure(page);
    await openEventDetail(page);

    // One on ① 我的約定, one on ② 我們一起決定 — both spend the same budget, so
    // hiding it on one made the limit feel arbitrary (2.7).
    await expect(page.getByTestId('ai-quota-hint')).toHaveCount(2);
    await expect(page.getByTestId('ai-quota-hint').first()).toContainText('還剩 7 次');
  });

  test('a spent quota is a warning plus the paywall, and the ceremony survives it', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await seedQuota(page, 10, 10);
    const fx = await seedClosure(page);
    fx.on('assist', () => AI_QUOTA_ERROR);

    await openEventDetail(page);

    // Exhausted hint explains rather than greying the button out.
    await expect(page.getByTestId('ai-quota-hint').first()).toContainText('今日 AI 次數已用完');
    await expect(page.getByTestId('closure-assist-button')).toBeEnabled();

    await page.getByTestId('closure-commitment-input').fill('要動孩子之前，我會先問你一聲');
    await page.getByTestId('closure-assist-button').click();

    // warning (yellow), not error (red): a reached quota is an expected state,
    // and the message names what you can still do.
    const toast = page.locator('.bg-yellow-50').filter({ hasText: '今日 AI 次數已用完' });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('你仍然可以自己寫');
    await expect(page.locator('.bg-red-50')).toHaveCount(0);

    // Any freemium 429 also fires `billing:limit-reached` in the api
    // interceptor, and App answers it by switching to the upgrade view — the
    // paywall lives in one place for every capped feature. So the ceremony is
    // left behind here, with the typed (never-sent) draft. Asserted because it
    // IS the behaviour, not because it's ideal.
    await expect(page.getByText('升級 Twogether Premium')).toBeVisible();

    // Coming back, the ceremony is exactly where it was and finishing without
    // AI still works — the quota never blocks writing your own commitment.
    await page.getByTestId('nav-tab-communicate').click();
    await page.locator('text=接送小孩的分工').first().click();
    await expect(page.getByTestId('closure-composer-screen')).toBeVisible();

    await page.getByTestId('closure-commitment-input').fill('出門前十分鐘我會先叫你一聲');
    await expect(page.getByTestId('closure-submit-button')).toBeEnabled();
    await page.getByTestId('closure-submit-button').click();
    await expect(page.getByTestId('closure-waiting-card')).toBeVisible();
    expect(fx.actions()).toContain('closure/submit');
  });

  test('a successful 幫我想一個 offers options and one tap fills the textarea', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await seedQuota(page, 1, 10);
    await seedClosure(page);
    await openEventDetail(page);

    await page.getByTestId('closure-assist-button').click();
    await expect(page.getByTestId('closure-assist-option-0')).toBeVisible();
    const first = (await page.getByTestId('closure-assist-option-0').innerText()).trim();
    await page.getByTestId('closure-assist-option-0').click();
    await expect(page.getByTestId('closure-commitment-input')).toHaveValue(first);
  });
});
