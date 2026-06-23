import { test, expect } from '@playwright/test';

// Test data - using real test account
const TEST_USER = {
  email: 'test-e2e@twogether.app',
  nickname: 'E2E Test User',
  password: 'test123456'
};

const TEST_SCRIPT = {
  title: `Test Script ${Date.now()}`,
  category: 'romantic',
  scenario: 'A romantic dinner under the moonlight',
  content: `[男]: 今晚的月色真美
[女]: 是啊，就像你的眼睛一樣閃耀
[男]: 能和你在一起，是我最幸福的時刻
[女]: 我也是，親愛的`,
  tags: '浪漫, 晚餐, 月光'
};

// Locator policy: prefer getByTestId for click targets. Text-based locators
// are only used for read-only content assertions (toasts, headings whose
// text *is* the contract being verified). See plan: "look-at-recent-commit".

test.describe('Custom Script Upload and Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pairingPromptDismissed', 'true');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Handle login if required
    const loginButton = page.getByTestId('header-auth-button');
    const recordButton = page.getByTestId('add-record-button');

    const alreadyLoggedIn = await recordButton.isVisible({ timeout: 2000 });
    if (!alreadyLoggedIn && await loginButton.isVisible({ timeout: 3000 })) {
      await loginButton.click();
      await page.waitForTimeout(1000);

      await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });

      const emailInput = page.getByTestId('auth-email-input');
      const passwordInput = page.getByTestId('auth-password-input');

      await expect(emailInput).toBeVisible({ timeout: 3000 });
      await expect(passwordInput).toBeVisible({ timeout: 3000 });

      await emailInput.fill(TEST_USER.email);
      await passwordInput.fill(TEST_USER.password);

      const submitButton = page.getByTestId('auth-submit-button');
      await expect(submitButton).toBeVisible({ timeout: 3000 });
      await submitButton.click();

      await Promise.race([
        page.waitForResponse(response => response.url().includes('/auth/login'), { timeout: 15000 }),
        page.waitForSelector('text=登入成功', { timeout: 10000 }),
        recordButton.waitFor({ timeout: 15000 }),
      ]).catch(() => {});

      // Close modal if still open
      const closeButton = page.getByTestId('auth-modal-close-button');
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
  });

  test('should upload a custom script and persist it in the database', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(2000);

    // Find and click the upload script button
    const uploadButton = page.getByTestId('script-upload-button');
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Wait for the upload modal to appear — content assertion on the heading
    const modalHeader = page.locator('h3:has-text("上傳自訂劇本")');
    await expect(modalHeader).toBeVisible({ timeout: 5000 });

    // Fill out the script form (these inputs already have stable ids)
    const titleInput = page.locator('input#script-title');
    await expect(titleInput).toBeVisible({ timeout: 3000 });
    await titleInput.fill(TEST_SCRIPT.title);

    const categorySelect = page.locator('select#script-category');
    await expect(categorySelect).toBeVisible({ timeout: 3000 });
    await categorySelect.selectOption(TEST_SCRIPT.category);

    const scenarioInput = page.locator('input#script-scenario');
    await expect(scenarioInput).toBeVisible({ timeout: 3000 });
    await scenarioInput.fill(TEST_SCRIPT.scenario);

    const contentTextarea = page.locator('textarea#script-content');
    await expect(contentTextarea).toBeVisible({ timeout: 3000 });
    await contentTextarea.fill(TEST_SCRIPT.content);

    const tagsInput = page.locator('input#script-tags');
    await expect(tagsInput).toBeVisible({ timeout: 3000 });
    await tagsInput.fill(TEST_SCRIPT.tags);

    // Scroll to the submit button
    await page.evaluate(() => {
      const modal = document.querySelector('.max-h-\\[90vh\\]');
      if (modal) {
        modal.scrollTop = modal.scrollHeight;
      }
    });
    await page.waitForTimeout(500);

    // Submit the form
    const submitButton = page.getByTestId('script-upload-submit-button');
    await expect(submitButton).toBeVisible({ timeout: 3000 });
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    // Wait for success notification — toast text is the contract being verified
    const successNotification = page.locator('text=劇本上傳成功').or(
      page.locator('text=已加入你的劇本庫')
    );
    await expect(successNotification.first()).toBeVisible({ timeout: 10000 });

    // Verify the script appears in the custom scripts section — title text
    // is the contract being verified (data round-tripped through the DB)
    await page.waitForTimeout(2000);
    const customScriptTitle = page.locator(`text=${TEST_SCRIPT.title}`);
    await expect(customScriptTitle.first()).toBeVisible({ timeout: 5000 });

    // Verify the script has the "自訂" (custom) badge
    const customBadge = page.getByTestId('script-card-custom-badge').first();
    await expect(customBadge).toBeVisible({ timeout: 3000 });
  });

  test('should persist custom script after page reload', async ({ page }) => {
    // First, upload a script
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(2000);

    const uploadButton = page.getByTestId('script-upload-button');
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await uploadButton.click();
    await page.waitForTimeout(1000);

    const modalHeader = page.locator('h3:has-text("上傳自訂劇本")');
    await expect(modalHeader).toBeVisible({ timeout: 5000 });

    // Quick fill with unique title
    const uniqueTitle = `Persist Test ${Date.now()}`;
    await page.locator('input#script-title').fill(uniqueTitle);
    await page.locator('select#script-category').selectOption('romantic');
    await page.locator('input#script-scenario').fill('Test scenario for persistence');
    await page.locator('textarea#script-content').fill('[男]: Test\n[女]: Response');

    await page.getByTestId('script-upload-submit-button').click();

    const successNotification = page.locator('text=劇本上傳成功');
    await expect(successNotification.first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Verify script is visible before reload — title text round-trip
    const scriptBeforeReload = page.locator(`text=${uniqueTitle}`);
    await expect(scriptBeforeReload.first()).toBeVisible({ timeout: 5000 });

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Navigate back to roleplay section
    const roleplayTabAfterReload = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTabAfterReload).toBeVisible({ timeout: 5000 });
    await roleplayTabAfterReload.click();
    await page.waitForTimeout(2000);

    // Verify script is still visible after reload
    const scriptAfterReload = page.locator(`text=${uniqueTitle}`);
    await expect(scriptAfterReload.first()).toBeVisible({ timeout: 5000 });
  });

  test('should use custom script and create intimacy record', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(2000);

    // Open a custom script in view mode. The view buttons under the 自訂劇本
    // section use testid `script-card-custom-view-button-{id}`; pick the first.
    const viewButton = page.locator('[data-testid^="script-card-custom-view-button-"]').first();

    // If no custom scripts exist, skip this test
    if (!(await viewButton.isVisible({ timeout: 3000 }))) {
      test.skip();
      return;
    }

    await viewButton.click();
    await page.waitForTimeout(2000);

    // Verify the script modal appeared
    await expect(page.getByTestId('roleplay-modal')).toBeVisible({ timeout: 5000 });

    // Viewing alone should NOT have created a record yet
    await expect(page.locator('text=已記錄一次親密時光')).toHaveCount(0);

    // Explicitly trigger the role-play to record the intimacy moment.
    const beginButton = page.getByTestId('roleplay-modal-begin-button');
    await expect(beginButton).toBeVisible({ timeout: 3000 });
    await beginButton.click();

    // Now the record-confirmation banner should appear — text is the contract
    const recordedMessage = page.locator('text=已記錄一次親密時光');
    await expect(recordedMessage).toBeVisible({ timeout: 3000 });

    // Close the modal via the finish button (shown post-begin)
    await page.getByTestId('roleplay-modal-finish-button').click();
    await page.waitForTimeout(1000);
  });

  test('should display custom scripts in filtered view', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(2000);

    // Check the custom scripts section — heading text is the contract
    const customScriptsHeader = page.locator('h3:has-text("自訂劇本")');
    await expect(customScriptsHeader).toBeVisible({ timeout: 5000 });

    // Verify the count is displayed
    const scriptCount = await customScriptsHeader.textContent();
    expect(scriptCount).toMatch(/自訂劇本\s*\(\d+\)/);
  });

  test('should validate custom script form fields', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(2000);

    // Open upload modal
    const uploadButton = page.getByTestId('script-upload-button');
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Try to submit without filling required fields
    await page.getByTestId('script-upload-submit-button').click();

    // Check that form validation prevents submission (form should still be visible)
    const modalHeader = page.locator('h3:has-text("上傳自訂劇本")');
    await expect(modalHeader).toBeVisible({ timeout: 2000 });

    // HTML5 validation should prevent the form from submitting
    // Verify title field has required attribute
    const titleInput = page.locator('input#script-title');
    const isRequired = await titleInput.getAttribute('required');
    expect(isRequired).not.toBeNull();
  });

  test('should award coins for uploading custom script', async ({ page }) => {
    // The coin balance moved into the Profile dropdown (src/components/Header.tsx);
    // the balance span still carries data-testid="coin-balance" but is only in the
    // DOM while the dropdown is open. Open the menu, read totalCoins, then close.
    const menuToggle = page.getByTestId('user-menu-toggle');

    const readCoins = async (): Promise<number> => {
      await menuToggle.click(); // open dropdown
      const coinDisplay = page.getByTestId('coin-balance');
      await expect(coinDisplay).toBeVisible({ timeout: 5000 });
      const text = await coinDisplay.textContent();
      // The open dropdown renders a full-screen overlay (fixed inset-0) that
      // closes the menu on click; tap a top corner to dismiss it.
      await page.mouse.click(5, 5);
      await expect(coinDisplay).toBeHidden({ timeout: 5000 });
      return parseInt(text?.match(/\d+/)?.[0] || '0');
    };

    const initialCoins = await readCoins();

    // Navigate to roleplay and upload a script
    await page.getByTestId('nav-tab-roleplay').click();
    await page.waitForTimeout(2000);

    const uploadButton = page.getByTestId('script-upload-button');
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Fill and submit
    const uniqueTitle = `Coin Test ${Date.now()}`;
    await page.locator('input#script-title').fill(uniqueTitle);
    await page.locator('select#script-category').selectOption('romantic');
    await page.locator('input#script-scenario').fill('Test scenario');
    await page.locator('textarea#script-content').fill('[男]: Test\n[女]: Response');

    await page.getByTestId('script-upload-submit-button').click();

    const successNotification = page.locator('text=劇本上傳成功');
    await expect(successNotification.first()).toBeVisible({ timeout: 10000 });

    // Check for coin reward notification (ErrorNotification renders "+200" next
    // to the Coins icon when a notification carries a `coins` field).
    const coinReward = page.locator('text=/\\+\\s*200/');
    await expect(coinReward.first()).toBeVisible({ timeout: 5000 });

    // The test user is unpaired, so /coins/transaction returns 404 with
    // "您還沒有情侶關係". The frontend (src/App.tsx addCustomScript) catches
    // that and still bumps totalCoins locally by 200, so the header value
    // increases either way. Coin persistence for paired couples is covered
    // separately by the coins API tests.
    await expect
      .poll(async () => readCoins(), { timeout: 10000 })
      .toBe(initialCoins + 200);
  });

  test('a freshly created script shows created date, NEW tag, and a working share button', async ({ page }) => {
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(1500);

    // Upload a fresh script (created_at = now → should be tagged NEW).
    await page.getByTestId('script-upload-button').click();
    await expect(page.locator('h3:has-text("上傳自訂劇本")')).toBeVisible({ timeout: 5000 });
    const title = `Share Script ${Date.now()}`;
    await page.locator('input#script-title').fill(title);
    await page.locator('select#script-category').selectOption('romantic');
    await page.locator('input#script-scenario').fill('Sharing test scenario');
    await page.locator('textarea#script-content').fill('[男]: 哈囉\n[女]: 嗨');
    const submitButton = page.getByTestId('script-upload-submit-button');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    await expect(page.locator('text=劇本上傳成功').or(page.locator('text=已加入你的劇本庫')).first())
      .toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1500);

    // Created date + NEW tag render on the new card (newest sorts first).
    await expect(page.locator('[data-testid^="script-created-date-"]').first())
      .toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid^="script-new-badge-"]').first())
      .toBeVisible({ timeout: 5000 });

    // Share button is present; clicking it surfaces a toast. The E2E user is
    // unpaired, so the backend replies with the "no partner" message — either
    // way a toast appears, proving the round-trip works.
    const shareButton = page.locator('[data-testid^="script-card-custom-share-button-"]').first();
    await expect(shareButton).toBeVisible({ timeout: 5000 });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/share') && r.request().method() === 'POST', { timeout: 15000 }),
      shareButton.click(),
    ]);
    await expect(
      page.locator('text=已分享給伴侶')
        .or(page.locator('text=尚未分享'))
        .or(page.locator('text=還沒有配對伴侶'))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });
});
