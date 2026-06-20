import { test, expect, Page } from '@playwright/test';

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  password: 'test123456',
};

// 1x1 PNGs (distinct bytes so the two photos aren't identical files).
const PNG_A =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PNG_B =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYAAAAAQAAa6P4G4AAAAASUVORK5CYII=';

async function loginIfNeeded(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pairingPromptDismissed', 'true'));
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const loginButton = page.getByTestId('header-auth-button');
  const recordButton = page.getByTestId('add-record-button');
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
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
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
      { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(PNG_A, 'base64') },
      { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B, 'base64') },
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
    await expect(page.getByTestId('roleplay-modal-photo-count')).toHaveText(/2 張照片/);

    // Open the lightbox and page left/right through the series.
    await page.getByTestId('roleplay-modal-thumb').click();
    await expect(page.getByTestId('roleplay-modal-lightbox')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('roleplay-modal-lightbox-counter')).toHaveText('1 / 2');

    await page.getByTestId('roleplay-modal-lightbox-next').click();
    await expect(page.getByTestId('roleplay-modal-lightbox-counter')).toHaveText('2 / 2');

    await page.getByTestId('roleplay-modal-lightbox-prev').click();
    await expect(page.getByTestId('roleplay-modal-lightbox-counter')).toHaveText('1 / 2');

    await page.getByTestId('roleplay-modal-lightbox-close').click();
    await expect(page.getByTestId('roleplay-modal-lightbox')).toBeHidden({ timeout: 5000 });
  });
});
