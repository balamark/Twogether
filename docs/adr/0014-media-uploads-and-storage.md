# 0014. Media pipeline & Supabase Storage

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/media-upload.js`, `lib/supabase-storage.js`

## Pipeline

- multer holds the file in memory. Images go through sharp: progressive JPEG,
  2048px long edge (fits a 4K display), mozjpeg q90, and `.rotate()` so EXIF
  portrait shots aren't stored sideways. Only truly huge originals are
  downscaled. Videos are stored raw, with no re-encode, so `<video>` plays them
  directly.
- **Thumbnails** (`<name>.thumb.webp`, 480px, `fit: 'inside'`, **never cropped**)
  are made from the already-downscaled JPEG, which is far cheaper on a small
  instance. A failed thumbnail never fails the upload, because the client falls
  back to the full image (`thumbSrc`).
- **Size caps:** 10MB per image, 30MB per video. App Engine Standard rejects any
  body over 32MB before our code runs, with a 413 we can't make friendly, so the
  video cap must stay comfortably below that once multipart overhead is added.
  multer's own limit is set to the largest cap. `checkMediaSizes` enforces the
  per-type caps, so each gets a specific message and `error_code`. multer errors
  are wrapped the same way. The frontend copy of the caps is hand-synced: #169.
- Callers pass their own bucket prefixes and `error_code`s, so each surface keeps
  specific messages.

## Supabase Storage

- **Auth header by key format.** Legacy service-role keys are JWTs, sent as
  `Authorization: Bearer` plus `apikey`. The `sb_secret_…` / `sb_publishable_…`
  keys introduced by Supabase's late-2025 rotation are not JWTs and must be sent
  via `apikey` only. The detected format is logged for diagnostics.
- **"Bucket not found" is matched on the response body**, because Supabase has
  returned it as both 400 and 404. A missing bucket self-heals: create it
  (public, idempotent against a concurrent create) and retry once, so a fresh
  environment needs no manual dashboard step. Buckets are public because files
  are served from `/object/public/<bucket>/…`.
- **`cache-control: max-age=31536000`**: object names carry a uuid and timestamp
  and are never overwritten. Supabase's default of 1 hour made every revisit
  re-download photos.
- 4xx responses are inspected (`validateStatus: () => true`) rather than thrown,
  so the body can be logged.
- **Private buckets** (therapist identity documents) are created with
  `public: false`. Their objects are stored as a reference,
  `storage://<bucket>/<name>`, never as a URL. Only `createSignedUrl`
  (5 minutes by default) turns a reference into something a browser can open.
  Supabase returns `signedURL` relative to `/storage/v1`, so it gets prefixed
  unless it's already absolute.
- Outside production the upload is stubbed, which is a shortcut: #171.
