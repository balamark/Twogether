// Sophie 衝突即時介入 — deterministic detection + shaping helpers.
//
// The detector is a heuristic (no LLM) on purpose: it must be instant, free,
// and predictable so a message is never wrongly held or wrongly let through
// because of model variance, and so it can run before we ever spend the daily
// AI budget (the paid LLM is only used later, for the emotional translation).
//
// Design principles baked in here (from the PRD):
//   · Never silence — detection decides WHEN a message is delivered, never IF.
//   · Pause, don't punish — a held message is SAVED, not blocked or rewritten.
//   · Safety first — threats / violence / self-harm skip ordinary mediation.

// Emotion levels: 0 normal · 1 tension · 2 high emotion · 3 escalation.
const LEVEL = { NORMAL: 0, TENSION: 1, HIGH: 2, ESCALATION: 3 };

// Level at (and above) which a message is held for intervention. Env-overridable
// so the threshold can be tuned in prod without a code change.
const HOLD_FROM_LEVEL = Math.min(
  3,
  Math.max(1, Number(process.env.CONFLICT_HOLD_FROM_LEVEL || 2))
);

// --- Signal detectors -------------------------------------------------------
// Each returns true when its pattern is present. Kept as named signals so the
// intervention row records *why* it was held (detected_signals) — useful for
// tuning and for the couple-level conflict history in P2.
const SIGNAL_PATTERNS = {
  // 「你永遠…」「你從來…」「每次都…」— sweeping, global blame.
  global_blame: /你(永遠|從來|老是|總是|每次|每一次|又)|每次都|老是|總是|動不動就/,
  // 「根本」「完全不」「一點都不」— absolute negation of the partner.
  absolute_negation: /根本|完全不|一點(都|也)不|從來不|永遠不會/,
  // Contempt / insults / name-calling — the strongest escalation signal.
  contempt_insult: /閉嘴|給我?閉嘴|滾|白痴|廢物|噁心|可悲|幼稚|神經病|有病|垃圾|去死/,
  // Refusing to listen / "I'm done" — shuts the conversation down.
  refuse_listen: /不想(聽|理|說)|懶得(理|說|講)|你根本不(懂|明白|了解)|受夠|夠了|不想跟你/,
  // Profanity aimed in the exchange.
  profanity: /幹你|他媽|靠北|去你的|媽的/,
  // Blame delivered with a shout — 「你…！」
  exclaim_you: /你[^。！!？?]{0,20}[！!]/,
  // Milder, still-workable frustration — tension, not a blow.
  mild_frustration: /失望|又忘|怎麼又|有點(煩|生氣|不開心|受傷|難過)|不太開心|不太高興|沒有先(問|說)/,
};

// Safety signals are handled entirely separately from the conflict ladder.
// A hit here means we must NOT dress the words up as an ordinary spat.
const SAFETY_PATTERNS = {
  violence_threat: /我要(打|殺|揍|弄死|傷害)你|打死你|殺了你|揍你|讓你(好看|死)/,
  self_harm: /不想活|想自殺|活不下去|結束(自己的)?生命|傷害自己|了結自己/,
  coercive: /你敢|試試看|不准你|你最好給我|否則你就/,
};

