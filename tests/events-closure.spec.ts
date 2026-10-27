import { test, expect } from '@playwright/test';
import {
  seedAuth,
  seedClosure,
  seedQuota,
  openEventDetail,
  makeClosure,
  makeCommitment,
  PARTNER_ID,
  PARTNER_NICKNAME,
} from './helpers/closure';

// 一起收尾 — the happy path across the ceremony's screens, driven from the UI.
// events-closure-api.spec.ts already pins the state machine against the real
// server; what had no coverage at all was which SCREEN the panel picks from a
// given payload, and the promise the whole ceremony rests on: you never see
// your partner's commitment before you've written your own.
//
// Screens: ② composer → ④ waiting → ⑥ summary (no review round).

test.describe('一起收尾 — the ceremony across its screens', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await seedQuota(page, 2, 10);
  });

  test('composer → summary, and the partner’s commitment stays hidden until I submit', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Partner has ALREADY written. This is the case that matters: the payload
    // the server sends me must not carry their text, and the UI must not show
    // a review screen before I've written mine.
    const fx = await seedClosure(page, {
      closure: makeClosure({
        partner: {
          userId: PARTNER_ID,
          nickname: PARTNER_NICKNAME,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          reviewedAt: null,
          commitment: null, // server withholds it until I submit
        },
      }),
    });

    await openEventDetail(page);

    // Screen ② — the composer, not the review card.
    await expect(page.getByTestId('closure-composer-screen')).toBeVisible();
    await expect(page.getByTestId('closure-review-screen')).toHaveCount(0);
    await expect(page.getByTestId('closure-partner-commitment')).toHaveCount(0);

    // The reply composer is gone while closing — the ceremony owns the screen.
    await expect(page.getByTestId('event-reply-input')).toHaveCount(0);

    // Under the 4-char minimum the submit button explains itself rather than
    // just looking broken.
    await page.getByTestId('closure-commitment-input').fill('好');
    await expect(page.getByTestId('closure-submit-button')).toBeDisabled();
    await expect(page.getByTestId('closure-commitment-counter')).toContainText('至少 4 個字');

    await page.getByTestId('closure-commitment-input').fill('要動孩子之前，我會先問你一聲');
    await page.getByTestId('closure-decision-input').fill('孩子睡著後若沒有立即危險，就不移動');

    // I'm the second to write, so submitting finishes the ceremony on the
    // spot — no review round — and lands on Screen ⑥ with both commitments.
    fx.on('submit', (body, f) => {
      f.setEvent({ status: 'resolved', resolved_at: new Date().toISOString() });
      f.setClosure({
        status: 'finalized',
        eventStatus: 'resolved',
        finalizedAt: new Date().toISOString(),
        insight: '你們都在講「先講一聲」，只是講法不同。',
        me: {
          userId: (f.closure().me as { userId: string }).userId,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          reviewedAt: null,
          commitment: makeCommitment({ text: body.commitment as string }),
        },
        sharedDecision: body.sharedDecision as string,
        sharedDecisionStatus: 'proposed',
        partner: {
          userId: PARTNER_ID,
          nickname: PARTNER_NICKNAME,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          reviewedAt: null,
          commitment: makeCommitment({
            id: '77777777-7777-7777-7777-777777777777',
            userId: PARTNER_ID,
            text: '晚上十點前我會把明天的東西準備好',
          }),
        },
      });
    });

    await page.getByTestId('closure-submit-button').click();

    const submitted = fx.calls.find((c) => c.url.endsWith('/closure/submit'));
    expect(submitted?.body).toContain('要動孩子之前');
    expect(submitted?.body).toContain('孩子睡著後');

    await expect(page.getByTestId('event-closure-summary')).toBeVisible();
    await expect(page.getByTestId('closure-review-screen')).toHaveCount(0);
    expect(fx.actions()).not.toContain('closure/review');
    await expect(page.getByTestId('closure-insight')).toContainText('先講一聲');
    // Both commitments survive into the summary.
    await expect(page.getByTestId('event-closure-summary')).toContainText('要動孩子之前');
    await expect(page.getByTestId('event-closure-summary')).toContainText('晚上十點前');
  });

  test('after I submit alone, the waiting card names the wait instead of leaving me in limbo', async ({
    page,
  }) => {
    test.setTimeout(60000);

    await seedClosure(page, {
      closure: makeClosure({
        me: {
          userId: '11111111-1111-1111-1111-111111111111',
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          reviewedAt: null,
          commitment: makeCommitment(),
        },
      }),
    });

    await openEventDetail(page);

    // Screen ④ — waiting, with no review card (partner has written nothing).
    await expect(page.getByTestId('closure-waiting-card')).toBeVisible();
    await expect(page.getByTestId('closure-review-screen')).toHaveCount(0);
    await expect(page.getByTestId('closure-composer-screen')).toHaveCount(0);
    await expect(page.getByTestId('closure-waiting-card')).toContainText(PARTNER_NICKNAME);
    // No grace window: whoever has written can finish right away.
    await expect(page.getByTestId('closure-finalize-button')).toBeVisible();

    // 改一下我的約定 re-opens the composer over the waiting card, pre-filled —
    // before 2.2 there was no way to change your own wording at all.
    await page.getByTestId('closure-revise-link').click();
    await expect(page.getByTestId('closure-composer-screen')).toBeVisible();
    await expect(page.getByTestId('closure-commitment-input')).toHaveValue(
      '要動孩子之前，我會先問你一聲',
    );
    await expect(page.getByTestId('closure-submit-button')).toContainText('更新我的約定');
    // 先不寫，跳過這次 is meaningless once I've written; the footer swaps.
    await expect(page.getByTestId('closure-skip-link')).toHaveCount(0);

    await page.getByTestId('closure-revise-cancel').click();
    await expect(page.getByTestId('closure-waiting-card')).toBeVisible();
  });
});
