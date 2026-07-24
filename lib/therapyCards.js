// Therapy "cards" — the intervention deck for Therapist Mode (引導模式).
//
// A real couples therapist doesn't invent advice each turn; they pick the next
// best *exercise*. This module is the single source of truth for that deck:
// the facilitator LLM chooses one card per turn, the backend records which
// cards a session has practised, and the frontend renders each card's label /
// emoji / colour. Keeping id ↔ display metadata here (and echoing it into each
// turn's payload) means the UI never drifts from the model's card ids.
//
// evaluable=true cards train a scoreable skill: when the partner responds, the
// facilitator grades it (accurate / partial / off) and we roll that into the
// session's 關係技巧分數. Non-evaluable cards (slow down, repair, appreciation)
// are regulation / connection moves with nothing to "grade".

const CARDS = [
  {
    id: 'mirror',
    label: '鏡映',
    emoji: '🪞',
    color: 'sage',
    skill: 'mirror',
    evaluable: true,
    goal: '先重複你聽到的，不加上自己的解讀（「我聽到你說的是…」）。',
  },
  {
    id: 'perspective_switch',
    label: '換位',
    emoji: '🔄',
    color: 'rose',
    skill: 'perspective',
    evaluable: true,
    goal: '站在對方的角度，替對方把想說的說出來（「我想我是在告訴你…」）。',
  },
  {
    id: 'validation',
    label: '肯定',
    emoji: '🫶',
    color: 'rose',
    skill: 'validation',
    evaluable: true,
    goal: '不需要同意，也能肯定對方的感受（「我可以理解你為什麼會覺得…」）。',
  },
  {
    id: 'emotion_label',
    label: '情緒標記',
    emoji: '🎯',
    color: 'amber',
    skill: 'emotion_labeling',
    evaluable: true,
    goal: '為對方此刻的情緒選一個名字，再讓對方確認是否準確。',
  },
  {
    id: 'need_translation',
    label: '需求翻譯',
    emoji: '💬',
    color: 'sage',
    skill: 'need_translation',
    evaluable: true,
    goal: '把「你從來都…」翻譯成「我需要…」。',
  },
  {
    id: 'slow_down',
    label: '慢下來',
    emoji: '🐢',
    color: 'neutral',
    skill: null,
    evaluable: false,
    goal: '先暫停、深呼吸，一次只說一句話。',
  },
  {
    id: 'repair_attempt',
    label: '修復',
    emoji: '🤝',
    color: 'sage',
    skill: 'repair',
    evaluable: false,
    goal: '主動提出一個小小的修復（一句道歉、一個示好、一個玩笑）。',
  },
  {
    id: 'appreciation',
    label: '欣賞',
    emoji: '🌸',
    color: 'rose',
    skill: 'appreciation',
    evaluable: false,
    goal: '說出一件此刻你欣賞、或感謝對方的事。',
  },
];

const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]));
const CARD_IDS = CARDS.map((c) => c.id);

// Verdict → weight for the skill score. A "partial" mirror still shows the
// couple trying, so it counts for half rather than zero.
const VERDICT_WEIGHT = { accurate: 1, partial: 0.5, off: 0 };

function getCard(id) {
  return CARD_BY_ID.get(id) || null;
}

// Public display metadata for one card, embedded into a facilitator turn's
// payload so the frontend can render the chip without its own catalogue.
function cardMeta(id) {
  const c = getCard(id);
  if (!c) return null;
  return { id: c.id, label: c.label, emoji: c.emoji, color: c.color };
}

// The cards the facilitator may choose from next. 慢下來 is reactive (used to
// interrupt escalation, not "practised"), so it's excluded from the deliberate
// rotation; everything else is offered, de-prioritising cards already completed
// this session so a session moves through varied skills instead of repeating.
function pickableCards(completedCards = []) {
  const done = new Set(completedCards || []);
  return CARDS
    .filter((c) => c.id !== 'slow_down')
    .map((c) => ({ id: c.id, label: c.label, goal: c.goal, done: done.has(c.id) }));
}

// Fold one graded response into a session's skill scores (immutably). Only
// evaluable cards with a known skill move the needle.
function applyVerdict(skillScores, cardId, verdict) {
  const next = { ...(skillScores || {}) };
  const card = getCard(cardId);
  if (!card || !card.evaluable || !card.skill) return next;
  const weight = VERDICT_WEIGHT[verdict];
  if (weight === undefined) return next;
  const prev = next[card.skill] || { attempts: 0, score: 0 };
  next[card.skill] = { attempts: prev.attempts + 1, score: prev.score + weight };
  return next;
}

// Overall 關係技巧分數 as a 0–100 integer: weighted-accurate over attempts across
// every practised skill. Returns null when nothing has been graded yet so the
// UI can show "尚未開始" instead of a misleading 0%.
function scoreSession(skillScores) {
  const skills = Object.values(skillScores || {});
  const attempts = skills.reduce((s, v) => s + (v.attempts || 0), 0);
  if (attempts === 0) return null;
  const score = skills.reduce((s, v) => s + (v.score || 0), 0);
  return Math.round((score / attempts) * 100);
}

// Normalize a raw facilitator-turn payload (from the LLM tool call or the mock)
// and attach the card's display metadata so the frontend renders the chip
// straight from the payload. Shared by the claude AND mock providers — the
// shaping contract lives here, next to the deck it validates against.
function shapeFacilitatorTurn(out, meta) {
  const cardId = CARD_IDS.includes(out.card) ? out.card : 'slow_down';
  const target = ['A', 'B', 'both'].includes(out.target) ? out.target : 'both';
  const evaluation = out.evaluation && ['accurate', 'partial', 'off'].includes(out.evaluation.verdict)
    ? { verdict: out.evaluation.verdict, note: (out.evaluation.note || '').toString().trim() }
    : null;
  return {
    say: (out.say || '').toString().trim(),
    card: cardId,
    cardMeta: cardMeta(cardId),
    target,
    instruction: (out.instruction || '').toString().trim(),
    quickReplies: Array.isArray(out.quickReplies)
      ? out.quickReplies.filter((q) => typeof q === 'string' && q.trim()).slice(0, 4).map((q) => q.trim())
      : [],
    evaluation,
    sessionDone: out.sessionDone === true,
    _meta: meta,
  };
}

module.exports = {
  CARDS,
  CARD_IDS,
  VERDICT_WEIGHT,
  getCard,
  cardMeta,
  pickableCards,
  applyVerdict,
  scoreSession,
  shapeFacilitatorTurn,
};
