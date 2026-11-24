# 0002. Authentication & sessions

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `middleware/auth.js`, `middleware/adminAuth.js`, `middleware/botAuth.js`, `server.js` session config

## Decisions

- **JWT lifetime comes from `JWT_EXPIRES_IN`** (`"7d"`, `"24h"`, `"30m"`; s/m/h/d
  units). The default stays at 7d, the original hard-coded value. If the value
  can't be parsed, the parser returns `null` and the caller falls back to the
  default. The session cookie `maxAge` in `server.js` is derived from the same
  value, so the two must stay in step. `generateToken` returns
  `{ token, expiresAt }` so the client can schedule a proactive logout.
- **The authenticated user row is cached for 60s** (at most 5000 entries).
  Every API call runs `authenticateToken`; without the cache, each tap paid an
  extra DB round trip before the route even started. Routes that change a
  cached field (nickname/email) or delete a user call `invalidateUserCache`,
  so the change shows up immediately. A cache hit returns a **copy**, so a
  route that mutates `req.user` can't poison the cache. The cache is off under
  `NODE_ENV=test` (tracked as a shortcut in #171).
- **A password change revokes every older token** (migration 118). A token
  whose `iat` is before `password_changed_at` gets a 401 `TOKEN_REVOKED`, so a
  reset signs out every other device. The comparison uses whole seconds because
  `iat` is in seconds: the login right after a reset, in the same second, still
  works. `passwordChangedAt` is loaded next to the user but kept out of
  `req.user`, so it never ends up in a response.
- **The marketplace bot uses a Bearer API key** (`MARKETPLACE_BOT_API_KEY`,
  `POST /api/bot/marketplace/scripts`). The key lives only in the server
  environment, never in the browser bundle. Both values are hashed to a
  fixed-length digest before a constant-time compare, so a length mismatch
  can't skip the compare or throw.
- **The admin dashboard uses HTTP Basic auth** against `ADMIN_PASSWORD`. The
  username is ignored. The comparison is constant-time, so the secret can't be
  found by timing.
