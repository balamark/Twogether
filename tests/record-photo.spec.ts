import { test, expect, request } from '@playwright/test';

const API = 'http://localhost:8080/api';
// 1x1 red PNG (same fixture used elsewhere).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function registerToken(email: string): Promise<string> {
  const ctx = await request.newContext();
  const reg = await ctx.post(`${API}/auth/register`, {
    data: { email, nickname: email.split('@')[0], password: 'test123456' },
  });
  const token = reg.ok()
    ? (await reg.json()).token
    : (await (await ctx.post(`${API}/auth/login`, { data: { email, password: 'test123456' } })).json()).token;
  await ctx.dispose();
  return token;
}

test.describe('Record photo upload', () => {
  test('paired user uploads a photo, links it to a record, and reads it back', async () => {
    const stamp = Date.now();
    const tokenA = await registerToken(`photoa-${stamp}@example.com`);
    const tokenB = await registerToken(`photob-${stamp}@example.com`);

    const ctxA = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenA}` } });
    const ctxB = await request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${tokenB}` } });

    try {
      // Photo upload requires a couple — pair the two users.
      const code = (await (await ctxA.post(`${API}/couples/pairing-code`, { data: {} })).json()).code;
      expect(code, 'got a pairing code').toBeTruthy();
      const join = await ctxB.post(`${API}/couples`, { data: { pairing_code: code } });
      expect(join.ok(), await join.text()).toBeTruthy();

      // Upload — this 500'd before ('column "uploaded_by" ... does not exist').
      const up = await ctxA.post(`${API}/photos/upload`, {
        multipart: {
          photo: { name: 'p.png', mimeType: 'image/png', buffer: PNG },
          memory_date: new Date().toISOString(),
        },
      });
      expect(up.status(), await up.text()).toBe(201);
      const photo = (await up.json()).photo;
      expect(photo?.id, 'upload returns a photo id').toBeTruthy();
      expect(photo?.file_path, 'upload returns a file_path (URL)').toBeTruthy();

      // Create a record linked to that photo → response carries photo_url.
      const rec = await ctxA.post(`${API}/love-moments`, {
        data: { moment_date: new Date().toISOString(), description: 'photo test', photo_id: photo.id },
      });
      expect(rec.status(), await rec.text()).toBe(201);
      const created = (await rec.json()).love_moment;
      expect(created.photo_id).toBe(photo.id);
      expect(created.photo_url, 'create returns photo_url').toBeTruthy();

      // List returns the record with a resolved photo_url (the photos join).
      const listBody = await (await ctxA.get(`${API}/love-moments`)).json();
      const mine = (listBody.love_moments || []).find((m: { id: string }) => m.id === created.id);
      expect(mine, 'record is in the list').toBeTruthy();
      expect(mine.photo_url, 'list resolves photo_url').toBeTruthy();

      // Edit path: PUT photo_id: '' clears the photo (mirrors "remove photo").
      const put = await ctxA.put(`${API}/love-moments/${created.id}`, { data: { photo_id: null } });
      expect(put.status(), await put.text()).toBe(200);
      const afterBody = await (await ctxA.get(`${API}/love-moments/${created.id}`)).json();
      expect(afterBody.love_moment.photo_url ?? null).toBeNull();
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
    }
  });
});
