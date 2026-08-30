import { test, expect, Page } from '@playwright/test';

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  password: 'test123456',
};

// 1x1 red PNG, base64 encoded. Same fixture used by tests/custom-script-api.spec.ts.
const ONE_PX_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function loginIfNeeded(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('pairingPromptDismissed', 'true');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const loginButton = page.getByTestId('header-auth-button');
  const recordButton = page.getByTestId('user-menu-toggle');

  const alreadyLoggedIn = await recordButton.isVisible({ timeout: 2000 });
  if (alreadyLoggedIn) return;
  if (!(await loginButton.isVisible({ timeout: 3000 }))) return;

  await loginButton.click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });

  await page.getByTestId('auth-email-input').fill(TEST_USER.email);
  await page.getByTestId('auth-password-input').fill(TEST_USER.password);
  await page.getByTestId('auth-submit-button').click();

  await Promise.race([
    page.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 15000 }),
    recordButton.waitFor({ timeout: 15000 }),
  ]).catch(() => {});

  const closeBtn = page.getByTestId('auth-modal-close-button');
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    // The modal auto-closes on a successful login, so it can detach between
    // the isVisible check and this click — tolerate it already being gone.
    await closeBtn.click({ timeout: 2000 }).catch(() => {});
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

// Creates a custom script and returns its server-assigned id (captured from the
// POST response). Returning the id lets the test edit *its own* script rather
// than `.first()`, which under parallel load could be a script another spec is
// concurrently deleting/editing — the original source of flakiness.
async function createCustomScript(page: Page, title: string): Promise<string> {
  await page.getByTestId('script-upload-button').click();
  await page.waitForTimeout(1000);

  await expect(page.locator('h3:has-text("上傳自訂劇本")')).toBeVisible({ timeout: 5000 });

  await page.locator('input#script-title').fill(title);
  await page.locator('select#script-category').selectOption('romantic');
  await page.locator('input#script-scenario').fill('Edit-thumbnail test scenario');
  await page.locator('textarea#script-content').fill('[男]: hi\n[女]: hello');

  // Scroll the modal so the submit button is in view, then submit.
  await page.evaluate(() => {
    const modal = document.querySelector('.max-h-\\[90vh\\]');
    if (modal) modal.scrollTop = modal.scrollHeight;
  });
  await page.waitForTimeout(300);

  const submit = page.getByTestId('script-upload-submit-button');
  await submit.scrollIntoViewIfNeeded();

  const createResp = page.waitForResponse(
    (r) => /\/api\/custom-scripts$/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 20000 }
  );
  await submit.click();
  const body = await (await createResp).json();
  const id = body?.custom_script?.id;
  expect(id, 'create custom script should return an id').toBeTruthy();

  // Wait for the success toast (text is the contract).
  await expect(
    page.locator('text=劇本上傳成功').or(page.locator('text=已加入你的劇本庫')).first()
  ).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
  return id as string;
}

test.describe('Role script edit — thumbnail upload', () => {
  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page);

    // Navigate to roleplay.
    await page.getByTestId('nav-tab-talk').click();
    const roleplayTab = page.getByTestId('talk-roleplay-entry');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(2000);
  });

  test('edit an existing custom script and upload a new thumbnail', async ({ page }) => {
    // Create + edit + a thumbnail-upload save round-trip, all under 4-worker
    // parallel load — comfortably more than the default 30s budget. Triple it.
    test.slow();

    // 1. Create a fresh script so the test owns its target — independent of seed
    //    data AND of other specs mutating the shared user's other scripts.
    const title = `Edit Thumb Test ${Date.now()}`;
    const scriptId = await createCustomScript(page, title);

    // 2. Edit the script we just created (by its id), not `.first()`.
    const editBtn = page.getByTestId(`script-edit-button-${scriptId}`);
    await editBtn.scrollIntoViewIfNeeded();
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // 3. The edit modal opens. Heading text is the contract for "edit" mode.
    await expect(page.locator('h3:has-text("編輯")').first()).toBeVisible({ timeout: 5000 });

    // 4. Upload a new PNG as the replacement thumbnail.
    const png = Buffer.from(ONE_PX_PNG_B64, 'base64');
    await page.locator('#script-thumbnail').setInputFiles({
      name: 'new-thumb.png',
      mimeType: 'image/png',
      buffer: png,
    });

    // The preview <img> renders once the file is read in.
    await expect(page.locator('img[alt="thumbnail preview"]')).toBeVisible({ timeout: 3000 });

    // 5. Surface any unexpected size-limit alert immediately rather than letting
    //    the test silently dismiss it. A 67-byte PNG must not trigger this.
    page.on('dialog', async (dialog) => {
      throw new Error(`Unexpected dialog during thumbnail upload: "${dialog.message()}"`);
    });

    // 6. Save.
    const submit = page.getByTestId('script-upload-submit-button');
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toHaveText(/保存修改/);

    // 7. Save. Wait for the PUT to resolve (the slow part under parallel load),
    //    then assert the modal closed. The modal only closes App-side after the
    //    PUT *and* a follow-up script refetch, so we still give it generous time.
    const savePromise = page
      .waitForResponse(
        (r) => /\/api\/custom-scripts\//.test(r.url()) && r.request().method() === 'PUT',
        { timeout: 30000 }
      )
      .catch(() => null);
    await submit.click();
    const saveResp = await savePromise;
    if (saveResp) expect(saveResp.ok(), 'thumbnail save PUT should succeed').toBeTruthy();

    // The edit modal closes on success. We also expect no "更新失敗" toast.
    await expect(page.locator('#script-thumbnail')).toBeHidden({ timeout: 30000 });
    await expect(page.locator('text=更新失敗')).toHaveCount(0);

    // 8. Sanity check: the script card is still present after the edit.
    await expect(page.getByTestId(`script-card-custom-view-button-${scriptId}`)).toBeVisible({
      timeout: 5000,
    });
  });
});
