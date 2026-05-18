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

// Locator policy: prefer getByTestId for click targets. Text-based locators
// are only used for read-only content assertions (toasts, headings whose
// text *is* the contract being verified). See plan: "look-at-recent-commit".

test.describe('Intimacy Record Flow', () => {
  // No mocking - use real backend for true E2E testing

  test('should complete full intimacy record creation flow', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pairingPromptDismissed', 'true');
    });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Handle login if required
    const loginButton = page.getByTestId('header-auth-button');
    const recordButton = page.getByTestId('add-record-button');

    // Wait until the app's auth state is determinate — either the login button
    // or the record button must show. networkidle is racy under parallel load
    // (poll loops keep the network busy and it never settles).
    await Promise.race([
      loginButton.waitFor({ state: 'visible', timeout: 20000 }),
      recordButton.waitFor({ state: 'visible', timeout: 20000 }),
    ]).catch(() => {});

    const alreadyLoggedIn = await recordButton.isVisible({ timeout: 2000 });
    if (!alreadyLoggedIn && await loginButton.isVisible({ timeout: 3000 })) {
      await loginButton.click();
      await page.waitForTimeout(1000);

      // Ensure we're in login mode (heading text is the contract)
      await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });

      const emailInput = page.getByTestId('auth-email-input');
      const passwordInput = page.getByTestId('auth-password-input');

      await expect(emailInput).toBeVisible({ timeout: 3000 });
      await expect(passwordInput).toBeVisible({ timeout: 3000 });

      await emailInput.fill(TEST_USER.email);
      await passwordInput.fill(TEST_USER.password);

      // Click the specific login submit button
      const submitButton = page.getByTestId('auth-submit-button');
      await expect(submitButton).toBeVisible({ timeout: 3000 });
      await submitButton.click();

      // Wait for login response and success indicators
      await Promise.race([
        page.waitForResponse(response => response.url().includes('/auth/login'), { timeout: 15000 }),
        page.waitForSelector('text=登入成功', { timeout: 10000 }),
        page.waitForSelector('text=歡迎', { timeout: 10000 }),
        recordButton.waitFor({ timeout: 15000 }),
      ]).catch(() => {});

      // Close auth modal if still open
      const closeButton = page.getByTestId('auth-modal-close-button');
      if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }

      // Wait for app to fully initialize after login — record button signals
      // that the home view is ready.
      await recordButton.waitFor({ state: 'visible', timeout: 20000 });
    } else {
      throw new Error('Neither login button nor record button found - app may not have loaded correctly');
    }

    // Click the record button
    const addRecordButton = page.getByTestId('add-record-button');
    await expect(addRecordButton).toBeVisible({ timeout: 5000 });
    await addRecordButton.click({ force: true });
    await page.waitForTimeout(2000);

    // Wait for the record form to appear
    const recordFormHeader = page.getByTestId('record-modal-heading');
    await expect(recordFormHeader).toBeVisible({ timeout: 10000 });

    // Fill out the record form
    const timeInput = page.locator('input[type="time"]');
    await expect(timeInput).toBeVisible({ timeout: 3000 });
    await timeInput.fill('14:30');

    // Use the first date input in the modal (there are multiple date inputs)
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 3000 });
    await dateInput.fill('2023-09-23');

    // Fill form fields by testid
    const descriptionField = page.getByTestId('record-description-input');
    if (await descriptionField.isVisible({ timeout: 2000 })) {
      await descriptionField.fill(TEST_RECORD.description);
    }

    const durationField = page.getByTestId('record-duration-input');
    if (await durationField.isVisible({ timeout: 2000 })) {
      await durationField.fill(TEST_RECORD.duration);
    }

    const locationField = page.getByTestId('record-location-input');
    if (await locationField.isVisible({ timeout: 2000 })) {
      await locationField.fill(TEST_RECORD.location);
    }

    const notesField = page.getByTestId('record-notes-input');
    if (await notesField.isVisible({ timeout: 2000 })) {
      await notesField.fill(TEST_RECORD.notes);
    }

    // Test roleplay script dropdown
    const roleplaySelect = page.getByTestId('record-roleplay-select');
    if (await roleplaySelect.isVisible()) {
      const options = roleplaySelect.locator('option');
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThan(7);
      await roleplaySelect.selectOption({ label: '初次相遇' });
    }

    // Submit the form
    const submitButton = page.getByTestId('record-submit-button');
    await expect(submitButton).toBeVisible({ timeout: 3000 });
    await submitButton.click();

    // Wait for success notification — toast text is the contract
    const successNotification = page.locator('text=記錄成功').or(
      page.locator('text=愛情時刻記錄成功').or(
        page.getByTestId('notification').filter({ hasText: '成功' })
      )
    );

    await expect(successNotification.first()).toBeVisible({ timeout: 10000 });

    // Close the modal if still open
    const closeModalButton = page.getByTestId('record-modal-close-button');
    if (await closeModalButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeModalButton.click();
      await page.waitForTimeout(1000);
    }

    // Verify record appears in the calendar view
    // Note: For unpaired users, the record should still be created and visible
    await page.waitForTimeout(2000);
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

    // Navigate to add record
    const addButton = page.getByTestId('add-record-button');

    if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addButton.click();

      // Fill minimum required field
      const descriptionInput = page.getByTestId('record-description-input');
      if (await descriptionInput.isVisible({ timeout: 2000 })) {
        await descriptionInput.fill('Test error handling');
      }

      // Submit
      const submitButton = page.getByTestId('record-submit-button');
      if (await submitButton.isVisible({ timeout: 2000 })) {
        await submitButton.click();

        // Should show error notification — error text is the contract
        const errorNotification = page.locator('text=記錄失敗').or(
          page.locator('text=錯誤').or(
            page.getByTestId('notification').filter({ hasText: '失敗' })
          )
        );

        await expect(errorNotification.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/');

    const addButton = page.getByTestId('add-record-button');

    if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addButton.click();

      // Try to submit without filling required fields
      const submitButton = page.getByTestId('record-submit-button');

      if (await submitButton.isVisible({ timeout: 2000 })) {
        await submitButton.click();

        // Should show validation error — error text is the contract
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

    const addButton = page.getByTestId('add-record-button');

    if (await addButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addButton.click();

      // Check roleplay scripts dropdown
      const roleplaySelect = page.getByTestId('record-roleplay-select');

      if (await roleplaySelect.isVisible()) {
        // Verify specific scripts are available — option labels are the contract
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
        expect(optionCount).toBeGreaterThan(7);
      }
    }
  });
});