function matchSignals(text, patterns) {
  const hits = [];
  for (const [name, re] of Object.entries(patterns)) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

// Classify a message into { level, signals, safety, safetySignals }.
// `level` follows the ladder; `safety` short-circuits ordinary mediation.
function detectEmotion(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return { level: LEVEL.NORMAL, signals: [], safety: false, safetySignals: [] };

  const safetySignals = matchSignals(text, SAFETY_PATTERNS);
  const signals = matchSignals(text, SIGNAL_PATTERNS);

  if (safetySignals.length > 0) {
    return { level: LEVEL.ESCALATION, signals, safety: true, safetySignals };
  }

  const has = (s) => signals.includes(s);
  let level = LEVEL.NORMAL;

  if (has('contempt_insult') || has('profanity') || has('refuse_listen')) {
    level = LEVEL.ESCALATION;
  } else if (has('global_blame') && has('absolute_negation')) {
    level = LEVEL.ESCALATION;
  } else if (has('global_blame') || has('absolute_negation') || has('exclaim_you')) {
    level = LEVEL.HIGH;
  } else if (has('mild_frustration')) {
    level = LEVEL.TENSION;
  }

  return { level, signals, safety: false, safetySignals };
}

function shouldHold(level) {
  return level >= HOLD_FROM_LEVEL;
}

// The single core question Sophie asks (§10). One primary question, simple
// options, and always an escape hatch to say it in your own words.
const CORE_QUESTION = '如果TA現在只能真正理解你一件事，你最希望TA理解什麼？';

const CORE_OPTIONS = [
  { key: 'not_cared', emoji: '❤️', label: '我覺得自己不被在乎', need: '被在乎' },
  { key: 'boundary', emoji: '🧱', label: '我覺得我的界線沒有被尊重', need: '被尊重' },
  { key: 'misunderstood', emoji: '😞', label: '我覺得自己被誤解了', need: '被理解' },
  { key: 'overloaded', emoji: '🥀', label: '我覺得很多事情都落在我身上', need: '被分擔' },
  { key: 'hurt', emoji: '💔', label: '我其實很受傷', need: '被安慰' },
  { key: 'own_words', emoji: '✏️', label: '都不是，我想自己說', need: null },
];

function findCoreOption(key) {
  return CORE_OPTIONS.find((o) => o.key === key) || null;
}

// The Sophie pause copy shown the instant a message is held (§8-9). Never asks
// the user to calm down; affirms the message is saved and unedited.
function pauseCopy(level) {
  const escalated = level >= LEVEL.ESCALATION;
  return {
    heading: '我先暫停一下。',
    body: [
      '我知道你現在真的很生氣。',
      '你的訊息沒有被刪掉，也沒有被改寫，我已經幫你保存下來。',
      escalated
        ? '這一波有點激烈，如果現在立刻讓TA看到，你們可能會直接進入下一輪爭吵。我先陪你一下。'
        : '只是我想先陪你一下，因為如果現在立刻讓TA看到，你們可能會直接進入下一輪爭吵。',
    ],
    // Never "calm down first". We name that the anger is allowed.
    reassurance: '你可以生氣。我不是要你現在不生氣，我只想幫你確定：在這股生氣下面，你最希望TA真正聽見的是什麼。',
    cta: '好，先陪我一下',
  };
}

// Safety response copy (§25) — supportive, and explicitly not mediation.
function safetyCopy() {
  return {
    heading: '我想先停下來，好好確認你現在安全。',
    body: [
      '你剛才說的話裡，有一些讓我有點擔心你或對方的安全。',
      '這件事比一次爭吵更重要，我不會把它當成普通的口角來處理。',
    ],
    resources: [
      { label: '衛福部安心專線', value: '1925（24 小時）' },
      { label: '婦幼保護專線', value: '113' },
      { label: '緊急狀況', value: '110 / 119' },
    ],
    note: '如果你或對方正處於立即危險中，請先撥打 110。你不需要一個人面對。',
  };
}

// One-liner shown beside a Level-1 message that is delivered normally (§7). A
// gentle nudge only — it must never gate or delay delivery.
function gentleNudge() {
  return '這句話裡有一些情緒。要不要讓 Sophie 幫你看看你真正想讓TA知道的是什麼？';
}

function serializeIntervention(row, viewerId) {
  if (!row) return null;
  const isSender = row.sender_id === viewerId;
  return {
    id: row.id,
    couple_id: row.couple_id,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    is_sender: isSender,
    // The recipient only ever sees the words once they are released — before
    // that the original text stays with the sender alone.
    original_text:
      isSender || ['RELEASED', 'DELIVERED'].includes(row.message_status)
        ? row.original_text
        : null,
    emotion_level: row.emotion_level,
    detected_signals: row.detected_signals || [],
    message_status: row.message_status,
    state: row.state,
    user_emotion: row.user_emotion || null,
    underlying_need: row.underlying_need || null,
    emotional_translation: row.emotional_translation || null,
    translation_confirmed: row.translation_confirmed === true,
    safety_flag: row.safety_flag === true,
    partner_understood: row.partner_understood === null || row.partner_understood === undefined
      ? null
      : row.partner_understood === true,
    partner_understood_at: row.partner_understood_at || null,
    released_at: row.released_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  LEVEL,
  HOLD_FROM_LEVEL,
  CORE_QUESTION,
  CORE_OPTIONS,
  detectEmotion,
  shouldHold,
  findCoreOption,
  pauseCopy,
  safetyCopy,
  gentleNudge,
  serializeIntervention,
};
