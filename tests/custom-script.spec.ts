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
    // Navigate to the app
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Handle login if required
    const loginButton = page.locator('button:has-text("登入 / 註冊")');
    const recordButton = page.locator('button:has-text("記錄今天的愛 ❤️")');

    if (await recordButton.isVisible({ timeout: 2000 })) {
      console.log('User already logged in');
    } else if (await loginButton.isVisible({ timeout: 3000 })) {
      console.log('Login required, proceeding with authentication');
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

  test.skip('should upload a custom script and persist it in the database', async ({ page }) => {
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

    console.log('✓ Custom script uploaded successfully');
  });

  test.skip('should persist custom script after page reload', async ({ page }) => {
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

    console.log('✓ Script visible before reload');

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

    console.log('✓ Script persisted after reload');
  });

  test('should use custom script and create intimacy record', async ({ page }) => {
    // Navigate to roleplay section
    const roleplayTab = page.locator('button:has-text("角色扮演")');
    await expect(roleplayTab.first()).toBeVisible({ timeout: 5000 });
    await roleplayTab.first().click();
    await page.waitForTimeout(2000);

    // Find any custom script with "使用" (use) button
    const useButton = page.locator('button:has-text("使用")').first();

    // If no custom scripts exist, skip this test
    if (!(await useButton.isVisible({ timeout: 3000 }))) {
      console.log('No custom scripts available, skipping use test');
      test.skip();
      return;
    }

    // Click the use button
    await useButton.click();
    await page.waitForTimeout(2000);

    // Verify the script modal appears
    const scriptModal = page.locator('text=劇本對話：');
    await expect(scriptModal).toBeVisible({ timeout: 5000 });

    // Verify success message about automatic record
    const autoRecordMessage = page.locator('text=已自動記錄一次親密時光');
    await expect(autoRecordMessage).toBeVisible({ timeout: 3000 });

    // Close the modal
    const closeButton = page.locator('button:has-text("關閉")');
    await closeButton.click();
    await page.waitForTimeout(1000);

    console.log('✓ Custom script used successfully and intimacy record created');
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
    expect(scriptCount).toMatch(/自訂劇本 \(\d+\)/);

    console.log(`✓ Custom scripts section visible with count: ${scriptCount}`);
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

    console.log('✓ Form validation working correctly');
  });

  test.skip('should award coins for uploading custom script', async ({ page }) => {
    // Get initial coin balance - try multiple selectors
    const coinDisplay = page.locator('span:has-text("💰")').or(
      page.locator('text=/💰.*\\d+/')
    ).first();

    await expect(coinDisplay).toBeVisible({ timeout: 5000 });
    const initialCoinsText = await coinDisplay.textContent();
    const initialCoins = parseInt(initialCoinsText?.match(/\d+/)?.[0] || '0');

    console.log(`Initial coins: ${initialCoins}`);

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

    // Check for coin reward notification
    const coinReward = page.locator('text=/\\+\\s*200/');
    await expect(coinReward.first()).toBeVisible({ timeout: 5000 });

    // Wait for coin update
    await page.waitForTimeout(2000);

    // Verify coins increased
    const updatedCoinsText = await coinDisplay.textContent();
    const updatedCoins = parseInt(updatedCoinsText?.match(/\d+/)?.[0] || '0');

    console.log(`Updated coins: ${updatedCoins}`);
    expect(updatedCoins).toBe(initialCoins + 200);

    console.log('✓ Coins awarded correctly for custom script upload');
  });
});
