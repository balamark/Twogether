# 0002. Authentication & sessions

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `middleware/auth.js`, `middleware/adminAuth.js`, `server.js` session config

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
- **The admin dashboard uses HTTP Basic auth** against `ADMIN_PASSWORD`. The
  username is ignored. The comparison is constant-time, so the secret can't be
  found by timing.
