import { test, expect, request } from '@playwright/test';
import { supportEmail as SUPPORT_EMAIL } from '../lib/supportContact.json';

// The public sales page is served by Express (not the Vite dev server), so hit
// the API server directly rather than the SPA baseURL.
const SERVER = 'http://localhost:8080';

// /pricing is the URL ECPay/NewebPay audit against, and the support address on
// it is the only contact channel a customer with a payment dispute has. It is
// rendered from a {{SUPPORT_EMAIL}} placeholder now, so an un-substituted page
// is a shipping bug — assert both the real address and the absence of any
// leftover placeholder.
//
// '/pricing.html' matters because Vite copies public/ into dist/ verbatim: the
// raw-placeholder copy is sitting on disk and only the Express route registered
// ahead of the static middleware keeps it from being served.
const PATHS = ['/pricing', '/membership', '/plans', '/pricing.html'];

for (const path of PATHS) {
  test(`${path} renders the support email with no unsubstituted placeholders`, async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${SERVER}${path}`);
    expect(res.status()).toBe(200);

    const html = await res.text();
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain(`mailto:${SUPPORT_EMAIL}`);
    expect(html).not.toContain('{{');
    // The private Gmail this page used to publish must never come back.
    expect(html).not.toContain('gmail.com');

    await ctx.dispose();
  });
}
