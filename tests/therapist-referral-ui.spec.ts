import { test, expect } from '@playwright/test';

// 諮商師專屬邀請碼 — the couple-side card for a visitor who arrived through a
// therapist's ?tref= link. The preview/claim APIs are stubbed; the real
// server flow is covered by therapist-referral-api.spec.ts.

const CODE = 'TABC234';
const PREVIEW = {
  success: true,
  therapist: { id: '55555555-5555-5555-5555-555555555555', displayName: '林心理師', title: '諮商心理師', photoUrl: null },
  premiumDays: 30,
};
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('therapist referral card', () => {
  test('a guest sees who invited them, the code survives, and the CTA opens sign-up', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('tw_guest_tour_seen', '1'));
    await page.route('**/api/therapists/referral/**', (route) => route.fulfill(json(PREVIEW)));
    await page.goto(`/?tref=${CODE}`);

    const card = page.getByTestId('therapist-referral-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('林心理師');
    await expect(card).toContainText('30');
    // The code leaves the address bar but is remembered for after sign-up.
    expect(page.url()).not.toContain('tref=');
    const stored = await page.evaluate(() => localStorage.getItem('tw_therapist_ref'));
    expect(stored).toContain(CODE);

    await page.getByTestId('therapist-referral-signup').click();
    await expect(page.getByTestId('auth-modal')).toBeVisible();
  });

  test('an invalid code is dropped with an actionable warning', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('tw_guest_tour_seen', '1'));
    await page.route('**/api/therapists/referral/**', (route) => route.fulfill(json({
      success: false, error_code: 'THERAPIST_REF_INVALID', message: '這組諮商師邀請碼無效或已停用，請和你的諮商師確認代碼',
    }, 404)));
    await page.goto(`/?tref=${CODE}`);
    await expect(page.getByText('請和你的諮商師確認代碼')).toBeVisible();
    await expect(page.getByTestId('therapist-referral-card')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('tw_therapist_ref'))).toBeNull();
  });

  test('a signed-in, paired user claims the month and opts in to 專屬心理師', async ({ page }) => {
    const user = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
    await page.addInitScript((u) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(u));
      localStorage.setItem('authState', JSON.stringify({ user: u, isAuthenticated: true, partnerConnected: true }));
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem('authTokenExpiresAt', new Date(Date.now() + 86_400_000).toISOString());
    }, user);
    await page.route('**/api/**', (route) => route.fulfill(json({ success: true })));
    await page.route('**/api/auth/**', (route) => route.fulfill(json({ success: true, user, partnerConnected: true })));
    await page.route('**/api/couples**', (route) => route.fulfill(json({ success: true, couple: { id: 'c1', user1_id: user.id, user2_id: '22222222-2222-2222-2222-222222222222', user2_nickname: 'B' } })));
    await page.route('**/api/therapists/referral/**', (route) => route.fulfill(json(PREVIEW)));
    let claimBody: Record<string, unknown> | null = null;
    await page.route('**/api/therapists/referral/claim', (route) => {
      claimBody = route.request().postDataJSON();
      return route.fulfill(json({ success: true, status: 'rewarded', message: 'ok', days: 30, expires_at: null, dedicatedSet: true, therapist: { id: PREVIEW.therapist.id, displayName: '林心理師' } }));
    });

    await page.goto(`/?tref=${CODE}`);
    const card = page.getByTestId('therapist-referral-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('therapist-referral-dedicated')).toBeChecked();
    await page.getByTestId('therapist-referral-claim').click();

    await expect(page.getByText('Premium 30 天已啟用')).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(claimBody).toEqual({ code: CODE, makeDedicated: true });
    expect(await page.evaluate(() => localStorage.getItem('tw_therapist_ref'))).toBeNull();
  });
});
