# 0012. Notification fan-out & email

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/eventNotify.js`, `lib/emailUnsubscribe.js`, `lib/emailPage.js`, `services/notificationService.js`, `services/emailService.js`, `services/lineService.js`

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

## Partner-action notifications (`services/notificationService.js`)

- `notifyPartnerAction({ actorId, type, content, targetId })` is meant to be the
  single seam for "let 另一半 know what I did". The consolidation isn't finished:
  #176.
- The in-app row is always attempted. LINE and email are fire-and-forget
  mirrors, gated by each user's opt-in. **Nothing throws to the caller**: a
  notification failure must never fail the user's action. Solo/unpaired users
  are a silent no-op.
- **Copy catalog:** one entry per type, with an emoji, a specific verb phrase and a
  fallback body (never a vague 「有新通知」). Priorities run 1 (blue) to
  3 (red), synced by hand with `NotificationInbox.tsx` (#169). Tone: a no or
  not-now in the 替代方案 negotiation is never framed as something to fix, and
  Deep Dive shares are invitations to read, not reports. Cycle records notify
  like any other action (product decision). `targetId` lets a tap land on the
  exact item.

## Email (`services/emailService.js`)

- **Every message goes through `_send`**, so header sanitizing can't be forgotten.
  Header values have CR/LF stripped: nicknames are only length-validated, so a
  newline could otherwise inject headers into the Subject.
- **From:** `EMAIL_FROM` (a brand-domain address) is preferred, so SPF, DKIM and
  DMARC align with the twogether.fun links in the mail; the SMTP login is the
  fallback. The display name is set per call, so brand and therapist mail stay
  distinguishable. `EMAIL_REPLY_TO` is optional.
- **List-Unsubscribe:** opt-in notifications carry the HTTP one-click form.
  Transactional mail (verification, password reset, receipts, invites to
  non-users) can only offer the mailto form, since there's no subscription to
  cancel.
- **The pairing invite** has to survive a harsh spam filter: an unknown sender
  writing to someone with no account. So it's a short personal note, not a
  product pitch: one link, no feature grid, and Reply-To set to the inviter.
  That is the strongest "a real person sent this" signal, and genuinely
  useful.
- **Copy choices:**
  - Intimacy messages are framed as 「傳了一則訊息」, not a grand 親密邀請.
    A script-based one names the script, quotes its 簡介, and deep-links with
    `?script=`.
  - Script shares are deliberately light on detail, to nudge a login.
  - Event emails follow the UX_PLAYBOOK R2 tone: 分享/情境/對話 rather than
    開啟/事件/回報. Closure copy is an invitation, not a verdict.
  - The platform-voiced 溫柔提醒 is never attributed to the partner.
- **Receipts** lead with 收據編號, the number a buyer quotes for expenses or
  support. 抬頭/統編 appear only when requested.
- **Account safety:** an email-change link goes to the *new* address (clicking it
  swaps `users.email`), and a heads-up goes to the *old* one, so a hijack gets
  noticed.
- **Consultations:** only the first booking emails the therapist and the client.
  Later chat messages are in-app only.
- Partner-action emails share one generic template (title plus detail line)
  rather than a bespoke template per type. SMTP failures log standard fields
  (`code`, …) so `jsonPayload.code="EAUTH"` finds them.

## LINE (`services/lineService.js`)

- The channel access token is minted from `LINE_CHANNEL_ID` +
  `LINE_CHANNEL_SECRET` (client_credentials, 30 days), cached in memory and
  refreshed a day early, so only the secret lives in the environment.
- Pushes carry as much real content as fits (300-char excerpt). Webhooks are
  verified by HMAC-SHA256 of the raw body. Replies use the free replyToken.
- `pushToUserIfLinked` is safe to call anywhere: it no-ops when LINE isn't
  configured or the user isn't linked or opted in. Every path logs `line.*`.
