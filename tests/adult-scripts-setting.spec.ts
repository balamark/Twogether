import { test, expect, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:8080/api';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function registerViewer(api: APIRequestContext) {
  const email = `adult-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@twogether.app`;
  const password = 'test123456';
  const reg = await api.post(`${API}/auth/register`, {
    data: { email, nickname: '分級測試', password },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const login = await api.post(`${API}/auth/login`, { data: { email, password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  const body = await login.json();
  expect(body.user.show_adult_scripts).toBe(false);
  return { token: body.token as string, user: body.user };
}

async function createPublicScript(
  api: APIRequestContext,
  token: string,
  title: string,
  tags: string[],
) {
  const res = await api.post(`${API}/custom-scripts`, {
    headers: auth(token),
    data: {
      title,
      category: 'romantic',
      scenario: '一段可以公開的情境說明。',
      content: '小安: 我們走吧。\n阿哲: 好，一起去。',
      tags,
      isPublic: true,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).custom_script.id as string;
}

test.describe('show 18+ scripts setting', () => {
  test('hides 18+ and explicit scripts from the marketplace until the viewer opts in', async ({ request }) => {
    const { token } = await registerViewer(request);
    const stamp = `分級${Date.now()}`;
    const safeId = await createPublicScript(request, token, `${stamp} 散步`, ['散步']);
    const taggedId = await createPublicScript(request, token, `${stamp} 成人`, ['18+', '夜晚']);
    const intenseId = await createPublicScript(request, token, `${stamp} 露骨`, ['強度:露骨']);

    const hiddenList = await request.get(`${API}/marketplace/scripts`, {
      headers: auth(token),
      params: { q: stamp, sort: 'recent', limit: 20 },
    });
    expect(hiddenList.ok(), await hiddenList.text()).toBeTruthy();
    const hiddenIds = ((await hiddenList.json()).scripts as Array<{ id: string }>).map((s) => s.id);
    expect(hiddenIds).toContain(safeId);
    expect(hiddenIds).not.toContain(taggedId);
    expect(hiddenIds).not.toContain(intenseId);

    const detail = await request.get(`${API}/marketplace/scripts/${taggedId}`, { headers: auth(token) });
    expect(detail.status()).toBe(403);
    const denied = await detail.json();
    expect(denied.error_code).toBe('ADULT_SCRIPTS_HIDDEN');
    expect(denied.message).toContain('顯示 18+ 劇本');
    expect(denied.script).toBeUndefined();

    const mine = await request.get(`${API}/custom-scripts`, { headers: auth(token) });
    const mineIds = ((await mine.json()).custom_scripts as Array<{ id: string }>).map((s) => s.id);
    expect(mineIds).toEqual(expect.arrayContaining([safeId, taggedId, intenseId]));

    const turnedOn = await request.put(`${API}/auth/user/show-adult-scripts`, {
      headers: auth(token),
      data: { show_adult_scripts: true },
    });
    expect(turnedOn.ok(), await turnedOn.text()).toBeTruthy();
    expect((await turnedOn.json()).show_adult_scripts).toBe(true);

    const shown = await request.get(`${API}/marketplace/scripts`, {
      headers: auth(token),
      params: { q: stamp, sort: 'recent', limit: 20 },
    });
    const shownIds = ((await shown.json()).scripts as Array<{ id: string }>).map((s) => s.id);
    expect(shownIds).toEqual(expect.arrayContaining([safeId, taggedId, intenseId]));

    const open = await request.get(`${API}/marketplace/scripts/${intenseId}`, { headers: auth(token) });
    expect(open.status(), await open.text()).toBe(200);
    expect((await open.json()).script.title).toContain('露骨');

    await request.delete(`${API}/custom-scripts/${safeId}`, { headers: auth(token) });
    await request.delete(`${API}/custom-scripts/${taggedId}`, { headers: auth(token) });
    await request.delete(`${API}/custom-scripts/${intenseId}`, { headers: auth(token) });
  });

  test('a shared ?market= link explains how to turn 18+ scripts on', async ({ page, request }) => {
    const { token, user } = await registerViewer(request);
    const title = `分享成人 ${Date.now()}`;
    const id = await createPublicScript(request, token, title, ['18+']);

    await page.addInitScript(({ token: authToken, authUser }) => {
      const storedUser = {
        id: authUser.id,
        email: authUser.email,
        nickname: authUser.nickname,
        show_adult_scripts: false,
        createdAt: authUser.created_at || new Date().toISOString(),
      };
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('authUser', JSON.stringify(storedUser));
      localStorage.setItem('authState', JSON.stringify({
        user: storedUser,
        isAuthenticated: true,
        partnerConnected: false,
      }));
      localStorage.setItem('pairingPromptDismissed', 'true');
    }, { token, authUser: user });

    await page.goto(`/?market=${id}`);
    const gate = page.getByTestId('adult-scripts-hidden');
    await expect(gate).toBeVisible({ timeout: 20000 });
    await expect(gate).toContainText('顯示 18+ 劇本');
    await expect(page.getByTestId('marketplace-detail-play-button')).toHaveCount(0);

    await page.getByTestId('adult-scripts-enable').click();
    const modal = page.getByTestId('marketplace-detail-modal');
    await expect(modal).toContainText(title, { timeout: 15000 });
    await expect(page.getByTestId('marketplace-detail-play-button')).toBeVisible();
    await page.getByTestId('marketplace-detail-close').click();

    await page.getByTestId('user-menu-toggle').click();
    const toggle = page.getByTestId('user-menu-show-adult-scripts');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    // The white knob stays inside its track, at the right end when on.
    const knobInTrack = () => toggle.evaluate((el) => {
      const track = el.querySelector('span[aria-hidden]')!.getBoundingClientRect();
      const knob = el.querySelector('span[aria-hidden] > span')!.getBoundingClientRect();
      return { inside: knob.left >= track.left && knob.right <= track.right, rightHalf: knob.left > track.left + track.width / 4 };
    });
    await expect.poll(knobInTrack).toEqual({ inside: true, rightHalf: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(knobInTrack).toEqual({ inside: true, rightHalf: false });

    await request.delete(`${API}/custom-scripts/${id}`, { headers: auth(token) });
  });
});
