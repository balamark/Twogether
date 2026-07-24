import { test, expect } from '@playwright/test';

// Compose flow: the select step shows the neutral event summary at the top,
// the neutral version card is distinct from the summary, and the selected
// version can be edited before sending (per-version drafts survive switching).
// APIs are stubbed — this verifies the UI flow, not the LLM plumbing.

const FAKE_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'a@x.test', nickname: 'A', selected_therapist: 'luma' };
const COUPLE_ID = '33333333-3333-3333-3333-333333333333';

const PREVIEW = {
  title: '接送小孩的分工',
  summary: '早上約好一起送小孩上學，一方未及時起床，之後各自行動。',
  emotions: ['失望'],
  tags: ['育兒'],
  toxicityFlags: [],
  versions: {
    neutral: '關於接送的事，我現在心裡有「失望」的感覺，想先把這份心情放在這裡讓你知道。',
    firm: '我感到失望，因為約好的接送計畫沒有實現。我先把這件事提出來放著。',
    warm: '我感到失望，因為約好的接送計畫沒有實現。等彼此平靜後，我願意再聊聊。',
  },
};

test.describe('Compose event — summary at top + editable opener', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem('authToken', 'fake-jwt');
      localStorage.setItem('authUser', JSON.stringify(user));
      localStorage.setItem(
        'authState',
        JSON.stringify({ user, isAuthenticated: true, partnerConnected: true })
      );
      localStorage.setItem('pairingPromptDismissed', 'true');
      localStorage.setItem(
        'authTokenExpiresAt',
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      );
    }, FAKE_USER);

    // Catch-all first so specific routes below override it.
    await page.route('**/api/**', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    );

    await page.route('**/api/couples**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            couple: {
              id: COUPLE_ID,
              user1_id: FAKE_USER.id,
              user1_nickname: FAKE_USER.nickname,
              user2_id: '88888888-8888-8888-8888-888888888888',
              user2_nickname: 'B',
            },
          }),
        });
      }
      return route.fallback();
    });

    await page.route('**/api/auth/**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, user: FAKE_USER, partnerConnected: true }),
        });
      }
      return route.fallback();
    });

    await page.route('**/api/events/icebreaker', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, preview: PREVIEW }),
      })
    );

    // Empty history list.
    await page.route('**/api/events*', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET' && /\/api\/events(\?[^/]*)?$/.test(url)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, events: [], total: 0 }),
        });
      }
      return route.fallback();
    });
  });

  const walkToSelectStep = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('nav-tab-communicate').click();
    await page.locator('button:has-text("開始對話")').first().click();
    await page.getByTestId('compose-raw-input').fill('他今天早上又沒起床送小孩，超級失望');
    await page.locator('button:has-text("讓 AI 整理")').click();
    await expect(page.getByTestId('compose-event-summary')).toBeVisible({ timeout: 10000 });
  };

  test('select step shows the neutral summary at top, distinct from the neutral card', async ({ page }) => {
    await walkToSelectStep(page);

    const summaryBlock = page.getByTestId('compose-event-summary');
    await expect(summaryBlock).toContainText(PREVIEW.summary);
    await expect(summaryBlock).toContainText('對話簡介');

    // The neutral version card shows its own (different) text.
    const neutralCard = page.locator('button:has-text("中性版")');
    await expect(neutralCard).toContainText(PREVIEW.versions.neutral);
    await expect(neutralCard).not.toContainText(PREVIEW.summary);
  });

  test('edit the summary on the select step; the edited text is sent', async ({ page }) => {
    let createBody: Record<string, unknown> | null = null;
    await page.route('**/api/events', async (route) => {
      if (route.request().method() === 'POST') {
        createBody = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            event: { id: '44444444-4444-4444-4444-444444444444', messages: [] },
          }),
        });
      }
      return route.fallback();
    });

    await walkToSelectStep(page);

    const EDITED_SUMMARY = '早上約好一起送小孩上學，實際各自行動（我補充：已當面談過一次）。';
    await page.getByTestId('compose-summary-edit').click();
    const summaryEditor = page.getByTestId('compose-summary-editor');
    await expect(summaryEditor).toHaveValue(PREVIEW.summary);
    await summaryEditor.fill(EDITED_SUMMARY);
    await page.locator('button:has-text("完成")').click();

    const summaryBlock = page.getByTestId('compose-event-summary');
    await expect(summaryBlock).toContainText(EDITED_SUMMARY);
    await expect(summaryBlock).toContainText('已編輯');

    await page.locator('button:has-text("送出")').click();
    await expect.poll(() => createBody, { timeout: 10000 }).not.toBeNull();
    expect(createBody!.summary).toBe(EDITED_SUMMARY);
  });

  test('edit the selected version before sending; drafts survive switching versions', async ({ page }) => {
    let createBody: Record<string, unknown> | null = null;
    await page.route('**/api/events', async (route) => {
      if (route.request().method() === 'POST') {
        createBody = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            event: {
              id: '44444444-4444-4444-4444-444444444444',
              couple_id: COUPLE_ID,
              created_by: FAKE_USER.id,
              title: PREVIEW.title,
              summary: PREVIEW.summary,
              emotions: PREVIEW.emotions,
              tags: PREVIEW.tags,
              toxicity_flags: [],
              versions: PREVIEW.versions,
              selected_version: 'firm',
              is_private: false,
              status: 'open',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              messages: [],
            },
          }),
        });
      }
      return route.fallback();
    });

    await walkToSelectStep(page);

    const editor = page.getByTestId('compose-opening-editor');
    await expect(editor).toBeVisible();
    // Default selection is neutral — editor mirrors the neutral version.
    await expect(editor).toHaveValue(PREVIEW.versions.neutral);

    // Pick 堅定版 and customise it.
    const EDITED = '我很失望，這是我自己改過的版本。';
    await page.locator('button:has-text("堅定不攻擊版")').click();
    await expect(editor).toHaveValue(PREVIEW.versions.firm);
    await editor.fill(EDITED);

    // The edited card shows the 已編輯 chip.
    await expect(page.locator('button:has-text("堅定不攻擊版")')).toContainText('已編輯');

    // Switch away and back — the firm draft must survive.
    await page.locator('button:has-text("善意版")').click();
    await expect(editor).toHaveValue(PREVIEW.versions.warm);
    await page.locator('button:has-text("堅定不攻擊版")').click();
    await expect(editor).toHaveValue(EDITED);

    // Send: opening_message carries the edit; ai_firm stays the AI original.
    await page.locator('button:has-text("送出")').click();
    await expect
      .poll(() => createBody, { timeout: 10000 })
      .not.toBeNull();
    expect(createBody!.opening_message).toBe(EDITED);
    expect(createBody!.ai_firm).toBe(PREVIEW.versions.firm);
    expect(createBody!.selected_version).toBe('firm');
  });
});
