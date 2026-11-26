# 0023. Dev tooling, CI guards & test harness

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `scripts/*`, `playwright.config.ts`, `test-integration.js`, `test-notification-service.js`

## CI guards

- **`check-admin-inline-script.js`:** the /admin dashboard's script lives inside a
  JS template literal in `routes/admin.js`, so eslint and `node --check` see a
  string. A stray escape (`\n` turning into a real newline) breaks only the
  served script, which kills the dashboard in the browser. The guard renders the
  HTML, extracts each `<script>` and compiles it with `vm.Script` (parse only,
  never executed). It's the browser-free counterpart to the Playwright
  `pageerror` guard.
- **`check-dark-contrast.js`:** colours are hard-coded Tailwind utilities, so
  Engineer Mode's dark skin works through `.dark .<utility>` overrides that are
  easy to forget. A pale panel keeps its background while its text flips to
  near-white, making it invisible (that's how the notification inbox broke). The
  guard collects every light-surface and dark-ink utility in use and fails when
  `src/index.css` lacks an override:
  - surfaces: 50/100/200 shades, white, the pale petal tokens, and
    `petal-sage`/`petal-rose` *at low opacity* only (~90 sage panels were missed
    before);
  - ink: shades 600–900 (600 lands near 3:1 on dark panels, below 4.5:1).
- **`build-changelog.mjs`:** each user-facing change is its own
  `changelog/YYYY-MM-DD-<slug>.md`, so concurrent PRs never conflict. The script
  groups fragments by date (newest first, filename order within a date) between
  the README markers. CI runs it without `npm ci`, so it must stay
  dependency-free.
- `lint:comments`: ADR 0001.

## Playwright

- `.env.test` is loaded with `override: true`, and `.env` / `.env.local` are
  never loaded, so tests always point at the locked-down local test DB.
- **`fullyParallel: false`**, so `--shard=N/4` splits by whole file and each file
  keeps its order and its `beforeAll`.
- **`workers: 1` everywhere**, because the DB-backed specs share one seeded
  account and mutate the same rows. Local runs then match CI (shortcut: #171).
- **Test timeout 60s, expect 10s.** Several specs had outgrown 30s (real sign-up
  and upload flows on a cold Vite build) and only passed because CI retries
  twice. Raising the floor makes the suite honest, not retry-dependent.
- WebKit (Mobile Safari) runs only the specs that check iOS tap-offset
  behaviour. Running every spec twice isn't worth the CI minutes.
- The webServer env is deterministic and free:
  - `LLM_PROVIDER=mock`, because a local `.env` with `claude` would bill real
    tokens with non-deterministic output;
  - dummy LINE and NewebPay credentials, so `isConfigured()` is true and the
    signature/MPG paths actually run (specs sign with the same test keys);
  - `APP_BASE_URL` is the local server, so NotifyURL assertions point back at it;
  - a test `ADMIN_PASSWORD` and marketplace bot key, which are not production
    secrets.

## Integration & unit scripts

- `test-integration.js` and `test-notification-service.js` are plain Node scripts
  with no test runner. The notification test stubs `database/db`, LINE and email
  through the require cache and asserts four cases: paired, unpaired, unknown
  type, and an insert that throws without bubbling up.
- `scripts/test-datetime.cjs` mirrors the timezone math in
  `src/utils/datetime.ts`, so it can be checked without a JS test runner.
- Integration specifics: deposits only move through a partner; AI feedback
  re-votes use a real UUID reference so the unique index actually dedupes (NULL
  refs are distinct).

## Operational scripts

- **`create-review-account.js`:** payment-gateway shop reviews need a working
  login to walk the real purchase flow. Premium requires a complete couple, so
  the script seeds two paired, email-verified accounts plus sample data.
  - It's idempotent (re-running resets the password and re-pairs) and safe
    against production, which is the point.
  - The password is printed only to the operator's terminal. Rotate it after a
    review.
  - Sample data is best-effort, so schema drift can't cost the credentials.
- **Image tooling:**
  - `backfill-script-thumbnails.js` adds `.thumb.webp` for covers uploaded
    before thumbnails existed; idempotent.
  - `generate-roleplay-thumbs.mjs` writes 1280px and 480px WebP copies of the
    1–2MB built-in covers. It uses `fit: 'inside'` and never crops; this fixed
    the 劇本縮圖很慢 complaint.
  - `generate-og-image.mjs` renders the 1200×630 OG image and the 180×180
    apple-touch icon from inline SVG. It needs a Traditional Chinese font
    installed.
- **`perf/measure-pages.mjs`:** times cold open, cached revisit and 上一頁 using
  the app's own `page_ready` instrumentation (the same number prod reports).
  `--mobile` emulates a mid-range phone. It exits 1 above `--budget` (default
  300ms p95). See docs/PERFORMANCE.md.
- **`verify-smtp.js`:** runs an AUTH handshake without sending (optionally
  `--to`). Non-email SMTP logins (Resend's is literally `resend`) are shown
  as-is.
