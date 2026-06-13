# Project conventions

Notes for anyone (human or AI) working in this repo. Keep this file short and
current.

## Image handling

**Never crop images.** Always show the full image.

- Use `object-contain` (not `object-cover`) on `<img>` elements and avoid
  fixed crops / background-image `cover`.
- It's fine to place a contained image inside a fixed-size slot (e.g.
  `aspect-video`); give the slot a neutral background (we use
  `bg-petal-cream-2`) so it shows behind images whose aspect ratio differs
  from the slot. The image is letterboxed/pillarboxed, never cut off.
- The shared `renderThumb` helper in `src/components/RoleplayView.tsx`
  defaults to `'contain'` for this reason — keep it that way.

## User-facing messages & logging (every new feature)

When you add or change a feature, update its messaging and logging in the same
change — don't ship the happy path alone.

- **Never show a vague, non-actionable message.** Every error the user can hit
  must say what happened AND what they can do next. Bad: "無法建立劇本".
  Good: "免費方案最多建立 3 個自訂劇本，升級 Premium 即可無限建立".
- **New limits/gates need their own message.** If you introduce a quota, paywall,
  permission, or validation rule, add a specific message + `error_code` for it
  and make the frontend surface that exact reason (don't let it collapse into a
  generic fallback). This was the bug behind the freemium quota: the cap was
  enforced but the user only saw a generic failure.
- **Preserve `error_code` end-to-end.** The axios response interceptor
  (`src/services/api.ts`) unwraps the body onto `error.message` / `error.data` /
  `error.error_code`; any error-normalizing helper must keep `error_code` (and
  the specific message) so the UI can branch on it.
- **Distinguish expected states from failures.** A reached quota / paywall is a
  `warning`/`info` with a next step, not a red `error` toast.
- **Add logging for the new path.** Log attempts and outcomes server-side via
  `lib/logger` (structured `logInfo`/`logWarn`/`logError`) so Cloud Logging shows
  the feature being used, not just when it errors.
