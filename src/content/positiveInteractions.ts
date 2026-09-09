// The single source of truth for what a「正向互動」(positive interaction) is —
// the actions that each add +1 to the couple's 14-day positive-interaction
// count (`positive14` in routes/relationship.js: wall_posts + love_moments +
// resolved events over the last 14 days). Used by:
//   - UsView「我們正在愛」card, to explain what the number means and what grows it
//   - ActivityView「最近動態」, to badge which rows earned a +1
//   - WallView, whose new-post celebration is one of these +1 moments
// Keep this list in sync with the positive14 query in routes/relationship.js.

import type { ActivityType } from '../services/api';

// Activity-feed rows that ARE a +1 positive interaction. The feed shows event
// *creation*（「開始了對話」）, which is not itself positive — only resolving a
// conflict is — so 'event' is intentionally excluded here even though resolved
// events do count toward positive14. love_moment and wall_post map 1:1.
export const POSITIVE_ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  'love_moment',
  'wall_post',
]);

export const isPositiveInteraction = (type: ActivityType): boolean =>
  POSITIVE_ACTIVITY_TYPES.has(type);

// Human-facing list of the things that each add +1, shown wherever we explain
// the number. Mirrors the three sources counted by positive14. `short` is the
// compact form for inline sentences（「留言、記錄美好、化解衝突」）; `label` the
// fuller line for a bulleted list.
export const POSITIVE_INTERACTION_ACTIONS: { emoji: string; short: string; label: string }[] = [
  { emoji: '📝', short: '留言', label: '在牆上留一則言' },
  { emoji: '💗', short: '記錄美好', label: '記錄一段美好時光' },
  { emoji: '🤝', short: '化解衝突', label: '化解一次衝突' },
];
