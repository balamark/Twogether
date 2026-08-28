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
  let measured = 0;
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
    measured += 1;
  }
  // Without this the loop is green when it matched nothing — a renamed testid
  // or a modal that failed to open would report a pass having asserted zero.
  expect(measured, `${label}: no form controls were measured`).toBeGreaterThan(0);
}

test.describe('Mobile tap ergonomics', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page);
  });

  test('wall composer: no auto-zoom triggers, targets big enough', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.getByTestId('nav-tab-talk').click();
    const wallNav = page.getByTestId('talk-wall-entry');
    await wallNav.waitFor({ state: 'visible', timeout: 15000 });
    await wallNav.click();
    await page.locator('button:has-text("新貼文")').first().click();

    const modal = page.getByTestId('wall-composer-backdrop');
    await expect(modal).toBeVisible();

    // Collapse the templates panel: its cards contain the same mood words as
    // the chips, so `has-text` would otherwise match a ~100px card instead of
    // the ~40px chip and the size assertions would measure the wrong element.
    await page.getByTestId('wall-composer-templates-toggle').click();

    // Open the custom-mood input so it's in the DOM — at text-[13px] it's the
    // control most at risk from the 16px floor, and it only mounts on demand.
    await page.getByTestId('wall-composer-custom-mood-add').click();
    await expect(page.getByTestId('wall-composer-custom-mood-input')).toBeVisible();

    await expectNoAutoZoomTriggers(modal, 'wall composer');

    // The control the user actually reported missing.
    const mediaBox = await page.getByTestId('wall-composer-media-button').boundingBox();
    expect(mediaBox, 'media button has no box').not.toBeNull();
    expect(
      mediaBox!.height,
      `media button is only ${mediaBox!.height}px tall`,
    ).toBeGreaterThanOrEqual(MIN_TARGET_PX);

    // Mood chips sit in a dense row — an offset tap on an undersized chip picks
    // the neighbour instead. Exact-text match so this can't resolve to a
    // template card or any other ancestor that merely contains the word.
    const chip = modal.locator('button').filter({ hasText: /^想念你$/ }).first();
    await expect(chip).toBeVisible();
    const chipBox = await chip.boundingBox();
    expect(chipBox!.height, `mood chip is only ${chipBox!.height}px tall`).toBeGreaterThanOrEqual(
      MIN_TARGET_PX,
    );
  });

  test('tapping a mood chip selects that chip and not its neighbour', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-talk').click();
    await page.getByTestId('talk-wall-entry').click();
    await page.locator('button:has-text("新貼文")').first().click();

    // Collapse the starter-templates panel so the chip row isn't pushed past
    // the bottom of the phone viewport (tap() can't reach what's off-screen).
    await page.getByTestId('wall-composer-templates-toggle').click();

    const modal = page.getByTestId('wall-composer-backdrop');
    const MOODS = ['想念你', '需要空間', '想被抱抱', '想溝通'];

    // Wait for the chip row to fully settle before measuring: every chip
    // rendered, then web fonts loaded and two frames painted. A font swap
    // changes chip widths — which changes how the flex row wraps — so measuring
    // mid-swap could momentarily read two stacked chips as overlapping. That
    // (plus the interleaved scrolling below) was the CI flake, not a real
    // layout bug.
    for (const t of MOODS) {
      await expect(
        modal.locator('button').filter({ hasText: new RegExp(`^${t}$`) }).first(),
      ).toBeVisible();
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });

    // Geometry, not activation. `click()` always hits the centre of the box it
    // resolved, so "click a chip, assert that chip selected" can never fail and
    // proves nothing about mis-taps. What actually decides whether an offset
    // finger hits the neighbour is how the boxes are laid out, so assert that:
    // every chip is tall enough, and no two overlap.
    //
    // Read all four rects in a single layout pass. The earlier version measured
    // them one at a time with scrollIntoViewIfNeeded() between reads; each
    // boundingBox() is viewport-relative, so a scroll between two reads shifted
    // their coordinates and could fabricate an overlap that isn't on screen.
    const boxes = await modal.evaluate((root, moods) => {
      const norm = (s: string | null) => (s || '').trim();
      return moods.map((t) => {
        const matches = Array.from(root.querySelectorAll('button')).filter(
          (b) => norm(b.textContent) === t,
        );
        // Prefer a laid-out button over a hidden duplicate (e.g. a collapsed
        // template chip with the same text), so we never measure a 0-size box.
        const btn =
          matches.find((b) => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }) || matches[0];
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
    }, MOODS);

    boxes.forEach((box, i) => {
      expect(box, `chip ${i} (${MOODS[i]}) not found`).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    });

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(
          overlapX > 0 && overlapY > 0,
          `chips ${i} and ${j} overlap — an offset tap would be ambiguous`,
        ).toBe(false);
      }
    }
  });

  test('the scrolling panel is not the fixed layer itself', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-talk').click();
    await page.getByTestId('talk-wall-entry').click();
    await page.locator('button:has-text("新貼文")').first().click();

    // A `position: fixed` element that scrolls its own content is the shape iOS
    // mis-hit-tests. Assert the whole shape, not just the absence of overflow:
    // a "fix" that dropped `position: fixed`, or that removed the panel's
    // max-height (making long posts unreachable), would pass a negative-only
    // check while being a worse bug.
    const shape = await page.getByTestId('wall-composer-backdrop').evaluate((backdrop) => {
      const panel = backdrop.firstElementChild as HTMLElement;
      const b = getComputedStyle(backdrop);
      const p = getComputedStyle(panel);
      return {
        backdropPosition: b.position,
        backdropOverflowY: b.overflowY,
        panelOverflowY: p.overflowY,
        panelMaxHeight: p.maxHeight,
      };
    });

    expect(shape.backdropPosition).toBe('fixed');
    expect(['auto', 'scroll']).not.toContain(shape.backdropOverflowY);
    expect(shape.panelOverflowY).toBe('auto');
    expect(shape.panelMaxHeight).not.toBe('none');
  });
});
