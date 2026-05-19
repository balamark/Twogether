import { test, expect, Page } from '@playwright/test';

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  password: 'test123456',
};

async function loginIfNeeded(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('pairingPromptDismissed', 'true');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const loginButton = page.getByTestId('header-auth-button');
  const recordButton = page.getByTestId('add-record-button');

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
    await closeBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

// First built-in script id from defaultRoleplayScripts in src/App.tsx.
// Used because built-in ids are stable across runs (custom UUIDs are not).
const KNOWN_SCRIPT_ID = 'fan-idol-backstage';

test.describe('Roleplay favorites — couple-shared 我的最愛劇本', () => {
  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page);
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(2000);
  });

  test('favoriting a script promotes it to the top section; unfavoriting falls back to featured', async ({ page }) => {
    // 1. With no favorites, the top section is the fallback featured section.
    await expect(page.getByTestId('roleplay-featured-section')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('roleplay-favorites-section')).toHaveCount(0);

    // 2. Click the heart toggle on a known built-in script. The same script
    //    appears in both the featured top section and the all-scripts list,
    //    so multiple matching buttons can exist — use the all-scripts one to
    //    keep the test independent from the top-section presentation.
    const toggleAll = page.getByTestId(`script-favorite-toggle-${KNOWN_SCRIPT_ID}`);
    await expect(toggleAll.first()).toBeVisible({ timeout: 5000 });

    // Wait for the POST round-trip so the optimistic state is confirmed.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/script-favorites') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      toggleAll.first().click(),
    ]);

    // 3. Top section flips to "我的最愛".
    await expect(page.getByTestId('roleplay-favorites-section')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('roleplay-featured-section')).toHaveCount(0);

    // 4. Reload — favorite persists from the backend.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('nav-tab-roleplay').click();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('roleplay-favorites-section')).toBeVisible({ timeout: 5000 });

    // 5. Unfavorite — DELETE round-trip, top section falls back to featured.
    const toggleAfter = page.getByTestId(`script-favorite-toggle-${KNOWN_SCRIPT_ID}`).first();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/script-favorites') && r.request().method() === 'DELETE',
        { timeout: 10000 }
      ),
      toggleAfter.click(),
    ]);
    await expect(page.getByTestId('roleplay-featured-section')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('roleplay-favorites-section')).toHaveCount(0);
  });

  test('script modal renders thumbnail and a working favorite toggle', async ({ page }) => {
    // Open the first script in the all-scripts list.
    const viewBtn = page.getByTestId('script-list-view-button-0');
    await expect(viewBtn).toBeVisible({ timeout: 5000 });
    await viewBtn.click();

    // Modal opens. The header thumbnail uses renderThumb; an <img> is present
    // for built-in scripts that have an image path (the first script does).
    const modal = page.getByTestId('roleplay-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.locator('img').first()).toBeVisible({ timeout: 3000 });

    // The modal contains a favorite toggle; clicking it round-trips to the API.
    const modalFav = modal.locator('[data-testid^="script-favorite-toggle-"]').first();
    await expect(modalFav).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/script-favorites'),
        { timeout: 10000 }
      ),
      modalFav.click(),
    ]);

    // Close the modal and clean up by toggling the favorite back off through
    // the all-scripts card so subsequent runs start clean.
    await page.getByTestId('roleplay-modal-close-button').click();
    await page.waitForTimeout(500);
    if (await page.getByTestId('roleplay-favorites-section').isVisible({ timeout: 1000 }).catch(() => false)) {
      const filledHeart = page.locator('button[aria-pressed="true"][data-testid^="script-favorite-toggle-"]').last();
      if (await filledHeart.isVisible({ timeout: 1000 }).catch(() => false)) {
        await filledHeart.click();
        await page.waitForTimeout(800);
      }
    }
  });
});
