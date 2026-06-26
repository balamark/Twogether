import { request } from '@playwright/test';

const TEST_USER = {
  email: 'test-e2e@twogether.app',
  nickname: 'E2E Test User',
  password: 'test123456',
};

const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_BASE || 'http://localhost:8080';
const API_BASE = `${BACKEND_BASE}/api`;

async function waitForBackend(timeoutMs = 60_000) {
  const ctx = await request.newContext();
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await ctx.get(`${BACKEND_BASE}/health`);
      if (res.ok()) {
        await ctx.dispose();
        return;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await ctx.dispose();
  throw new Error(`Backend not reachable at ${BACKEND_BASE}/health within ${timeoutMs}ms: ${String(lastError)}`);
}

// HARD GUARD: refuse to run the suite unless the backend is connected to a
// LOCAL database. Without this, `reuseExistingServer` (non-CI) can silently
// reuse a prod/staging server left running on :8080 and the tests would register
// test users straight into production. This catches that before any write.
async function assertLocalDatabase() {
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(`${BACKEND_BASE}/health`);
    const body = (await res.json().catch(() => ({}))) as { dbIsLocal?: boolean };
    if (body.dbIsLocal !== true) {
      throw new Error(
        `\n\n[global-setup] REFUSING TO RUN: the backend at ${BACKEND_BASE} is NOT on a local test database ` +
        `(/health dbIsLocal=${body.dbIsLocal}).\n` +
        `A prod/staging server is probably running on port 8080 and Playwright reused it ` +
        `(reuseExistingServer). Stop it (e.g. \`pkill -f "node server.js"\`) and re-run so tests start a ` +
        `fresh server on the local test DB.\n`
      );
    }
  } finally {
    await ctx.dispose();
  }
}

async function ensureTestUser() {
  const ctx = await request.newContext();
  try {
    const loginRes = await ctx.post(`${API_BASE}/auth/login`, {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    if (loginRes.ok()) {
      return;
    }

    const registerRes = await ctx.post(`${API_BASE}/auth/register`, {
      data: TEST_USER,
    });
    if (!registerRes.ok()) {
      const body = await registerRes.text();
      throw new Error(`register failed: ${registerRes.status()} ${body}`);
    }
    console.log(`[global-setup] registered test user ${TEST_USER.email}`);
  } finally {
    await ctx.dispose();
  }
}

export default async function globalSetup() {
  await waitForBackend();
  await assertLocalDatabase();
  await ensureTestUser();
}
