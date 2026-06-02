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
