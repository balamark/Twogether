import { test, expect } from '@playwright/test';
import { supportEmail as SUPPORT_EMAIL } from '../lib/supportContact.json';

// P0 onboarding surfaces (docs/UX_PLAYBOOK.md): getting-started checklist,
// solo-mode gate for unpaired users, help view, and the events empty-state CTA.
// APIs are stubbed; this verifies the UI wiring.

const BASE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
};

/** One pending invite row as /my-invitations returns it (snake_case, raw). */
function pendingInviteRow(daysLeft: number) {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    recipient_email: 'partner@example.com',
    message: null,
    status: 'pending',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000).toISOString(),
    type: 'email',
    short_code: null,
    token: 'tok-abc123',
  };
}

async function seed(
  page: import('@playwright/test').Page,
  { paired, invitations }: { paired: boolean; invitations?: unknown[] }
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

  // Registered last so it wins over the `**/api/**` catch-all (Playwright gives
  // priority to the most recently registered matching route) — the pairing
  // reminder banner needs a real invitation list, not the generic stub.
  await page.route('**/api/pairing-requests/my-invitations', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, invitations: invitations ?? [] }),
    })
  );
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

    await page.getByTestId('nav-tab-talk').click();

    const gate = page.getByTestId('solo-mode-gate');
    await expect(gate).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('solo-gate-invite')).toBeVisible();
    await expect(gate).toContainText('配對之前，你可以先');

    // An alternative navigates away from the gate (love-language view).
    await gate.locator('button', { hasText: '愛的語言測驗' }).click();
    await expect(page.getByTestId('solo-mode-gate')).toHaveCount(0);
  });

  test('unpaired users get a standing pairing reminder whose CTA opens the invite modal', async ({ page }) => {
    await seed(page, { paired: false });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const banner = page.getByTestId('pairing-reminder-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toHaveAttribute('data-state', 'none');
    await expect(banner).toContainText('你還沒和另一半配對');

    // The CTA re-arms the once-dismissed pairing modal.
    await page.getByTestId('pairing-reminder-invite').click();
    await expect(page.getByPlaceholder('partner@example.com')).toBeVisible();
  });

  test('pairing reminder snoozes on dismiss and stays hidden after reload', async ({ page }) => {
    await seed(page, { paired: false });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('pairing-reminder-banner')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('pairing-reminder-dismiss').click();
    await expect(page.getByTestId('pairing-reminder-banner')).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('pairing-reminder-banner')).toHaveCount(0);
  });

  test('a pending invite turns the reminder into a waiting state with resend', async ({ page }) => {
    await seed(page, { paired: false, invitations: [pendingInviteRow(5)] });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const banner = page.getByTestId('pairing-reminder-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toHaveAttribute('data-state', 'pending');
    await expect(banner).toContainText('partner@example.com');
    await expect(banner).toContainText('還在等 TA 接受');
    await expect(page.getByTestId('pairing-reminder-resend')).toBeVisible();

    // The share panel hands over the same accept link built from the token.
    await page.getByTestId('pairing-reminder-share').click();
    await expect(banner).toContainText('/pairing/accept?token=tok-abc123');
  });

  test('a near-expiry invite overrides the snooze', async ({ page }) => {
    await seed(page, { paired: false, invitations: [pendingInviteRow(1)] });
    await page.addInitScript(() => {
      localStorage.setItem(
        'pairingReminderSnoozedUntil',
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      );
    });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Snoozed, but the link dies in a day — the user needs to know now.
    await expect(page.getByTestId('pairing-reminder-banner')).toBeVisible({ timeout: 10000 });
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

    // Payment/refund questions need a human, not a FAQ entry — the official
    // support mailbox has to be reachable from here.
    await expect(page.getByTestId('help-support-email')).toContainText(SUPPORT_EMAIL);
  });

  test('empty events list offers a compose CTA that opens the flow', async ({ page }) => {
    await seed(page, { paired: true });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-talk').click();

    await expect(page.getByTestId('events-empty-state')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('events-empty-compose').click();
    await expect(page.getByTestId('compose-raw-input')).toBeVisible();
  });
});
