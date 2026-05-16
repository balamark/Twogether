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

test.describe('Custom Script Upload and Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pairingPromptDismissed', 'true');
    });
    // Navigate to the app
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Handle login if required
    const loginButton = page.locator('button:has-text("登入 / 註冊")');
    const recordButton = page.locator('[data-testid="add-record-button"]');

    const alreadyLoggedIn = await recordButton.isVisible({ timeout: 2000 });
    if (!alreadyLoggedIn && await loginButton.isVisible({ timeout: 3000 })) {
      await loginButton.click();
      await page.waitForTimeout(1000);

      await expect(page.locator('h3:has-text("登入愛的時光")')).toBeVisible({ timeout: 5000 });

      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();

      await expect(emailInput).toBeVisible({ timeout: 3000 });
      await expect(passwordInput).toBeVisible({ timeout: 3000 });

      await emailInput.fill(TEST_USER.email);
      await passwordInput.fill(TEST_USER.password);

      const submitButton = page.locator('button:has-text("開始愛的旅程")');
      await expect(submitButton).toBeVisible({ timeout: 3000 });
      await submitButton.click();

      await Promise.race([
        page.waitForResponse(response => response.url().includes('/auth/login'), { timeout: 15000 }),
        page.waitForSelector('text=登入成功', { timeout: 10000 }),
        recordButton.waitFor({ timeout: 15000 }),
      ]).catch(() => {});

      // Close modal if still open
      try {
        const modalCloseButton = page.locator('button:has-text("×")').first();
        if (await modalCloseButton.isVisible({ timeout: 2000 })) {
          await modalCloseButton.click();
          await page.waitForTimeout(1000);
        }
      } catch {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
  });

  test('should upload a custom script and persist it in the database', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.locator('button:has-text("角色扮演")').or(
      page.locator('[data-testid="roleplay-tab"]')
    );

    await expect(roleplayTab.first()).toBeVisible({ timeout: 5000 });
    await roleplayTab.first().click();
    await page.waitForTimeout(2000);

    // Find and click the upload script button
    const uploadButton = page.locator('button:has-text("上傳劇本")');
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Wait for the upload modal to appear
    const modalHeader = page.locator('h3:has-text("上傳自訂劇本")');
    await expect(modalHeader).toBeVisible({ timeout: 5000 });

    // Fill out the script form
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

    // Submit the form (use the submit button with full text to avoid ambiguity)
    const submitButton = page.locator('button:has-text("上傳劇本 (+200 金幣)")');
    await expect(submitButton).toBeVisible({ timeout: 3000 });
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    // Wait for success notification
    const successNotification = page.locator('text=劇本上傳成功').or(
      page.locator('text=已加入你的劇本庫')
    );
    await expect(successNotification.first()).toBeVisible({ timeout: 10000 });

    // Verify the script appears in the custom scripts section
    await page.waitForTimeout(2000);
    const customScriptTitle = page.locator(`text=${TEST_SCRIPT.title}`);
    await expect(customScriptTitle.first()).toBeVisible({ timeout: 5000 });

    // Verify the script has the "自訂" (custom) badge
    const customBadge = page.locator('span:has-text("自訂")');
    await expect(customBadge.first()).toBeVisible({ timeout: 3000 });
  });

  test('should persist custom script after page reload', async ({ page }) => {
    // First, upload a script
    const roleplayTab = page.locator('button:has-text("角色扮演")').or(
      page.locator('[data-testid="roleplay-tab"]')
    );

    await expect(roleplayTab.first()).toBeVisible({ timeout: 5000 });
    await roleplayTab.first().click();
    await page.waitForTimeout(2000);

    const uploadButton = page.locator('button:has-text("上傳劇本")');
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

    await page.locator('button:has-text("上傳劇本 (+200 金幣)")').click();

    const successNotification = page.locator('text=劇本上傳成功');
    await expect(successNotification.first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Verify script is visible before reload
    const scriptBeforeReload = page.locator(`text=${uniqueTitle}`);
    await expect(scriptBeforeReload.first()).toBeVisible({ timeout: 5000 });

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Navigate back to roleplay section
    const roleplayTabAfterReload = page.locator('button:has-text("角色扮演")');
    await expect(roleplayTabAfterReload.first()).toBeVisible({ timeout: 5000 });
    await roleplayTabAfterReload.first().click();
    await page.waitForTimeout(2000);

    // Verify script is still visible after reload
    const scriptAfterReload = page.locator(`text=${uniqueTitle}`);
    await expect(scriptAfterReload.first()).toBeVisible({ timeout: 5000 });
  });

  test('should use custom script and create intimacy record', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.locator('button:has-text("角色扮演")');
    await expect(roleplayTab.first()).toBeVisible({ timeout: 5000 });
    await roleplayTab.first().click();
    await page.waitForTimeout(2000);

    // Open a custom script in view mode. "查看" button is on each custom
    // script card under the 自訂劇本 section.
    const viewButton = page.locator('button:has-text("查看")').first();

    // If no custom scripts exist, skip this test
    if (!(await viewButton.isVisible({ timeout: 3000 }))) {
      test.skip();
      return;
    }

    await viewButton.click();
    await page.waitForTimeout(2000);

    // Verify the script modal appears (劇本對話 section)
    const scriptModal = page.locator('text=劇本對話');
    await expect(scriptModal).toBeVisible({ timeout: 5000 });

    // Viewing alone should NOT have created a record yet
    await expect(page.locator('text=已記錄一次親密時光')).toHaveCount(0);

    // Explicitly trigger the role-play to record the intimacy moment.
    // Modal CTA carries the editorial "— 記入今晚" suffix; card-level
    // direct-play buttons added in fb1f6df just say "開始扮演", so anchor
    // to the unique modal label to avoid strict-mode multi-match.
    const beginButton = page.locator('button:has-text("開始扮演 — 記入今晚")');
    await expect(beginButton).toBeVisible({ timeout: 3000 });
    await beginButton.click();

    // Now the record-confirmation banner should appear
    const recordedMessage = page.locator('text=已記錄一次親密時光');
    await expect(recordedMessage).toBeVisible({ timeout: 3000 });

    // Close the modal via the "完成 →" finish button (shown post-begin)
    const finishButton = page.locator('button:has-text("完成")');
    await finishButton.click();
    await page.waitForTimeout(1000);
  });

  test('should display custom scripts in filtered view', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.locator('button:has-text("角色扮演")');
    await expect(roleplayTab.first()).toBeVisible({ timeout: 5000 });
    await roleplayTab.first().click();
    await page.waitForTimeout(2000);

    // Check the custom scripts section
    const customScriptsHeader = page.locator('h3:has-text("自訂劇本")');
    await expect(customScriptsHeader).toBeVisible({ timeout: 5000 });

    // Verify the count is displayed
    const scriptCount = await customScriptsHeader.textContent();
    expect(scriptCount).toMatch(/自訂劇本\s*\(\d+\)/);
  });

  test('should validate custom script form fields', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.locator('button:has-text("角色扮演")');
    await expect(roleplayTab.first()).toBeVisible({ timeout: 5000 });
    await roleplayTab.first().click();
    await page.waitForTimeout(2000);

    // Open upload modal
    const uploadButton = page.locator('button:has-text("上傳劇本")');
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Try to submit without filling required fields
    const submitButton = page.locator('button:has-text("上傳劇本")').last();
    await submitButton.click();

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
    // Header coin display is rendered by src/components/Header.tsx with
    // data-testid="coin-balance" and shows the running totalCoins value.
    const coinDisplay = page.locator('[data-testid="coin-balance"]');

    await expect(coinDisplay).toBeVisible({ timeout: 5000 });
    const initialCoinsText = await coinDisplay.textContent();
    const initialCoins = parseInt(initialCoinsText?.match(/\d+/)?.[0] || '0');

    // Navigate to roleplay and upload a script
    const roleplayTab = page.locator('button:has-text("角色扮演")');
    await roleplayTab.first().click();
    await page.waitForTimeout(2000);

    const uploadButton = page.locator('button:has-text("上傳劇本")');
    await uploadButton.click();
    await page.waitForTimeout(1000);

    // Fill and submit
    const uniqueTitle = `Coin Test ${Date.now()}`;
    await page.locator('input#script-title').fill(uniqueTitle);
    await page.locator('select#script-category').selectOption('romantic');
    await page.locator('input#script-scenario').fill('Test scenario');
    await page.locator('textarea#script-content').fill('[男]: Test\n[女]: Response');

    await page.locator('button:has-text("上傳劇本 (+200 金幣)")').click();

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
      .poll(async () => {
        const text = await coinDisplay.textContent();
        return parseInt(text?.match(/\d+/)?.[0] || '0');
      }, { timeout: 5000 })
      .toBe(initialCoins + 200);
  });
});
