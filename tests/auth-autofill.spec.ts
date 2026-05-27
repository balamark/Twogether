import { test, expect } from '@playwright/test';

test.describe('Autofill Robustness', () => {
  test('should not clear programmatically filled password input when email fires input event', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('pairingPromptDismissed', 'true');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Open login modal
    const loginButton = page.getByTestId('header-auth-button');
    await expect(loginButton).toBeVisible({ timeout: 5000 });
    await loginButton.click();
    await page.waitForTimeout(1000);

    await expect(page.getByTestId('auth-modal-heading')).toBeVisible({ timeout: 5000 });

    const emailInput = page.getByTestId('auth-email-input');
    const passwordInput = page.getByTestId('auth-password-input');

    await expect(emailInput).toBeVisible({ timeout: 3000 });
    await expect(passwordInput).toBeVisible({ timeout: 3000 });

    // Simulate browser autofill: programmatically set values directly in the DOM using React-compatible setter
    await page.evaluate(() => {
      const emailEl = document.querySelector('[data-testid="auth-email-input"]') as HTMLInputElement;
      const passwordEl = document.querySelector('[data-testid="auth-password-input"]') as HTMLInputElement;
      if (emailEl && passwordEl) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;

        if (nativeInputValueSetter) {
          // Set values via native setter to bypass React's property override
          nativeInputValueSetter.call(emailEl, 'test-e2e@twogether.app');
          nativeInputValueSetter.call(passwordEl, 'test123456');

          // Dispatch input event ONLY on the email field. This triggers React to handle email's change event.
          // In the buggy controlled setup, this email change triggers a re-render where password state
          // is still empty (''), resulting in React overwriting passwordEl.value back to empty string.
          emailEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    // Wait a brief moment for React render cycle
    await page.waitForTimeout(1000);

    // Verify password field did not get wiped out back to empty string
    const passwordValue = await passwordInput.inputValue();
    expect(passwordValue).toBe('test123456');
  });
});
