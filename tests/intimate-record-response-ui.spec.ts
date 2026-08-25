import { test, expect } from '@playwright/test';

// UI smoke for 親密記錄・快速回應:
//  1. every record carries a chip row, and tapping one writes it through
//  2. tapping a chip does NOT open the detail modal (the row itself is
//     clickable, so each control has to stop propagation)
//  3. an existing response from the other half shows on the row
//  4. a failed write rolls the chip back and raises a toast
//  5. an unpaired user gets the three-part gate instead of dead chips
//
// Stubs auth + love-moments (like wall-read-reaction-ui.spec.ts) so it needs no
// paired couple in the DB.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const PARTNER_ID = '22222222-2222-2222-2222-222222222222';
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

const MINE = 'aaaaaaaa-0000-0000-0000-000000000001';
const THEIRS = 'bbbbbbbb-0000-0000-0000-000000000002';
const RETIRED = 'cccccccc-0000-0000-0000-000000000003';

// src/services/api.ts derives the React key / testid suffix from the UUID by
// hex-parsing its first 8 hex digits (transformApiRecord). Mirror that here so
// the testids in this spec match what the app renders.
const localId = (uuid: string) => parseInt(uuid.replace(/-/g, '').substring(0, 8), 16);

const baseMoment = (id: string, recordedById: string) => ({
  id,
  moment_date: '2026-08-01T20:30:00.000Z',
  notes: null,
  description: `記錄 ${id.slice(0, 4)}`,
  duration: null,
  location: null,
  roleplay_script: null,
  photo_id: null,
  photo_url: null,
  created_at: '2026-08-01T20:30:00.000Z',
  recorded_by: { id: recordedById, nickname: recordedById === FAKE_USER.id ? 'A' : 'B' },
  my_response: null,
  partner_response: null,
});

const MOMENTS = [
  {
    ...baseMoment(MINE, FAKE_USER.id),
    // The other half already answered this one — the payoff the author sees.
    partner_response: {
      reaction: 'love',
      note: '那天真的好放鬆',
      nickname: 'B',
      updated_at: '2026-08-02T09:00:00.000Z',
    },
  },
  baseMoment(THEIRS, PARTNER_ID),
  {
    // A response stored under a key that has since been retired ('sweet' was
    // dropped when the chips lost their emoji). The whitelist lives in JS, so
    // old rows outlive it — the card must still render, falling back to 心意.
    ...baseMoment(RETIRED, PARTNER_ID),
    description: '記錄 舊的回應',
    partner_response: {
      reaction: 'sweet',
      note: null,
      nickname: 'B',
      updated_at: '2026-08-02T09:00:00.000Z',
    },
  },
];

const seedAuth = (paired: boolean) => async (page: import('@playwright/test').Page) => {
  await page.addInitScript(([user, isPaired]) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: isPaired }));
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 864e5).toISOString());
  }, [FAKE_USER, paired] as const);

  // Catch-all first so the specific routes registered below win.
  await page.route('**/api/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  );

  await page.route('**/api/couples**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        isPairedBody(paired)
      ),
    });
  });

  await page.route('**/api/auth/**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: paired }),
    });
  });

  await page.route('**/api/love-moments**', async (route) => {
    const url = route.request().url();
    // Only the collection GET — the /:id/response PUT has its own route below.
    if (route.request().method() === 'GET' && /\/api\/love-moments(\?[^/]*)?$/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, love_moments: MOMENTS, total: MOMENTS.length, page: 1, limit: 20 }),
      });
    }
    return route.fallback();
  });
};

const isPairedBody = (paired: boolean) =>
  paired
    ? {
        success: true,
        couple: { id: COUPLE_ID, user1_id: FAKE_USER.id, user1_nickname: 'A', user2_id: PARTNER_ID, user2_nickname: 'B' },
      }
    : { success: true, couple: null };

const openRecords = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('nav-tab-us').click();
  await expect(page.getByTestId(`moment-reaction-love-${localId(THEIRS)}`)).toBeVisible({ timeout: 15000 });
};

test.describe('親密記錄 — 快速回應', () => {
  test('tapping a chip writes it through and fills instantly', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(true)(page);

    let sentBody: Record<string, unknown> | null = null;
    await page.route(`**/api/love-moments/${THEIRS}/response`, async (route) => {
      sentBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          my_response: { reaction: 'love', note: null, nickname: 'A', updated_at: new Date().toISOString() },
          partner_response: null,
        }),
      });
    });

    await openRecords(page);

    const chip = page.getByTestId(`moment-reaction-love-${localId(THEIRS)}`);
    await expect(chip).toHaveAttribute('aria-pressed', 'false');

    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => sentBody).toEqual({ reaction: 'love' });
  });

  test('tapping a chip does not open the record detail modal', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(true)(page);

    await page.route(`**/api/love-moments/${THEIRS}/response`, async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, my_response: null, partner_response: null }),
      })
    );

    await openRecords(page);
    await page.getByTestId(`moment-reaction-hug-${localId(THEIRS)}`).click();

    // The detail variant only renders inside the modal, so its absence proves
    // the row's own onClick never fired.
    await expect(page.getByTestId(`moment-response-detail-${localId(THEIRS)}`)).toHaveCount(0);
  });

  test("the other half's response shows on the record", async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(true)(page);
    await openRecords(page);

    await expect(page.getByTestId(`moment-response-partner-${localId(MINE)}`)).toContainText('那天真的好放鬆');
  });

  test('a response stored under a retired key still renders', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(true)(page);
    await openRecords(page);

    // No chip exists for 'sweet' any more, so the label lookup returns null and
    // the copy has to fall back rather than print "undefined" or blow up.
    await expect(page.getByTestId(`moment-response-partner-${localId(RETIRED)}`)).toContainText('心意');
  });

  test('a failed write rolls the chip back', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(true)(page);

    await page.route(`**/api/love-moments/${THEIRS}/response`, async (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '無法送出回應，請稍後再試一次。' }),
      })
    );

    await openRecords(page);

    const chip = page.getByTestId(`moment-reaction-fire-${localId(THEIRS)}`);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('回應沒有送出')).toBeVisible();
  });

  test('an unpaired user gets the gate, not dead chips', async ({ page }) => {
    test.setTimeout(60000);
    await seedAuth(false)(page);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-us').click();

    // Solo mode only ever shows the user's own records.
    await expect(page.getByText('記錄 aaaa')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`moment-reaction-love-${localId(MINE)}`)).toHaveCount(0);

    await page.getByText('記錄 aaaa').click();
    await expect(page.getByTestId(`moment-response-gate-${localId(MINE)}`)).toContainText('還沒配對');
    await expect(page.getByTestId(`moment-response-invite-${localId(MINE)}`)).toBeVisible();
  });
});
