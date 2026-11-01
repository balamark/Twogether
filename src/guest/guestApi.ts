import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { isGuestActive } from './guestMode';
import { ROUTES, PUBLIC_GETS, type GuestCtx } from './guestRoutes';
import { GuestError } from './guestErrors';
import { saveDb, loadDb } from './guestDb';

// ─── Guest-mode axios adapter ───────────────────────────────────────────────
// Sits in front of the real adapter. While isGuestActive(), every request is
// answered locally from the session-only guest DB (guestRoutes.ts) — the
// network is never touched, so a guest's writing can't leak to the server.
// Auth endpoints always go to the network (that's how a guest signs up).

const PASSTHROUGH = [/^\/auth\//, /^\/track\//, /^\/client-log/, /^\/feature-flags$/, /^\/pairing-requests\/reject\//];

/** Paths that no handler answered — read by the dev crawler, never sent anywhere. */
export const unmocked: string[] = [];

function parseBody(config: InternalAxiosRequestConfig): unknown {
  const d = config.data;
  if (d == null) return {};
  if (typeof d === 'string') {
    try { return JSON.parse(d); } catch { return {}; }
  }
  if (typeof FormData !== 'undefined' && d instanceof FormData) {
    const out: Record<string, unknown> = {};
    const files: File[] = [];
    d.forEach((v, k) => {
      if (typeof File !== 'undefined' && v instanceof File) files.push(v);
      else out[k] = v;
    });
    out.__files = files;
    return out;
  }
  return d;
}

function pathOf(config: InternalAxiosRequestConfig): { path: string; query: URLSearchParams } {
  const raw = config.url || '';
  const u = new URL(raw, 'http://guest.local/api/');
  let path = u.pathname.replace(/^\/api/, '');
  if (!path.startsWith('/')) path = `/${path}`;
  const query = new URLSearchParams(u.search);
  const params = (config.params || {}) as Record<string, unknown>;
  Object.entries(params).forEach(([k, v]) => { if (v != null) query.set(k, String(v)); });
  return { path, query };
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config, request: {} };
}

export function guestAdapter(base: AxiosAdapter): AxiosAdapter {
  return async (config) => {
    if (!isGuestActive()) return base(config);
    const { path, query } = pathOf(config);
    const method = (config.method || 'get').toLowerCase();
    if (PASSTHROUGH.some((re) => re.test(path))) return base(config);
    // Public read-only content (testimonials, stories, counselor directory) is
    // real for everyone, guests included.
    if (method === 'get' && PUBLIC_GETS.some((re) => re.test(path))) return base(config);
    const body = parseBody(config);
    const db = loadDb();

    // A tiny delay so loading states and optimistic UI behave like the real app.
    await new Promise((r) => setTimeout(r, method === 'get' ? 40 : 120));

    for (const route of ROUTES) {
      if (route.method !== method && route.method !== 'any') continue;
      const m = route.re.exec(path);
      if (!m) continue;
      const ctx: GuestCtx = { db, params: m.groups || {}, query, body: body as Record<string, unknown>, path, method };
      try {
        const out = await route.handler(ctx);
        if (method !== 'get') { db.dirty = true; saveDb(db); }
        return respond(config, 200, out);
      } catch (e) {
        if (e instanceof GuestError) {
          const err = Object.assign(new Error(e.message), {
            config,
            isAxiosError: true,
            response: respond(config, e.status, { success: false, message: e.message, error: e.message, error_code: e.error_code }),
          });
          throw err;
        }
        throw e;
      }
    }

    // Nothing matched: answer with a harmless empty success so the real view
    // renders its own empty state instead of a network error.
    unmocked.push(`${method.toUpperCase()} ${path}`);
    if (import.meta.env.DEV) console.warn('[guest] unmocked', method.toUpperCase(), path);
    if (method === 'get') return respond(config, 200, { success: true, data: [] });
    return respond(config, 200, { success: true, data: { id: `guest-${Date.now()}`, ...(body as object) } });
  };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __guestUnmocked: string[] }).__guestUnmocked = unmocked;
}
