import { test, expect } from '@playwright/test';

// 設定 → 感情存款：自動存入: one number per positive interaction (default 1),
// saved together.
const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };

test('auto-deposit amounts can be edited and saved from Settings', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }));
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('tw:lastView', 'settings');
    localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 864e5).toISOString());
  }, FAKE_USER);

  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }),
  );
  await page.route('**/api/auth/**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }) })
      : route.fallback(),
  );
  const defaults = { daily_love: 1, see_you: 1, secret: 1, wall_post: 1, love_moment: 1, conflict_resolved: 1 };
  let saved: Record<string, number> | null = null;
  await page.route('**/api/coins/rates', (route) => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON().rates;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, rates: saved }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, rates: saved ?? defaults }) });
  });

  await page.goto('/');
  const section = page.getByTestId('settings-love-bank-rates');
  await section.scrollIntoViewIfNeeded({ timeout: 15000 });
  await expect(page.getByTestId('love-bank-rate-daily_love')).toHaveValue('1');

  await page.getByTestId('love-bank-rate-daily_love').fill('5');
  await page.getByTestId('love-bank-rate-wall_post').fill('0');
  await page.getByTestId('love-bank-rates-save').click();
  await expect.poll(() => saved).toMatchObject({ daily_love: 5, wall_post: 0, see_you: 1 });

  // Invalid input blocks saving with a specific hint.
  await page.getByTestId('love-bank-rate-secret').fill('');
  await expect(page.getByTestId('love-bank-rates-save')).toBeDisabled();
  await expect(section).toContainText('0 到 10000');
});
