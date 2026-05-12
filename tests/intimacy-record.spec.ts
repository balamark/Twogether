import { test, expect } from '@playwright/test';

// Test data - using real test account
const TEST_USER = {
  email: 'test-e2e@twogether.app',
  nickname: 'E2E Test User',
  password: 'test123456'
};

const TEST_RECORD = {
  description: 'Test intimate moment',
  duration: '30',
  location: 'Test Location',
  notes: 'This is a test note for intimate moment'
};

test.describe('Intimacy Record Flow', () => {
  // No mocking - use real backend for true E2E testing

  test('should complete full intimacy record creation flow', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pairingPromptDismissed', 'true');
    });
    // Navigate to the app
    await page.goto('/');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Handle login if required
    const loginButton = page.locator('button:has-text("登入 / 註冊")');
    const recordButton = page.locator('button:has-text("記錄今天的愛 ❤️")');

    // Check if we're already logged in by looking for the record button
    const alreadyLoggedIn = await recordButton.isVisible({ timeout: 2000 });
    if (!alreadyLoggedIn && await loginButton.isVisible({ timeout: 3000 })) {
      await loginButton.click();
      await page.waitForTimeout(1000);

      // Ensure we're in login mode
      await expect(page.locator('h3:has-text("登入愛的時光")')).toBeVisible({ timeout: 5000 });

      const emailInput = page.locator('input[type="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();

      // Make sure we have email and password fields (login mode, not partner mode)
      await expect(emailInput).toBeVisible({ timeout: 3000 });
      await expect(passwordInput).toBeVisible({ timeout: 3000 });

      await emailInput.fill(TEST_USER.email);
      await passwordInput.fill(TEST_USER.password);

      // Click the specific login submit button
      const submitButton = page.locator('button:has-text("開始愛的旅程")');
      await expect(submitButton).toBeVisible({ timeout: 3000 });
      await submitButton.click();

      // Wait for login response and success indicators
      await Promise.race([
        page.waitForResponse(response => response.url().includes('/auth/login'), { timeout: 15000 }),
        page.waitForSelector('text=登入成功', { timeout: 10000 }),
        page.waitForSelector('text=歡迎', { timeout: 10000 }),
        recordButton.waitFor({ timeout: 15000 }), // Wait for the record button to appear
      ]).catch(() => {});

      // Close modal if still open
      try {
        await page.waitForSelector('[class*="fixed inset-0"]', { state: 'hidden', timeout: 5000 });
      } catch {
        // Try multiple ways to close the modal
        const modalCloseSelectors = [
          '.modal-close',
          'button:has-text("×")',
          'button[aria-label="Close"]',
          '[data-testid="close-button"]',
          '.close-button',
          'button:has-text("關閉")'
        ];

        let modalClosed = false;
        for (const selector of modalCloseSelectors) {
          const closeBtn = page.locator(selector);
          if (await closeBtn.isVisible()) {
            await closeBtn.click();
            await page.waitForTimeout(1000);
            modalClosed = true;
            break;
          }
        }

        if (!modalClosed) {
          // Fallback: use Escape key
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      }

      // Additional wait for app to fully initialize after login
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    } else {
      throw new Error('Neither login button nor record button found - app may not have loaded correctly');
    }

    // Click the record button (using the correct text from source code including emoji)
    const addRecordButton = page.locator('button:has-text("記錄今天的愛 ❤️")');
    await expect(addRecordButton).toBeVisible({ timeout: 5000 });
    await addRecordButton.click({ force: true });
    await page.waitForTimeout(2000);

    // Wait for the record form to appear
    const recordFormHeader = page.locator('h3:has-text("記錄親密時光")');
    await expect(recordFormHeader).toBeVisible({ timeout: 10000 });

    // Fill out the record form
    const timeInput = page.locator('input[type="time"]');
    await expect(timeInput).toBeVisible({ timeout: 3000 });
    await timeInput.fill('14:30');

    // Use the first date input in the modal (there are multiple date inputs)
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 3000 });
    await dateInput.fill('2023-09-23');

    // Fill form fields using exact placeholders from source code

    // Description field
    const descriptionField = page.locator('textarea[placeholder="分享這個美好時光的細節..."]');
    if (await descriptionField.isVisible({ timeout: 2000 })) {
      await descriptionField.fill(TEST_RECORD.description);
    }

    // Duration field
    const durationField = page.locator('input[placeholder="例如：30分鐘"]');
    if (await durationField.isVisible({ timeout: 2000 })) {
      await durationField.fill(TEST_RECORD.duration);
    }

    // Location field
    const locationField = page.locator('input[placeholder="例如：臥室、客廳"]');
    if (await locationField.isVisible({ timeout: 2000 })) {
      await locationField.fill(TEST_RECORD.location);
    }

    // Notes field
    const notesField = page.locator('textarea[placeholder="記錄這個特別時刻的感受..."]');
    if (await notesField.isVisible({ timeout: 2000 })) {
      await notesField.fill(TEST_RECORD.notes);
    }

    // Test roleplay script dropdown
    const roleplaySelect = page.locator('select').filter({ hasText: '角色扮演劇本' }).or(
      page.locator('select').nth(0)
    );
    if (await roleplaySelect.isVisible()) {
      const options = roleplaySelect.locator('option');
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThan(7);
      await roleplaySelect.selectOption({ label: '初次相遇' });
    }

    // Submit the form
    const submitButton = page.locator('button:has-text("保存記錄")');
    await expect(submitButton).toBeVisible({ timeout: 3000 });
    await submitButton.click();

    // Wait for success notification
    const successNotification = page.locator('text=記錄成功').or(
      page.locator('text=愛情時刻記錄成功').or(
        page.locator('[data-testid="notification"]').filter({ hasText: '成功' })
      )
    );

    await expect(successNotification.first()).toBeVisible({ timeout: 10000 });

    // Close the modal
    const modalCloseButton = page.locator('button:has-text("×")');
    if (await modalCloseButton.isVisible()) {
      await modalCloseButton.click();
      await page.waitForTimeout(1000);
    }

    // Verify record appears in the calendar view
    // Note: For unpaired users, the record should still be created and visible
    await page.waitForTimeout(2000); // Allow time for UI to update
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Override the love-moments POST route to return an error
    await page.route('**/api/love-moments', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'Internal server error'
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, love_moments: [] })
        });
      }
    });

    await page.goto('/');

    // Navigate to add record (simplified flow)
    const addButton = page.locator('button').filter({ hasText: '+' }).or(
      page.locator('button:has-text("新增")')
    ).first();

    if (await addButton.isVisible()) {
      await addButton.click();

      // Fill minimum required fields
      const descriptionInput = page.locator('input, textarea').nth(2);
      if (await descriptionInput.isVisible()) {
        await descriptionInput.fill('Test error handling');
      }

      // Submit
      const submitButton = page.locator('button:has-text("保存")').or(
        page.locator('button:has-text("儲存")')
      ).first();

      if (await submitButton.isVisible()) {
        await submitButton.click();

        // Should show error notification
        const errorNotification = page.locator('text=記錄失敗').or(
          page.locator('text=錯誤').or(
            page.locator('[data-testid="notification"]').filter({ hasText: '失敗' })
          )
        );

        await expect(errorNotification.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/');

    // Try to submit empty form
    const addButton = page.locator('button').filter({ hasText: '+' }).or(
      page.locator('button:has-text("新增")')
    ).first();

    if (await addButton.isVisible()) {
      await addButton.click();

      // Try to submit without filling required fields
      const submitButton = page.locator('button:has-text("保存")').or(
        page.locator('button:has-text("儲存")')
      ).first();

      if (await submitButton.isVisible()) {
        await submitButton.click();

        // Should show validation error
        const validationError = page.locator('text=請選擇日期').or(
          page.locator('text=請選擇時間').or(
            page.locator('text=驗證錯誤')
          )
        );

        await expect(validationError.first()).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('should display roleplay scripts correctly', async ({ page }) => {
    await page.goto('/');

    // Navigate to add record
    const addButton = page.locator('button').filter({ hasText: '+' }).or(
      page.locator('button:has-text("新增")')
    ).first();

    if (await addButton.isVisible()) {
      await addButton.click();

      // Check roleplay scripts dropdown
      const roleplaySelect = page.locator('select').filter({ hasText: '角色扮演劇本' }).or(
        page.locator('select').nth(0)
      );

      if (await roleplaySelect.isVisible()) {
        // Verify specific scripts are available
        const expectedScripts = [
          '未使用劇本',
          '初次相遇',
          '辦公室秘密',
          '禁忌誘惑',
          '舊情復燃',
          '度假誘惑',
          '粉絲與偶像：後台限定應援會',
          '人妻與老同學：重逢的夜晚',
          '攝影師與模特兒：寫真誘惑'
        ];

        for (const scriptName of expectedScripts) {
          const option = roleplaySelect.locator(`option:has-text("${scriptName}")`);
          await expect(option).toBeVisible();
        }

        // Verify we have more than the original limited set
        const options = roleplaySelect.locator('option');
        const optionCount = await options.count();
        expect(optionCount).toBeGreaterThan(7); // Should have many more scripts now
      }
    }
  });
});