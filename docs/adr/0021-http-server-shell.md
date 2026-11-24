# 0021. HTTP server shell: proxy, CSP, routing order, public pages & SEO

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `server.js`, `vite.config.ts`, `tailwind.config.js`

## Proxy, sessions, CORS

- **`trust proxy` is set to exactly 1 hop** in production. GAE adds a single
  X-Forwarded-For frontend; `true` would trust every hop and let any client spoof
  its IP, which breaks the funnel's distinct-IP signal and IP rate limits.
  Revisit this if a CDN is ever put in front of GAE.
- The session cookie `maxAge` equals the JWT TTL (ADR 0002). Production uses the
  Postgres session store (the memory store leaks). CORS (:5174 → :8080) is
  enabled only in development and test.
- **The raw JSON body is captured**, so the LINE webhook can verify
  `X-Line-Signature` against the exact signed bytes.
- `requestContext` runs before `requestLogger`, so every log line is correlated
  (ADR 0005).

## CSP (helmet)

- `style-src` allows fonts.googleapis.com and `font-src` allows fonts.gstatic.com
  (Google Fonts). `img-src` allows `blob:`, for `URL.createObjectURL` upload
  previews.
- `media-src` allows https explicitly. Otherwise `<video>` falls back to
  `default-src 'self'` and Supabase-hosted cover videos are blocked.
- **`form-action` lists both gateways' stage and production hosts.** A missing host
  silently breaks checkout: the browser refuses the form and the button hangs on
  前往付款…. The dev-server CSP in `vite.config.ts` duplicates this list (#169).

## Canonical host & indexing

- GET/HEAD page requests are 301-redirected to the `FRONTEND_URL` host, so Search
  Console stops reporting "Page with redirect" for www/appspot variants and
  indexing consolidates on one origin. `/api` and `/health` are exempt, because
  gateway callbacks and uptime checks must never be bounced.
- On staging (`FRONTEND_URL` is the appspot host) nothing redirects. Instead every
  page gets `X-Robots-Tag: noindex`, and `robots.txt` (generated per environment,
  registered before static files so a stray `dist/robots.txt` can't shadow it)
  blocks crawling. Production's robots.txt points at the sitemap.
- `sitemap.xml` is the static list plus every published Playbook in both
  languages, so new Playbooks get indexed without hand edits.

## Route order

- **The 一起收尾 router mounts before the events router** on the same `/api/events`
  prefix, so `/:id/closure/*` matches before `/:id`.
- Intentionally public, each authenticated some other way:
  - the ECPay/NewebPay callback and return (gateways can't present a JWT);
  - the LINE webhook (signature-verified);
  - `/api/email` unsubscribe (signed token);
  - `/api/track/landing` (anonymous funnel beacon);
  - the marketplace bot (its own API key, mounted outside the JWT-protected
    marketplace router);
  - guest AI (per-guest, per-IP and global caps; text never stored).
- `/api/admin/*` and `/admin` are behind Basic auth. `/api/intimacy` is a second
  mount of the intimacy router, kept for frontend compatibility.

## Public static pages

- `/pricing`, `/support`, `/privacy` and `/therapist-signup` are self-contained
  pages that work without login. They're required by ECPay's shop review
  (products, prices and refund policy visible publicly), App Store review and
  overseas visitors.
- They carry a `{{SUPPORT_EMAIL}}` placeholder filled from
  `lib/supportContact.json` (the one support address, also imported by the
  React app). Each is rendered once and cached.
- Every route also lists its `*.html` path: Vite copies `public/` into `dist/`
  verbatim, so only these routes, registered before the static middleware,
  shadow the raw-placeholder copy.
- Pricing must match `PLANS` (#169). The privacy page must match what the code
  does (CLAUDE.md).

## SPA shell & build

- **Vite builds with `base: './'`** (relative asset paths for static hosting).
  When the server-rendered Playbook shell is served at `/playbooks/<slug>`, the
  bundle links are made root-absolute; otherwise `./assets/…` would resolve
  under `/playbooks/` and come back as HTML. Unknown slugs return 404 with the
  SPA shell, which shows the library with a "not found" note.
- Hashed `/assets/*` are cached immutably for a year, and HTML is `no-cache`.
  Unknown `/api/*` and `/assets/*` paths return JSON 404s instead of the SPA.
- **Release metadata comes from the commit, not the wall clock.** The footer shows
  version, commit time and short hash. Using the build time once took production
  down: App Engine's buildpack re-runs `npm run build` at deploy, and the
  regenerated `index.html` pointed at a bundle hash the CI-uploaded static files
  didn't have (blank page). Builds must be byte-deterministic per commit.
- `/health` reports `dbIsLocal` (a boolean only, never host or credentials), so
  the e2e harness can refuse to register test users against a remote DB.

## Theme (Tailwind)

- **Soft Petal palette** (cream, dusty rose, sage): the stock `pink` / `purple` /
  `rose` scales are *remapped*, so existing `bg-pink-500` markup picked up the
  palette without edits (design-prototypes/01-soft-petal.html). Legacy
  `primary`/font aliases are kept so old references don't break.
  - `vivid.*` holds the punchy conflict-intervention accents (approved 2026-09),
    since `rose` is now muted.
  - `petal.sage-deeper` exists because sage-deep read as disabled on cream; white
    text on it clears WCAG-AA.
- Engineer Mode (a Premium easter egg) is `darkMode: 'class'`, with overrides in
  `src/index.css`, guarded by `npm run check:contrast` (ADR 0023). An `xs: 400px`
  breakpoint lets tab bars show icons only below it, so labels stay on one line.
