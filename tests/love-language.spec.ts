import { test, expect } from '@playwright/test';

// Smoke test for the 愛的語言 (love languages) quiz. Auth + assessment APIs are
// stubbed so it doesn't depend on a real account/DB — the goal is the UI flow:
// open from the Profile menu, take the 15-question quiz, see + persist a result.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A' };

test.describe('愛的語言 quiz', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: false }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 864e5).toISOString());
    }, FAKE_USER);

    // Catch-all so unmocked endpoints don't hit the real backend / log the fake user out.
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );
    await page.route('**/api/auth/**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: FAKE_USER }) })
        : route.fallback()
    );
    // No prior result → intro shows; partner has none.
    await page.route('**/api/assessments', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assessments: [] }) })
        : route.fallback()
    );
    await page.route('**/api/assessments/partner', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ partner: null, assessments: [] }) })
    );
  });

  test('open from menu, take the quiz, see a result', async ({ page }) => {
    let saved: { result?: string } = {};
    await page.route('**/api/assessments/love_language', async (route) => {
      if (route.request().method() === 'PUT') {
        saved = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, assessment: { type: 'love_language', result: saved.result, scores: {}, updatedAt: new Date().toISOString() } }),
        });
      }
      return route.fallback();
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-love-language').click();

    await expect(page.getByTestId('love-language-start')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('love-language-start').click();

    // Answer all 15 questions by always taking the 肯定的言語 (words) option when
    // present, else the first option — deterministic enough for a smoke test.
    await expect(page.getByTestId('love-language-quiz')).toBeVisible();
    for (let i = 0; i < 15; i++) {
      const wordsOpt = page.getByTestId('love-language-option-words');
      if (await wordsOpt.count()) await wordsOpt.first().click();
      else await page.locator('[data-testid^="love-language-option-"]').first().click();
      await page.waitForTimeout(120);
    }

    await expect(page.getByTestId('love-language-result')).toBeVisible({ timeout: 10000 });
    // The result was sent to the server for persistence.
    expect(saved.result, 'a result code was PUT to /assessments/love_language').toBeTruthy();
  });
});
