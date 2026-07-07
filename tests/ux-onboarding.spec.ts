import { test, expect } from '@playwright/test';

// P0 onboarding surfaces (docs/UX_PLAYBOOK.md): getting-started checklist,
// solo-mode gate for unpaired users, help view, and the events empty-state CTA.
// APIs are stubbed; this verifies the UI wiring.

const BASE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
};

async function seed(
  page: import('@playwright/test').Page,
  { paired }: { paired: boolean }
) {
  await page.addInitScript(
    ({ user, paired: isPaired }) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem(
        'authState',
        JSON.stringify({ user, isAuthenticated: true, partnerConnected: isPaired })
      );
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem(
        'authTokenExpiresAt',
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );
    },
    { user: BASE_USER, paired }
  );

  await page.route('**/api/**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  );

  await page.route('**/api/couples**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          couple: paired
            ? {
                id: '33333333-3333-3333-3333-333333333333',
                user1_id: BASE_USER.id,
                user1_nickname: 'A',
                user2_id: '88888888-8888-8888-8888-888888888888',
                user2_nickname: 'B',
              }
            : null,
        }),
      });
    }
    return route.fallback();
  });

  await page.route('**/api/auth/**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: BASE_USER, partnerConnected: paired }),
      });
    }
    return route.fallback();
  });

  await page.route('**/api/events*', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && /\/api\/events(\?[^/]*)?$/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, events: [], total: 0 }),
      });
    }
    return route.fallback();
  });
}

test.describe('UX onboarding surfaces', () => {
  test('getting-started card shows progress and can be dismissed', async ({ page }) => {
    await seed(page, { paired: true });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const card = page.getByTestId('getting-started-card');
    await expect(card).toBeVisible({ timeout: 10000 });
    // Companion picked + paired = 2 of 3 done.
    await expect(card).toContainText('2 / 3');
    await expect(page.getByTestId('getting-started-add-record')).toBeVisible();

    await page.getByTestId('getting-started-dismiss').click();
    await expect(card).toHaveCount(0);

    // Dismissal persists across reloads.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('getting-started-card')).toHaveCount(0);
  });

  test('unpaired events tab shows the solo-mode gate with alternatives', async ({ page }) => {
    await seed(page, { paired: false });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-communicate').click();

    const gate = page.getByTestId('solo-mode-gate');
    await expect(gate).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('solo-gate-invite')).toBeVisible();
    await expect(gate).toContainText('配對之前，你可以先');

    // An alternative navigates away from the gate (love-language view).
    await gate.locator('button', { hasText: '愛的語言測驗' }).click();
    await expect(page.getByTestId('solo-mode-gate')).toHaveCount(0);
  });

  test('help view opens from the user menu and expands sections', async ({ page }) => {
    await seed(page, { paired: true });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('user-menu-toggle').click();
    await page.getByTestId('user-menu-help').click();

    await expect(page.getByTestId('help-view')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('help-section-events').click();
    await expect(page.getByTestId('help-view')).toContainText('我寫的原始內容對方會看到嗎');
  });

  test('empty events list offers a compose CTA that opens the flow', async ({ page }) => {
    await seed(page, { paired: true });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-communicate').click();

    await expect(page.getByTestId('events-empty-state')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('events-empty-compose').click();
    await expect(page.getByTestId('compose-raw-input')).toBeVisible();
  });
});
