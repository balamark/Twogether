import { test, expect, type Page, type Locator } from '@playwright/test';

// Regression guard for the iOS tap-offset bug.
//
// The failure itself can't be reproduced in a headless browser: it needs
// WebKit's visual-viewport-vs-layout-viewport divergence on a real zoomed page.
// What CAN be asserted is the precondition that causes it. iOS Safari auto-zooms
// whenever a form control with computed font-size < 16px is focused, and once
// zoomed, `position: fixed` overlays are painted and hit-tested against
// different viewports — so taps land offset and small buttons stop responding.
//
// So: no form control below 16px, and no interactive target so small that a
// few px of drift misses it. Those two invariants are what actually keep the
// bug from coming back.

const MIN_FONT_PX = 16;
const MIN_TARGET_PX = 40;

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@x.test',
  nickname: 'A',
  selected_therapist: 'luma',
};
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

async function stubAuth(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('authToken', 'fake-jwt');
    localStorage.setItem('authUser', JSON.stringify(user));
    localStorage.setItem(
      'authState',
      JSON.stringify({ user, isAuthenticated: true, partnerConnected: true }),
    );
    localStorage.setItem('pairingPromptDismissed', 'true');
    localStorage.setItem('wall_tutorial_seen_' + user.id, '1');
    localStorage.setItem(
      'authTokenExpiresAt',
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );
  }, FAKE_USER);

  await page.route('**/api/**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    }),
  );

  await page.route('**/api/couples**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          couple: {
            id: COUPLE_ID,
            user1_id: FAKE_USER.id,
            user1_nickname: FAKE_USER.nickname,
            user2_id: '88888888-8888-8888-8888-888888888888',
            user2_nickname: 'B',
          },
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
        body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }),
      });
    }
    return route.fallback();
  });

  await page.route('**/api/wall*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /\/api\/wall(\?[^/]*)?$/.test(req.url())) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, wall_posts: [] }),
      });
    }
    return route.fallback();
  });
}

/** Every visible form control in `root` must be >= 16px, or iOS will zoom. */
async function expectNoAutoZoomTriggers(root: Locator, label: string) {
  const controls = await root.locator('input, textarea, select').all();
  for (const control of controls) {
    if (!(await control.isVisible())) continue;
    const [fontSize, describe] = await Promise.all([
      control.evaluate((n) => parseFloat(getComputedStyle(n).fontSize)),
      control.evaluate(
        (n) => `${n.tagName.toLowerCase()}[${(n as HTMLInputElement).type ?? ''}]` +
          `${n.getAttribute('data-testid') ? '#' + n.getAttribute('data-testid') : ''}`,
      ),
    ]);
    expect(
      fontSize,
      `${label}: ${describe} is ${fontSize}px — under ${MIN_FONT_PX}px iOS Safari ` +
        `auto-zooms on focus, which offsets every tap in this modal`,
    ).toBeGreaterThanOrEqual(MIN_FONT_PX);
  }
}

test.describe('Mobile tap ergonomics', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
  });

  test('wall composer: no auto-zoom triggers, targets big enough', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const wallNav = page.locator('button:has-text("我們的牆")').first();
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();
    await page.locator('button:has-text("新貼文")').first().click();

    const modal = page.getByTestId('wall-composer-backdrop');
    await expect(modal).toBeVisible();

    await expectNoAutoZoomTriggers(modal, 'wall composer');

    // The controls the user actually reported missing.
    for (const testid of ['wall-composer-media-button', 'wall-composer-custom-mood-add']) {
      const box = await page.getByTestId(testid).boundingBox();
      expect(box, `${testid} has no box`).not.toBeNull();
      expect(box!.height, `${testid} is only ${box!.height}px tall`).toBeGreaterThanOrEqual(
        MIN_TARGET_PX,
      );
    }

    // Mood chips sit in a dense row — an offset tap on an undersized chip picks
    // the neighbour instead.
    const chip = modal.locator('button:has-text("想念你")').first();
    const chipBox = await chip.boundingBox();
    expect(chipBox!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  test('tapping a mood chip selects that chip and not its neighbour', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('button:has-text("我們的牆")').first().click();
    await page.locator('button:has-text("新貼文")').first().click();

    // Collapse the starter-templates panel so the chip row isn't pushed past
    // the bottom of the phone viewport (tap() can't reach what's off-screen).
    await page.getByTestId('wall-composer-templates-toggle').click();

    // Scope to the modal: the wall behind it has demo template cards whose text
    // also contains these mood words.
    const modal = page.getByTestId('wall-composer-backdrop');
    const target = modal.locator('button:has-text("想被抱抱")').first();
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeVisible();
    // click(), not tap(): under mobile emulation Playwright checks tap targets
    // against the visual viewport and won't follow a scroll inside the modal
    // panel, so tap() flakes here for reasons that have nothing to do with the
    // app. The assertion below — that only the intended chip activates — is
    // what this test is actually for.
    await target.click();

    // Selected chips flip to the filled ink style; the neighbours must not.
    await expect(target).toHaveClass(/bg-petal-ink/);
    await expect(modal.locator('button:has-text("需要空間")').first()).not.toHaveClass(
      /bg-petal-ink/,
    );
  });

  test('the scrolling panel is not the fixed layer itself', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('button:has-text("我們的牆")').first().click();
    await page.locator('button:has-text("新貼文")').first().click();

    // A `position: fixed` element that scrolls its own content is the shape iOS
    // mis-hit-tests. The backdrop must stay unscrollable; an inner panel scrolls.
    const backdropOverflow = await page
      .getByTestId('wall-composer-backdrop')
      .evaluate((n) => getComputedStyle(n).overflowY);
    expect(backdropOverflow).not.toBe('auto');
    expect(backdropOverflow).not.toBe('scroll');
  });
});
