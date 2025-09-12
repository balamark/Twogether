import { test, expect, type Page } from '@playwright/test';

// Test data
const TEST_USER = {
  email: 'test@example.com',
  password: 'testpassword123',
  nickname: 'TestUser'
};

const INVALID_USER = {
  email: 'invalid@example.com',
  password: 'wrongpassword'
};

/**
 * Helper function to open the authentication modal
 */
async function openAuthModal(page: Page) {
  // Click the login button to open the modal
  await page.click('[data-testid="login-button"]');
  
  // Wait for the modal to be visible
  await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible();
}

/**
 * Helper function to wait for loading to complete
 */
async function waitForLoadingToComplete(page: Page) {
  // Wait for loading spinner to disappear
  await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
  
  // Wait for button to be enabled again
  await expect(page.locator('button[type="submit"]')).toBeEnabled();
}

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Clear any existing localStorage
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('should display login form by default', async ({ page }) => {
    await openAuthModal(page);
    
    // Check that we're in login mode by default (no nickname field visible)
    
    // Verify only email and password fields are visible (no nickname)
    await expect(page.locator('input[name="auth-email"]')).toBeVisible();
    await expect(page.locator('input[name="auth-password"]')).toBeVisible();
    await expect(page.locator('input[name="auth-nickname"]')).not.toBeVisible();
    
    // Check button text
    await expect(page.locator('button[type="submit"]')).toHaveText('開始愛的旅程');
  });

  test('should show nickname field when switching to register mode', async ({ page }) => {
    await openAuthModal(page);
    
    // Switch to register mode
    await page.click('text=還沒帳號？立即註冊');
    
    // Check that we're in register mode by verifying nickname field is visible
    
    // Verify all registration fields are visible
    await expect(page.locator('input[name="auth-email"]')).toBeVisible();
    await expect(page.locator('input[name="auth-nickname"]')).toBeVisible();
    await expect(page.locator('input[name="auth-password"]')).toBeVisible();
    await expect(page.locator('input[name="auth-confirm-password"]')).toBeVisible();
    
    // Check button text
    await expect(page.locator('button[type="submit"]')).toHaveText('註冊帳號');
  });

  test('should validate required fields in login', async ({ page }) => {
    await openAuthModal(page);
    
    // Try to submit empty form
    await page.click('button[type="submit"]');
    
    // Should show validation errors in notification
    await expect(page.locator('text=驗證錯誤')).toBeVisible();
    await expect(page.locator('text=請輸入電子郵件地址')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await openAuthModal(page);
    
    // Mock the API to confirm the email validation happens before API call
    let apiCalled = false;
    await page.route('**/api/auth/login', async route => {
      apiCalled = true;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Test error' })
      });
    });
    
    // Enter invalid email (no @ or domain)
    await page.fill('input[name="auth-email"]', 'invalid');
    await page.fill('input[name="auth-password"]', 'password123');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait a moment for validation
    await page.waitForTimeout(1000);
    
    // Should show email validation error OR the API should not be called
    const hasValidationError = await page.locator('text=驗證錯誤').isVisible();
    const hasEmailError = await page.locator('text=請輸入有效的電子郵件地址').isVisible();
    
    // Either we should see validation error or API should not be called (meaning validation worked)
    expect(hasValidationError || hasEmailError || !apiCalled).toBe(true);
  });

  test('should validate password length', async ({ page }) => {
    await openAuthModal(page);
    
    // Enter valid email but short password
    await page.fill('input[name="auth-email"]', TEST_USER.email);
    await page.fill('input[name="auth-password"]', '123');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should show password validation error
    await expect(page.locator('text=驗證錯誤')).toBeVisible();
    await expect(page.locator('text=密碼至少需要6個字符')).toBeVisible();
  });

  test('should show loading state during login', async ({ page }) => {
    await openAuthModal(page);
    
    // Fill in valid credentials
    await page.fill('input[name="auth-email"]', TEST_USER.email);
    await page.fill('input[name="auth-password"]', TEST_USER.password);
    
    // Intercept the login API call to delay it
    await page.route('**/api/auth/login', async route => {
      // Delay the response to test loading state
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' })
      });
    });
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should show loading state immediately
    await expect(page.locator('.animate-spin')).toBeVisible();
    await expect(page.locator('text=登入中...')).toBeVisible();
    
    // Button should be disabled
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    
    // Form inputs should be disabled
    await expect(page.locator('input[name="auth-email"]')).toBeDisabled();
    await expect(page.locator('input[name="auth-password"]')).toBeDisabled();
    
    // Mode switching buttons should be disabled
    await expect(page.locator('text=還沒帳號？立即註冊')).toHaveAttribute('disabled', '');
    
    // Wait for loading to complete
    await waitForLoadingToComplete(page);
    
    // Should show error message
    await expect(page.locator('text=登入失敗')).toBeVisible();
  });

  test('should prevent double-clicking during login', async ({ page }) => {
    await openAuthModal(page);
    
    // Fill in credentials
    await page.fill('input[name="auth-email"]', TEST_USER.email);
    await page.fill('input[name="auth-password"]', TEST_USER.password);
    
    // Intercept API call to make it slow
    let callCount = 0;
    await page.route('**/api/auth/login', async route => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' })
      });
    });
    
    const submitButton = page.locator('button[type="submit"]');
    
    // Click multiple times rapidly
    await submitButton.click();
    await submitButton.click();
    await submitButton.click();
    
    // Wait for the request to complete
    await waitForLoadingToComplete(page);
    
    // Should only have made one API call
    expect(callCount).toBe(1);
  });

  test('should handle successful login', async ({ page }) => {
    await openAuthModal(page);
    
    // Mock successful login response
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-jwt-token',
          user: {
            id: '123',
            email: TEST_USER.email,
            nickname: TEST_USER.nickname,
            created_at: new Date().toISOString()
          }
        })
      });
    });
    
    // Fill in credentials
    await page.fill('input[name="auth-email"]', TEST_USER.email);
    await page.fill('input[name="auth-password"]', TEST_USER.password);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should show success notification
    await expect(page.locator('text=登入成功！')).toBeVisible();
    await expect(page.locator(`text=歡迎回來 ${TEST_USER.nickname}！`)).toBeVisible();
    
    // Modal should close
    await expect(page.locator('[data-testid="auth-modal"]')).not.toBeVisible();
    
    // Check that auth token is stored in localStorage
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBe('mock-jwt-token');
  });

  test('should handle login failure', async ({ page }) => {
    await openAuthModal(page);
    
    // Mock failed login response
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: '電子郵件或密碼錯誤'
        })
      });
    });
    
    // Fill in invalid credentials
    await page.fill('input[name="auth-email"]', INVALID_USER.email);
    await page.fill('input[name="auth-password"]', INVALID_USER.password);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for loading to complete
    await waitForLoadingToComplete(page);
    
    // Should show error notification
    await expect(page.locator('text=登入失敗')).toBeVisible();
    await expect(page.locator('text=登錄信息錯誤，請檢查郵箱和密碼')).toBeVisible();
    
    // Modal should remain open
    await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible();
  });

  test('should handle network errors', async ({ page }) => {
    await openAuthModal(page);
    
    // Mock network error
    await page.route('**/api/auth/login', async route => {
      await route.abort('internetdisconnected');
    });
    
    // Fill in credentials
    await page.fill('input[name="auth-email"]', TEST_USER.email);
    await page.fill('input[name="auth-password"]', TEST_USER.password);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for loading to complete
    await waitForLoadingToComplete(page);
    
    // Should show network error
    await expect(page.locator('text=登入失敗')).toBeVisible();
    await expect(page.locator('text=網絡連接失敗，請檢查網絡連接')).toBeVisible();
  });

  test('should switch between modes correctly', async ({ page }) => {
    await openAuthModal(page);
    
    // Fill in login form
    await page.fill('input[name="auth-email"]', TEST_USER.email);
    await page.fill('input[name="auth-password"]', TEST_USER.password);
    
    // Switch to register mode
    await page.click('text=還沒帳號？立即註冊');
    
    // Should be in register mode and show nickname field
    await expect(page.locator('input[name="auth-nickname"]')).toBeVisible();
    
    // Fill register form
    await page.fill('input[name="auth-email"]', TEST_USER.email);
    await page.fill('input[name="auth-nickname"]', TEST_USER.nickname);
    await page.fill('input[name="auth-password"]', TEST_USER.password);
    
    // Switch back to login
    await page.click('text=已有帳號？立即登入');
    
    // Should be back in login mode without nickname field
    await expect(page.locator('input[name="auth-nickname"]')).not.toBeVisible();
  });

  test('should close modal when clicking X button', async ({ page }) => {
    await openAuthModal(page);
    
    // Modal should be visible
    await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible();
    
    // Click X button (using the button that contains the X icon)
    await page.click('[data-testid="auth-modal"] button:has(.lucide-x)');
    
    // Modal should be closed
    await expect(page.locator('[data-testid="auth-modal"]')).not.toBeVisible();
  });

  test('should handle mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await openAuthModal(page);
    
    // Modal should still be visible and responsive
    await expect(page.locator('[data-testid="auth-modal"]')).toBeVisible();
    
    // Form elements should be accessible
    await expect(page.locator('input[name="auth-email"]')).toBeVisible();
    await expect(page.locator('input[name="auth-password"]')).toBeVisible();
    
    // Submit button should be fully visible
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
