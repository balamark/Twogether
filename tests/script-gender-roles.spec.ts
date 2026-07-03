import { test, expect } from '@playwright/test';

// Gender-aware script roles: uploading a script with named speakers surfaces
// the 角色對應 panel; assigned names are stored as [男]/[女] tokens. The E2E
// user is unpaired (no couple genders), so viewing the script exercises the
// fallback: tokens stay visible and the settings hint banner shows.

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  password: 'test123456',
};

test.describe('Script gender role assignment', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pairingPromptDismissed', 'true');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const loginButton = page.getByTestId('header-auth-button');
    const recordButton = page.getByTestId('add-record-button');

    const alreadyLoggedIn = await recordButton.isVisible({ timeout: 2000 });
    if (!alreadyLoggedIn && await loginButton.isVisible({ timeout: 3000 })) {
      await loginButton.click();
      await page.waitForTimeout(1000);

      await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });
      await page.getByTestId('auth-email-input').fill(TEST_USER.email);
      await page.getByTestId('auth-password-input').fill(TEST_USER.password);
      await page.getByTestId('auth-submit-button').click();

      await Promise.race([
        page.waitForResponse(response => response.url().includes('/auth/login'), { timeout: 15000 }),
        page.waitForSelector('text=登入成功', { timeout: 10000 }),
        recordButton.waitFor({ timeout: 15000 }),
      ]).catch(() => {});

      const closeButton = page.getByTestId('auth-modal-close-button');
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click({ timeout: 2000 }).catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
  });

  test('named speakers get an assignment panel and map to gender tokens', async ({ page }) => {
    await page.getByTestId('nav-tab-roleplay').click();
    await page.waitForTimeout(2000);

    await page.getByTestId('script-upload-button').click();
    await expect(page.locator('h3:has-text("上傳自訂劇本")')).toBeVisible({ timeout: 5000 });

    const title = `Gender Roles ${Date.now()}`;
    await page.locator('input#script-title').fill(title);
    await page.locator('select#script-category').selectOption('romantic');
    await page.locator('input#script-scenario').fill('角色性別對應測試');

    // Named speakers (no placeholder tokens) → the assignment panel appears.
    await page.locator('textarea#script-content').fill('小明：早安呀\n小芳：你來啦');
    const panel = page.getByTestId('speaker-assignment-panel');
    await expect(panel).toBeVisible({ timeout: 3000 });
    await expect(panel).toContainText('小明');
    await expect(panel).toContainText('小芳');

    // Assign 小明→男, 小芳→女 (rows follow first-appearance order).
    await page.getByTestId('speaker-0-male').click();
    await page.getByTestId('speaker-1-female').click();

    const submitButton = page.getByTestId('script-upload-submit-button');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    await expect(
      page.locator('text=劇本上傳成功').or(page.locator('text=已加入你的劇本庫')).first()
    ).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Open the freshly created script (newest sorts first).
    const viewButton = page.locator('[data-testid^="script-card-custom-view-button-"]').first();
    await expect(viewButton).toBeVisible({ timeout: 5000 });
    await viewButton.click();

    const modal = page.getByTestId('roleplay-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // The E2E user is unpaired → genders unresolvable → tokens stay visible
    // (assigned names were normalized to [男]/[女]) and the hint banner shows.
    await expect(modal).toContainText('[男]');
    await expect(modal).toContainText('[女]');
    await expect(modal).not.toContainText('小明：');
    await expect(page.getByTestId('script-gender-hint')).toBeVisible({ timeout: 3000 });
  });

  test('placeholder-only scripts do not show the assignment panel', async ({ page }) => {
    await page.getByTestId('nav-tab-roleplay').click();
    await page.waitForTimeout(2000);

    await page.getByTestId('script-upload-button').click();
    await expect(page.locator('h3:has-text("上傳自訂劇本")')).toBeVisible({ timeout: 5000 });

    await page.locator('textarea#script-content').fill('[男]: 嗨\n[女]: 哈囉');
    await expect(page.getByTestId('speaker-assignment-panel')).toHaveCount(0);
  });
});
