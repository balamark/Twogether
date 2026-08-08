import { test, expect } from '@playwright/test';
import {
  seedAuth,
  seedClosure,
  seedQuota,
  openEventDetail,
  makeClosure,
  makeCommitment,
  hoursFromNow,
  FAKE_USER,
} from './helpers/closure';

// Every way OUT of 一起收尾. The ceremony hides the reply composer while it
// runs, so a user who can't leave it is stuck — which is exactly what three of
// the review's bugs did: 跳過 went dead after one 再想一下 (2.1), 取消收尾 was
// wired at /reopen and destroyed the therapy note (1.2), and 先這樣完成 could
// never appear on a card left open across the 24h grace boundary (2.6).

test.describe('一起收尾 — the ways out', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await seedQuota(page, 1, 10);
  });

  test('先不寫，跳過這次 still opens after backing out with 再想一下', async ({ page }) => {
    test.setTimeout(60000);
    const fx = await seedClosure(page);
    await openEventDetail(page);

    await page.getByTestId('closure-skip-link').click();
    await expect(page.getByTestId('closure-skip-modal')).toBeVisible();

    // 再想一下 used to suppress the modal for the rest of the session, leaving
    // the link visible but dead.
    await page.getByTestId('closure-skip-later').click();
    await expect(page.getByTestId('closure-skip-modal')).toHaveCount(0);

    await page.getByTestId('closure-skip-link').click();
    await expect(page.getByTestId('closure-skip-modal')).toBeVisible();

    await page.getByTestId('closure-skip-confirm').click();
    await expect(page.getByTestId('closure-skip-modal')).toHaveCount(0);
    expect(fx.actions()).toContain('closure/skip');
  });

  test('取消收尾 before anyone writes is a clean cancel, and the event goes back to open', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const fx = await seedClosure(page, { closure: makeClosure({ canCancel: true }) });
    await openEventDetail(page);

    // Nothing written yet — no warning about losing drafts.
    await expect(page.getByTestId('closure-cancel-link')).toBeVisible();
    await expect(page.getByText('會清空目前寫好的約定')).toHaveCount(0);

    await page.getByTestId('closure-cancel-link').click();

    await expect(page.getByTestId('event-close-together-bar')).toBeVisible();
    await expect(page.getByTestId('event-closure-panel')).toHaveCount(0);
    expect(fx.actions()).toContain('closure/cancel');
    expect(fx.actions()).not.toContain('closure/abandon');
    // /reopen nulls therapy_note. It must never be how 取消收尾 gets out.
    expect(fx.calls.some((c) => c.url.endsWith('/reopen'))).toBe(false);
  });

  test('取消收尾 after someone has written abandons the closure — never /reopen', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const fx = await seedClosure(page, {
      closure: makeClosure({
        canCancel: false,
        therapyNote: { trigger: '早上出門的時間壓力', nextTime: '前一晚先講好誰負責叫小孩' },
        me: {
          userId: FAKE_USER.id,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          reviewedAt: null,
          commitment: makeCommitment(),
        },
      }),
    });
    await openEventDetail(page);

    // The recap proves a therapy note exists on this closure — the thing 1.2
    // silently deleted.
    await expect(page.getByTestId('closure-recap')).toBeVisible();
    // Once someone has written, the escape says what it costs.
    await expect(page.getByText('會清空目前寫好的約定')).toBeVisible();

    await page.getByTestId('closure-cancel-link').click();

    await expect(page.getByTestId('event-close-together-bar')).toBeVisible();
    expect(fx.actions()).toContain('closure/abandon');
    expect(fx.actions()).not.toContain('closure/cancel');
    expect(fx.calls.some((c) => c.url.endsWith('/reopen'))).toBe(false);
  });

  test('先這樣完成 appears only past the 24h grace, and finishes the ceremony', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const fx = await seedClosure(page, {
      closure: makeClosure({
        canFinalizeAt: hoursFromNow(-1), // grace has passed
        me: {
          userId: FAKE_USER.id,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          reviewedAt: null,
          commitment: makeCommitment(),
        },
      }),
    });
    await openEventDetail(page);

    await expect(page.getByTestId('closure-waiting-card')).toContainText('還沒動作');
    await page.getByTestId('closure-finalize-button').click();

    await expect(page.getByTestId('event-closure-summary')).toBeVisible();
    expect(fx.actions()).toContain('closure/finalize');
  });
});
