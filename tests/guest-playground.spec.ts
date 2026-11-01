import { test, expect } from '@playwright/test';

// 免註冊試玩 (src/components/guest/): logged-out visitors get an interactive,
// session-only sandbox seeded with sample data, plus a 30-second animated tour.

const KEY = 'tw_guest_playground_v1';

test.describe('guest playground', () => {
  test('seeds sample data on landing and keeps it only in sessionStorage', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('nav-tab-play')).toBeVisible();
    await expect.poll(() => page.evaluate((k) => !!sessionStorage.getItem(k), KEY)).toBe(true);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();

    await page.getByTestId('guest-play-teaser').click();
    await expect(page.getByTestId('guest-tutorial')).toBeVisible();
    await page.getByTestId('guest-tutorial-later').click();
    await expect(page.getByTestId('guest-tutorial')).toHaveCount(0);

    // #1 is selected and already shows a seeded analysis.
    await expect(page.getByTestId('guest-soften-result')).toBeVisible();
    await page.getByTestId('guest-soften-input').fill('你每次都不回訊息！');
    await page.getByTestId('guest-soften-run').click();
    await expect(page.getByTestId('guest-soften-rewrite')).toContainText('先跟我說一聲');

    // Tour doesn't re-fire in the same session; data survives reload.
    await page.reload();
    await expect(page.getByTestId('guest-playground')).toBeVisible();
    await expect(page.getByTestId('guest-tutorial')).toHaveCount(0);
    const st = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || '{}'), KEY);
    expect(st.softens.length).toBe(3);
  });

  test('every ranked feature is playable', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((k) => {
      const s = JSON.parse(sessionStorage.getItem(k) || '{}');
      sessionStorage.setItem(k, JSON.stringify({ ...s, tutorialSeen: true }));
    }, KEY);
    await page.getByTestId('nav-tab-play').click();

    await page.getByTestId('guest-feature-love-language').click();
    await expect(page.getByTestId('guest-love-result')).toBeVisible();
    await page.getByTestId('guest-love-retake').click();
    for (let i = 0; i < 15; i++) await page.getByTestId('guest-love-option').first().click();
    await expect(page.getByTestId('guest-love-result')).toBeVisible();

    await page.getByTestId('guest-feature-mood').click();
    await page.getByTestId('guest-mood-great').click();
    await expect(page.getByTestId('guest-mood-great')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('guest-feature-memories').click();
    await page.getByTestId('guest-memory-add').click();
    await page.getByTestId('guest-memory-title').fill('一起去夜市');
    await page.getByTestId('guest-memory-save').click();
    await expect(page.getByTestId('guest-memory-list')).toContainText('一起去夜市');

    await page.getByTestId('guest-feature-repair').click();
    await expect(page.getByTestId('guest-panel-repair')).toBeVisible();

    // 清除我的資料 → empty slate; 重置範例資料 → samples back.
    await page.getByTestId('guest-clear').click();
    await page.getByTestId('guest-clear-confirm').click();
    let st = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || '{}'), KEY);
    expect(st.memories.length).toBe(0);
    await page.getByTestId('guest-reset').click();
    st = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) || '{}'), KEY);
    expect(st.memories.length).toBe(4);
  });
});
