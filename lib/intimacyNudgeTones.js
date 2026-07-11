// Platform-voiced「溫柔提醒」tone catalog for the 已經幾天沒有親密了 card.
//
// The reminder is authored BY Twogether (the platform) — a caring friend, not a
// monitor, and never the partner's own words. Each tone is a curated,
// brand-approved template; `{days}` is substituted with the real gap. We keep a
// pool of tones and randomly present a few so the reminder stays fresh across
// days, while the recommended tone (鼓勵連結) is always offered as the default.

// The catalog. `recommended: true` marks the default tone shown first. Copy is
// intentionally about re-connecting (not sex) and stays low-pressure.
const TONES = [
  { id: 'warm', label: '溫柔關心', emoji: '💛',
    sample: 'Twogether 注意到，你們已經 {days} 天沒有記錄親密時光了。如果最近生活比較忙，不妨找個舒服的時間，好好陪伴彼此。' },
  { id: 'neutral', label: '中立系統', emoji: '💛',
    sample: '距離上次親密時光已經 {days} 天。每段關係都有自己的步調，如果覺得合適，可以安排一點屬於彼此的時間。' },
  { id: 'encourage', label: '鼓勵連結', emoji: '🫶', recommended: true,
    sample: '已經 {days} 天沒有記錄親密時光。一個擁抱、一場散步，或一段沒有打擾的聊天，都能讓彼此更靠近。' },
  { id: 'playful', label: '輕鬆幽默', emoji: '🔋',
    sample: '親密能量已經 {days} 天沒有補充囉！找個適合的時機，幫你們的關係充充電吧。✨' },
  { id: 'scientific', label: '科學感', emoji: '📊',
    sample: '距離上次親密時光：{days} 天。穩定的親密互動，有助於維持情感連結。' },
  { id: 'romantic', label: '浪漫風', emoji: '❤️',
    sample: '已經 {days} 天沒有記錄親密時光了。今晚，也許是個重新感受彼此溫度的好時機。' },
  { id: 'nopressure', label: '完全無壓力', emoji: '💛',
    sample: '距離上次親密時光已經 {days} 天。不需要急著改變什麼，只希望你們別忘了照顧彼此。' },
  { id: 'beyondsex', label: '不只談性', emoji: '🌿',
    sample: '已經有 {days} 天沒有記錄親密時光了。親密不一定只有性愛，也可以是一個擁抱、一句關心，或一起度過的一段時光。' },
  { id: 'friendly', label: '像朋友提醒', emoji: '😊',
    sample: '最近是不是有點忙？已經 {days} 天沒有記錄親密時光了，不妨找個時間，好好陪陪彼此。' },
  { id: 'achievement', label: '成就感', emoji: '✨',
    sample: '每一次親密互動，都是關係的一次加分。距離上次記錄已經 {days} 天，準備好創造下一個美好時刻了嗎？' },
  { id: 'assistant', label: 'AI 助理風', emoji: '🤍',
    sample: '你們已經 {days} 天沒有記錄親密時光了。如果最近生活忙碌，不妨安排一點只屬於彼此的時間。' },
  { id: 'minimal', label: '極簡版', emoji: '💛',
    sample: '距離上次親密時光：{days} 天。找個時間，重新靠近彼此吧。' },
];

const RECOMMENDED_TONE_ID = 'encourage';
const DEFAULT_COUNT = 3;

const toneById = (id) => TONES.find((t) => t.id === id) || null;

// Fisher–Yates shuffle (returns a new array; does not mutate the input).
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Randomly pick `count` tone ids to present. The recommended tone is always
// included (first), the rest are a random draw from the remaining pool.
function selectToneIds(count = DEFAULT_COUNT) {
  const n = Math.max(1, Math.min(count, TONES.length));
  const rec = toneById(RECOMMENDED_TONE_ID) || TONES[0];
  const others = shuffle(TONES.filter((t) => t.id !== rec.id)).slice(0, n - 1);
  return [rec, ...others].map((t) => t.id);
}

// Substitute the real day count into a tone's template. The card only surfaces
// when the gap is known, so `days` is normally a number; the null branch is a
// defensive fallback.
function renderTone(tone, days) {
  const d = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : null;
  if (d === null) {
    return tone.sample.replace(/\{days\}\s*天/g, '一段時間').replace(/\{days\}/g, '一段時間');
  }
  return tone.sample.replace(/\{days\}/g, String(d));
}

// Build ready-to-send suggestion objects for the given tone ids + day count.
function buildSuggestions(toneIds, days) {
  return toneIds
    .map(toneById)
    .filter(Boolean)
    .map((t) => ({
      id: t.id,
      label: t.label,
      emoji: t.emoji,
      text: renderTone(t, days),
      recommended: !!t.recommended,
    }));
}

module.exports = {
  TONES,
  RECOMMENDED_TONE_ID,
  DEFAULT_COUNT,
  selectToneIds,
  renderTone,
  buildSuggestions,
};
