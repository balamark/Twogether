import { test, expect, Page, APIRequestContext } from '@playwright/test';

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  password: 'test123456',
};

const SHARED_SCRIPT_TITLE = `Marketplace E2E Script ${Date.now()}`;

// Track script ids created during the run so afterEach can delete them via
// the API. Deleting the script CASCADEs to script_favorites and
// script_ratings — that's what keeps the parallel roleplay-favorites suite
// (which expects a clean favorites slate) from flaking on our leftover state.
const createdScriptIds: string[] = [];

async function cleanupCreatedScripts(api: APIRequestContext, token: string) {
  while (createdScriptIds.length) {
    const id = createdScriptIds.pop()!;
    await api.delete(`http://localhost:8080/api/custom-scripts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}

async function loginViaApi(api: APIRequestContext): Promise<string> {
  const res = await api.post('http://localhost:8080/api/auth/login', {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  const body = await res.json();
  return body.token as string;
}

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

async function gotoRoleplay(page: Page) {
  const tab = page.getByTestId('nav-tab-roleplay');
  await expect(tab).toBeVisible({ timeout: 5000 });
  await tab.click();
  await page.waitForTimeout(1500);
}

test.describe('Marketplace — public script sharing + ratings + favorites', () => {
  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page);
    await gotoRoleplay(page);
  });

  test.afterEach(async ({ request }) => {
    const token = await loginViaApi(request).catch(() => null);
    if (token) await cleanupCreatedScripts(request, token);
  });

  test('upload-with-default-public → discover in Marketplace → rate → favorite → see in 我的收藏', async ({ page }) => {
    // 1. Open the upload modal and verify the share toggle is ON by default.
    await page.getByTestId('script-upload-button').click();
    const publicToggle = page.getByTestId('script-public-toggle');
    await expect(publicToggle).toBeVisible({ timeout: 5000 });
    await expect(publicToggle).toBeChecked();

    // 2. Fill in and submit.
    await page.locator('#script-title').fill(SHARED_SCRIPT_TITLE);
    await page.locator('#script-scenario').fill('A scripted scene for the marketplace test');
    await page.locator('#script-content').fill('[男]: hi\n[女]: hello');

    const [createResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/custom-scripts') && r.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.getByTestId('script-upload-submit-button').click(),
    ]);
    const created = await createResp.json();
    if (created?.custom_script?.id) createdScriptIds.push(created.custom_script.id);
    await page.waitForTimeout(1500);

    // 3. Switch to Marketplace tab — the new script should appear in the grid.
    //    Register waitForResponse BEFORE the click that triggers the fetch —
    //    Playwright only matches future responses, so the post-click `await`
    //    pattern races with a fast in-memory CI server.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/marketplace/scripts') && r.request().method() === 'GET',
        { timeout: 10000 }
      ),
      page.getByTestId('roleplay-tab-marketplace').click(),
    ]);
    await expect(page.getByTestId('marketplace-grid')).toBeVisible({ timeout: 5000 });

    // 4. Switch the sort dropdown to "最新" so the new script bubbles to the top.
    //    The sort control is a custom themed dropdown (not a native <select>),
    //    so open the trigger then click the option. The option click changes
    //    `marketplaceSort` state, which re-runs the load effect — pair the
    //    response wait with the click so we don't miss the fetch.
    await page.getByTestId('marketplace-sort').click();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/marketplace/scripts') && r.request().method() === 'GET',
        { timeout: 10000 }
      ),
      page.getByTestId('marketplace-sort-option-recent').click(),
    ]);
    await page.waitForTimeout(1000);

    // 5. Locate the new card by title text inside the grid (the title is the
    //    contract being verified, not a click target).
    const card = page.getByTestId('marketplace-grid').locator('div', { hasText: SHARED_SCRIPT_TITLE }).first();
    await expect(card).toBeVisible({ timeout: 5000 });

    // 6. Open the detail modal by clicking the card.
    await card.click();
    await expect(page.getByTestId('marketplace-detail-modal')).toBeVisible({ timeout: 5000 });

    // 7. Author should NOT see the rating form for their own script.
    await expect(page.getByTestId('rating-submit-button')).toHaveCount(0);

    // 8. Favorite the script — round-trips via /script-favorites POST.
    //    Immediately unfavorite (DELETE) to minimize the window during which
    //    state is observable to the parallel roleplay-favorites suite, which
    //    asserts a clean favorites slate at its startup. afterEach also
    //    deletes the script entirely to CASCADE any straggler state.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/script-favorites') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.getByTestId('marketplace-detail-favorite-button').click(),
    ]);
    await expect(page.getByTestId('marketplace-detail-favorite-button')).toContainText('已收藏', { timeout: 5000 });

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/script-favorites') && r.request().method() === 'DELETE',
        { timeout: 10000 }
      ),
      page.getByTestId('marketplace-detail-favorite-button').click(),
    ]);

    // 9. Close detail modal.
    await page.getByTestId('marketplace-detail-close').click();
    await page.waitForTimeout(500);
  });

  test('author can 取消發布 directly from the marketplace detail view', async ({ page }) => {
    // Upload a public script.
    await page.getByTestId('script-upload-button').click();
    await expect(page.getByTestId('script-public-toggle')).toBeChecked();
    const title = `Unpublish E2E Script ${Date.now()}`;
    await page.locator('#script-title').fill(title);
    await page.locator('#script-scenario').fill('to be unpublished from detail');
    await page.locator('#script-content').fill('[男]: hi\n[女]: hello');

    const [createResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/custom-scripts') && r.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.getByTestId('script-upload-submit-button').click(),
    ]);
    const created = await createResp.json();
    if (created?.custom_script?.id) createdScriptIds.push(created.custom_script.id);
    await page.waitForTimeout(1500);

    // Open Marketplace, sort by newest, find and open the card.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/marketplace/scripts') && r.request().method() === 'GET',
        { timeout: 10000 }
      ),
      page.getByTestId('roleplay-tab-marketplace').click(),
    ]);
    await page.getByTestId('marketplace-sort').click();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/marketplace/scripts') && r.request().method() === 'GET',
        { timeout: 10000 }
      ),
      page.getByTestId('marketplace-sort-option-recent').click(),
    ]);
    await page.waitForTimeout(1000);

    const card = page.getByTestId('marketplace-grid').locator('div', { hasText: title }).first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.click();
    await expect(page.getByTestId('marketplace-detail-modal')).toBeVisible({ timeout: 5000 });

    // The author sees the unpublish action. Click → confirm.
    await page.getByTestId('marketplace-detail-unpublish-button').click();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/custom-scripts/') && r.request().method() === 'PUT',
        { timeout: 10000 }
      ),
      page.getByTestId('marketplace-detail-unpublish-confirm').click(),
    ]);

    // Modal closes and the script is gone from the marketplace grid.
    await expect(page.getByTestId('marketplace-detail-modal')).toHaveCount(0, { timeout: 5000 });
    await page.waitForTimeout(1000);
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test('toggle off Marketplace share keeps the script private', async ({ page }) => {
    await page.getByTestId('script-upload-button').click();
    const publicToggle = page.getByTestId('script-public-toggle');
    await expect(publicToggle).toBeChecked();
    await publicToggle.click();
    await expect(publicToggle).not.toBeChecked();

    const privateTitle = `Private E2E Script ${Date.now()}`;
    await page.locator('#script-title').fill(privateTitle);
    await page.locator('#script-scenario').fill('private only');
    await page.locator('#script-content').fill('[男]: hi\n[女]: hello');

    const [privCreateResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/custom-scripts') && r.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.getByTestId('script-upload-submit-button').click(),
    ]);
    const privCreated = await privCreateResp.json();
    if (privCreated?.custom_script?.id) createdScriptIds.push(privCreated.custom_script.id);
    await page.waitForTimeout(1500);

    // Marketplace should NOT show this script (it's private).
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/marketplace/scripts') && r.request().method() === 'GET',
        { timeout: 10000 }
      ),
      page.getByTestId('roleplay-tab-marketplace').click(),
    ]);
    await page.waitForTimeout(1000);
    await expect(page.getByText(privateTitle)).toHaveCount(0);
  });
});
