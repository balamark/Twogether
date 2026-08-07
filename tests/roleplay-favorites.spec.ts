import { test, expect, Page } from '@playwright/test';

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  password: 'test123456',
};

async function loginIfNeeded(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('pairingPromptDismissed', 'true');
    // 收藏劇本 / 所有劇本 are collapsed by default; expand them so the
    // all-scripts cards these tests target are rendered.
    localStorage.setItem('roleplayOpen:all', '1');
    localStorage.setItem('roleplayOpen:collection', '1');
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
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
    // The modal auto-closes on a successful login, so it can detach between
    // the isVisible check and this click — tolerate it already being gone.
    await closeBtn.click({ timeout: 2000 }).catch(() => {});
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

// First built-in script id from defaultRoleplayScripts in src/App.tsx.
// Used because built-in ids are stable across runs (custom UUIDs are not).
const KNOWN_SCRIPT_ID = 'fan-idol-backstage';

// Serial: favorites are couple-shared server state keyed by script id, and both
// tests toggle the same known script.
test.describe.serial('Roleplay favorites — couple-shared 我的最愛劇本', () => {
  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page);
    const roleplayTab = page.getByTestId('nav-tab-roleplay');
    await expect(roleplayTab).toBeVisible({ timeout: 5000 });
    await roleplayTab.click();
    await page.waitForTimeout(2000);
  });

  test('favoriting a script shows it under the 我的最愛 filter; unfavoriting removes it', async ({ page }) => {
    // 1. Favorite a known built-in script via its heart toggle in the list.
    const toggle = page.getByTestId(`script-favorite-toggle-${KNOWN_SCRIPT_ID}`).first();
    await expect(toggle).toBeVisible({ timeout: 5000 });
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/script-favorites') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      toggle.click(),
    ]);

    // 2. The 我的最愛 filter chip now lists the favorited script.
    await page.getByTestId('roleplay-filter-favorites').click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId(`script-favorite-toggle-${KNOWN_SCRIPT_ID}`).first()).toBeVisible({ timeout: 5000 });

    // 3. Reload — favorite persists from the backend, still under 我的最愛.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-roleplay').click();
    await page.waitForTimeout(1500);
    await page.getByTestId('roleplay-filter-favorites').click();
    await page.waitForTimeout(500);
    const favToggle = page.getByTestId(`script-favorite-toggle-${KNOWN_SCRIPT_ID}`).first();
    await expect(favToggle).toBeVisible({ timeout: 5000 });

    // 4. Unfavorite — it drops out of the 我的最愛 list. It was the only
    //    favorite, so the list falls to its empty state.
    await favToggle.click();
    await expect(page.getByTestId('roleplay-empty')).toBeVisible({ timeout: 10000 });
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
    // Clean up: unfavorite via any filled heart so subsequent runs start clean.
    const filledHeart = page.locator('button[aria-pressed="true"][data-testid^="script-favorite-toggle-"]').first();
    if (await filledHeart.isVisible({ timeout: 1000 }).catch(() => false)) {
      await filledHeart.click();
      await page.waitForTimeout(800);
    }
  });
});
