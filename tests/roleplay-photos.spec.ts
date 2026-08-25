import { test, expect, Page } from '@playwright/test';

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  password: 'test123456',
};

// Known-good 1x1 red PNG (the same fixture used by custom-script-api.spec.ts).
// We upload it twice — the two photos don't need distinct pixels, only distinct
// rows. A hand-fabricated second PNG tripped CI's stricter libspng decoder.
const ONE_PX_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function loginIfNeeded(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pairingPromptDismissed', 'true'));
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const loginButton = page.getByTestId('header-auth-button');
  const recordButton = page.getByTestId('user-menu-toggle');
  await Promise.race([
    loginButton.waitFor({ state: 'visible', timeout: 20000 }),
    recordButton.waitFor({ state: 'visible', timeout: 20000 }),
  ]).catch(() => {});

  if (await recordButton.isVisible({ timeout: 1500 }).catch(() => false)) return;
  if (!(await loginButton.isVisible({ timeout: 3000 }).catch(() => false))) return;

  await loginButton.click();
  await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('auth-email-input').fill(TEST_USER.email);
  await page.getByTestId('auth-password-input').fill(TEST_USER.password);
  await page.getByTestId('auth-submit-button').click();
  await Promise.race([
    page.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 15000 }),
    recordButton.waitFor({ timeout: 15000 }),
  ]).catch(() => {});
  if (await page.getByTestId('auth-modal-heading').isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
  }
}

test.describe('Roleplay custom script — multi-photo upload + lightbox nav', () => {
  test('upload a 2-photo script and page through the lightbox', async ({ page }) => {
    test.slow(); // create + 2 uploads + view, under parallel load

    await loginIfNeeded(page);
    await page.getByTestId('nav-tab-talk').click();
    const roleplayTab = page.getByTestId('talk-roleplay-entry');
    await expect(roleplayTab).toBeVisible({ timeout: 8000 });
    await roleplayTab.click();
    await page.waitForTimeout(1500);

    // Open the upload modal and fill the script.
    await page.getByTestId('script-upload-button').click();
    await expect(page.locator('h3:has-text("上傳自訂劇本")')).toBeVisible({ timeout: 5000 });
    const title = `Photo Series ${Date.now()}`;
    await page.locator('input#script-title').fill(title);
    await page.locator('select#script-category').selectOption('romantic');
    await page.locator('input#script-scenario').fill('Multi-photo lightbox test');
    await page.locator('textarea#script-content').fill('[男]: hi\n[女]: hello');

    // Attach two photos; the grid should reflect both, first marked 封面.
    await page.getByTestId('script-photos-input').setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(ONE_PX_PNG, 'base64') },
      { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(ONE_PX_PNG, 'base64') },
    ]);
    await expect(page.locator('[data-testid="script-photos-grid"] img')).toHaveCount(2, { timeout: 5000 });

    // Submit and capture the new script id from the create response.
    const submit = page.getByTestId('script-upload-submit-button');
    await submit.scrollIntoViewIfNeeded();
    const createResp = page.waitForResponse(
      (r) => /\/api\/custom-scripts$/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 30000 }
    );
    await submit.click();
    const body = await (await createResp).json();
    const id = body?.custom_script?.id as string;
    expect(id, 'create should return an id').toBeTruthy();
    expect((body?.custom_script?.photos || []).length, 'server stored 2 photos').toBe(2);

    await expect(
      page.locator('text=劇本上傳成功').or(page.locator('text=已加入你的劇本庫')).first()
    ).toBeVisible({ timeout: 10000 });

    // Open the created script's detail modal.
    const viewBtn = page.getByTestId(`script-card-custom-view-button-${id}`);
    await viewBtn.scrollIntoViewIfNeeded();
    await expect(viewBtn).toBeVisible({ timeout: 8000 });
    await viewBtn.click();

    await expect(page.getByTestId('roleplay-modal')).toBeVisible({ timeout: 5000 });
    // In-modal preview shows an index counter and pages without the lightbox.
    await expect(page.getByTestId('roleplay-modal-photo-count')).toHaveText('1 / 2');
    await page.getByTestId('roleplay-modal-photo-next').click();
    await expect(page.getByTestId('roleplay-modal-photo-count')).toHaveText('2 / 2');
    await page.getByTestId('roleplay-modal-photo-prev').click();
    await expect(page.getByTestId('roleplay-modal-photo-count')).toHaveText('1 / 2');

    // Tapping the preview opens the fullscreen lightbox; page left/right there.
    await page.getByTestId('roleplay-modal-photo').click();
    await expect(page.getByTestId('roleplay-modal-lightbox')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('roleplay-modal-lightbox-counter')).toHaveText('1 / 2');

    await page.getByTestId('roleplay-modal-lightbox-next').click();
    await expect(page.getByTestId('roleplay-modal-lightbox-counter')).toHaveText('2 / 2');

    await page.getByTestId('roleplay-modal-lightbox-prev').click();
    await expect(page.getByTestId('roleplay-modal-lightbox-counter')).toHaveText('1 / 2');

    // A large, off-aspect image must fit entirely within the (mobile) viewport —
    // never overflow it. Swap in a 2400x1600 image and measure the rendered box.
    const fit = await page.evaluate(async () => {
      const img = document.querySelector(
        '[data-testid="roleplay-modal-lightbox-image"]',
      ) as HTMLImageElement | null;
      if (!img) return null;
      const c = document.createElement('canvas');
      c.width = 2400;
      c.height = 1600;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#c33';
      ctx.fillRect(0, 0, c.width, c.height);
      img.src = c.toDataURL('image/png');
      await img.decode();
      const r = img.getBoundingClientRect();
      return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
    });
    expect(fit, 'lightbox image present').not.toBeNull();
    expect(fit!.w).toBeLessThanOrEqual(fit!.vw + 1);
    expect(fit!.h).toBeLessThanOrEqual(fit!.vh + 1);

    await page.getByTestId('roleplay-modal-lightbox-close').click();
    await expect(page.getByTestId('roleplay-modal-lightbox')).toBeHidden({ timeout: 5000 });
  });
});
