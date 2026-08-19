import { test, expect } from '@playwright/test';

// Smoke test for 情緒深潛 (Emotional Deep Dive). We stub auth + the deep-dive
// APIs so the test never depends on a DB. The whole point of the feature — that
// every step persists and can be paused/skipped — is exercised against a stub
// that echoes back the requested `step` as current_step (mirroring the server).

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const JOURNEY_ID = '44444444-4444-4444-4444-444444444444';

function journeyAt(step: string) {
  return {
    id: JOURNEY_ID,
    role: 'owner',
    status: 'in_progress',
    current_step: step,
    event_id: null,
    state: {},
    letters: { past: null, compassion: null, partner: null },
    partner_response: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

test.describe('情緒深潛 Emotional Deep Dive', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    }, FAKE_USER);

    // Catch-all first so unmocked endpoints don't 401 and log the fake user out.
    await page.route('**/api/**', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );
    // Keep partnerConnected true.
    await page.route('**/api/couples**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, couple: { id: 'c1', user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: 'b1', user2_nickname: 'B' } }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    // No resumable journey on load (keep the banner out of the way).
    await page.route('**/api/deep-dive/active', async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, journey: null }) })
    );
    // Start → a fresh journey at the first step.
    await page.route('**/api/deep-dive', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, journey: journeyAt('CURRENT_EMOTION') }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    // Step → echo the requested step back as current_step (like the server).
    await page.route(`**/api/deep-dive/${JOURNEY_ID}/step`, async (route) => {
      const body = route.request().postDataJSON() as { step: string };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, journey: journeyAt(body.step) }) });
    });
    await page.route(`**/api/deep-dive/${JOURNEY_ID}/letter`, async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );
    await page.route(`**/api/deep-dive/${JOURNEY_ID}/ai/**`, async (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, reflection: '聽起來還有一種委屈。', question: '這熟悉嗎？' }) })
    );
  });

  async function openFromMenu(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-deep-dive').click();
    await expect(page.getByTestId('deep-dive-journey-view')).toBeVisible();
  }

  test('opens from the user menu and advances a step (persist)', async ({ page }) => {
    await openFromMenu(page);
    // Step 1: name a feeling.
    await page.getByTestId('deep-dive-situation').fill('他都不聽我講話');
    await page.getByTestId('deep-dive-emotion-委屈').click();
    await page.getByTestId('deep-dive-next').click();
    // Landed on the deeper-emotion step (progress shows 第 2 步).
    await expect(page.getByTestId('deep-dive-progress')).toContainText('第 2 步');
  });

  test('pause closes the layer (resume later)', async ({ page }) => {
    await openFromMenu(page);
    await page.getByTestId('deep-dive-pause').click();
    await expect(page.getByTestId('deep-dive-journey-view')).toHaveCount(0);
  });

  test('can skip a step', async ({ page }) => {
    await openFromMenu(page);
    await page.getByTestId('deep-dive-situation').fill('一件小事');
    await page.getByTestId('deep-dive-next').click(); // -> DEEPER_EMOTION (skippable)
    await expect(page.getByTestId('deep-dive-skip')).toBeVisible();
    await page.getByTestId('deep-dive-skip').click();
    await expect(page.getByTestId('deep-dive-progress')).toContainText('第 3 步'); // FAMILIARITY_CHECK
  });

  test('a not-familiar answer skips the memory steps', async ({ page }) => {
    await openFromMenu(page);
    await page.getByTestId('deep-dive-situation').fill('一件小事');
    await page.getByTestId('deep-dive-next').click(); // DEEPER_EMOTION
    await page.getByTestId('deep-dive-next').click(); // FAMILIARITY_CHECK
    await page.getByTestId('deep-dive-familiarity-不太熟悉').click();
    await page.getByTestId('deep-dive-next').click();
    // Should jump straight to 回到現在 (CURRENT_NEED), not the memory screen.
    await expect(page.getByText('回到現在')).toBeVisible();
    await expect(page.getByTestId('deep-dive-need-聽我說完')).toBeVisible();
  });

  test('self-harm text swaps to the safety exit', async ({ page }) => {
    await openFromMenu(page);
    await page.getByTestId('deep-dive-situation').fill('我不想活了');
    await expect(page.getByTestId('deep-dive-safety-exit')).toBeVisible();
  });
});
