# 0012. Notification fan-out & email

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/eventNotify.js`, `lib/emailUnsubscribe.js`, `lib/emailPage.js`

## Decisions

- **One fan-out module** (in-app row, LINE push, email), extracted from
  `routes/events.js` so other routers can notify without requiring the events
  router. That would create a require cycle. Every dependency is a leaf module.
- **The in-app row is awaited; email is fire-and-forget.** An SMTP send takes
  1–3s. Awaiting it made every reply and closure button hang (playbook §R7). The
  inbox is still consistent when the response lands.
- **LINE pushes carry the actual message content** plus a deep link
  (`?event=<id>`), so the push alone tells the story. Each notification type has
  an emoji. The three per-type lists (here, the email `meta` map,
  `NotificationInbox.tsx`) are hand-synced today: #169. Closure copy is an
  invitation, never a verdict.
- **One-click unsubscribe (RFC 8058)** is required by Gmail/Yahoo for bulk
  senders; without it, mail lands in spam. The link must work without a login,
  so it carries an HMAC-signed userId (`JWT_SECRET`). It's stateless: no table,
  no expiry, no cleanup. Rotating the secret invalidates old links, and the worst
  case is a sign-in prompt. If signing isn't possible, the header is left out;
  the send never fails.
- **All emailed links land on one minimal self-contained HTML page**
  (`renderEmailPage`), not the SPA. The styling is shared.
