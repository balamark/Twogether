// Deterministic Mock provider for the icebreaker generator.
// Given the same rawText it returns identical output — no randomness,
// no timestamps. Real provider (e.g. Claude) can replace this later.

const EMOTION_LEXICON = [
  { keys: ['生氣', '氣死', '火大', '討厭'], label: '憤怒' },
  { keys: ['難過', '傷心', '哭', '心痛'], label: '失落' },
  { keys: ['委屈', '不公平', '不公'], label: '委屈' },
  { keys: ['失望', '無力'], label: '失望' },
  { keys: ['焦慮', '緊張', '擔心'], label: '焦慮' },
  { keys: ['孤單', '一個人', '寂寞'], label: '孤單' },
  { keys: ['累', '疲憊', '撐不住'], label: '疲憊' },
  { keys: ['受傷', '被傷害'], label: '受傷' },
];

const TAG_LEXICON = [
  { keys: ['碗', '洗衣', '掃', '家事', '垃圾', '整理'], label: '家務' },
  { keys: ['遲到', '約', '時間', '行程'], label: '行程' },
  { keys: ['錢', '花費', '預算', '帳單', '消費'], label: '金錢' },
  { keys: ['小孩', '孩子', '兒子', '女兒', '育兒'], label: '育兒' },
  { keys: ['口氣', '態度', '語氣', '兇'], label: '語氣' },
  { keys: ['婆婆', '公公', '岳父', '岳母', '家人'], label: '家人' },
];

const TOXICITY_PATTERNS = [
  { pattern: /你總是|你從來|你每次|你永遠/, flag: 'absolute_language' },
  { pattern: /笨|蠢|廢物|沒用|垃圾(?!桶)/, flag: 'name_calling' },
  { pattern: /閉嘴|滾|去死/, flag: 'verbal_aggression' },
];

function pickEmotions(text) {
  const found = [];
  for (const entry of EMOTION_LEXICON) {
    if (entry.keys.some((k) => text.includes(k)) && !found.includes(entry.label)) {
      found.push(entry.label);
    }
    if (found.length >= 3) break;
  }
  if (found.length === 0) found.push('複雜情緒');
  return found;
}

function pickTags(text) {
  const found = [];
  for (const entry of TAG_LEXICON) {
    if (entry.keys.some((k) => text.includes(k)) && !found.includes(entry.label)) {
      found.push(entry.label);
    }
    if (found.length >= 2) break;
  }
  if (found.length === 0) found.push('誤會');
  return found;
}

function detectToxicity(text) {
  const flags = [];
  for (const { pattern, flag } of TOXICITY_PATTERNS) {
    if (pattern.test(text) && !flags.includes(flag)) flags.push(flag);
  }
  return flags;
}

function maskToxicWords(text) {
  let masked = text;
  for (const { pattern } of TOXICITY_PATTERNS) {
    masked = masked.replace(new RegExp(pattern.source, 'g'), '***');
  }
  return masked;
}

function deriveTitle(text) {
  const trimmed = text.trim();
  const sentenceMatch = trimmed.match(/^[^。！？!?\n]{2,30}[。！？!?]/);
  if (sentenceMatch) return sentenceMatch[0].replace(/[。！？!?]$/, '');
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 14)}…`;
}

function deriveSummary(text) {
  const masked = maskToxicWords(text.trim());
  if (masked.length <= 200) return masked;
  return `${masked.slice(0, 200)}…`;
}

function buildVersions({ summary, emotions, tags }) {
  const topEmotion = emotions[0] || '一些情緒';
  const topic = tags[0] && tags[0] !== '誤會' ? `${tags[0]}相關的事` : '剛剛發生的事';

  // Deliberately does NOT embed the summary: the summary is the factual record
  // shown at the top of the event; neutral is a feelings-forward opener message
  // in the user's own first-person voice (never narrator).
  const neutral = `關於${topic}，剛剛發生了一些狀況，我現在心裡有「${topEmotion}」的感覺，想先把這份心情放在這裡讓你知道。`;

  const firm = `我感受到${topEmotion}，主要是因為${topic}。${summary} 我先把這件事提出來放著。`;

  const warm = `${firm} 等彼此比較平靜後，我願意找時間再聊聊，也想聽聽你的想法。`;

  return { neutral, firm, warm };
}

// Second param (gender context) accepted for signature parity with the Claude
// provider; the mock stays deterministic and ignores it.
async function generateIcebreaker(rawText /* , { userGender, partnerGender } */) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('rawText is required');
  }

  const startedAt = Date.now();
  const title = deriveTitle(rawText);
  const summary = deriveSummary(rawText);
  const emotions = pickEmotions(rawText);
  const tags = pickTags(rawText);
  const toxicityFlags = detectToxicity(rawText);
  const versions = buildVersions({ summary, emotions, tags });

  return {
    title,
    summary,
    emotions,
    tags,
    toxicityFlags,
    versions,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    },
  };
}

function buildReplyVersions(rawReply) {
  const masked = maskToxicWords(rawReply.trim());
  const neutral = `就剛剛的事，我這邊看到的是：${masked} 想先把這個放出來。`;
  const firm = `我這邊的感受是：${masked} 我不是要指責，只是想讓你知道我的想法。`;
  const warm = `${firm} 也想聽你的角度，等彼此都比較平靜時我們再聊。`;
  return { neutral, firm, warm };
}

async function rewriteReply({ rawReply /* , eventSummary, recentMessages, createdBySelf */ }) {
  if (typeof rawReply !== 'string' || rawReply.trim().length === 0) {
    throw new Error('rawReply is required');
  }
  const startedAt = Date.now();
  const toxicityFlags = detectToxicity(rawReply);
  const versions = buildReplyVersions(rawReply);
  return {
    versions,
    toxicityFlags,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] rawReply=${rawReply.trim()}`,
    },
  };
}

const ROLEPLAY_LEVELS = [
  { key: 'normal', label: '普通暗示' },
  { key: 'mild', label: '輕微性暗示' },
  { key: 'moderate', label: '中等性暗示' },
  { key: 'explicit', label: '露骨性暗示' },
  { key: 'intense', label: '最強烈' },
];

async function generateRoleplayMessages({ title, scenario, senderGender /* , scriptBody, category */ }) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('title is required');
  }
  const startedAt = Date.now();
  const t = title.trim();
  const genderTag = senderGender === 'male' ? '（男性視角）' : senderGender === 'female' ? '（女性視角）' : '';
  const summary = `${t}${genderTag}：${(scenario || '一段專屬你們的角色扮演').toString().trim()}。一起入戲，今晚就從這裡開始。`;
  const lines = [
    `今晚想和你玩《${t}》，先當作我們剛在場景裡相遇，好嗎？`,
    `想到等下要和你演《${t}》，我心跳有點快…你準備好入戲了嗎？`,
    `《${t}》的氣氛我已經想像好了，今晚我想離你近一點，再近一點。`,
    `我已經忍不住了，今晚就照《${t}》來，我想要你，現在就開始。`,
    `別等了，今晚的《${t}》，我要你完全屬於我，一刻都不放過。`,
  ];
  const messages = ROLEPLAY_LEVELS.map(({ key, label }, i) => ({ level: key, label, text: lines[i] }));
  return {
    summary,
    messages,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    },
  };
}

// Deterministic counselor comment for a wall thread. Detects toxic phrasing in
// the most recent reply (or the post) and, when found, appends a softer
// rephrase suggestion. No randomness or timestamps — same input, same output.
// `companion` (persona) is accepted for signature parity with the Claude
// provider; the mock stays deterministic and persona-agnostic on purpose so
// e2e content assertions don't depend on the picked companion.
async function generateWallCounselorComment({ postContent, postAuthorName, replies /* , moodTag, companion */ }) {
  if (typeof postContent !== 'string' || postContent.trim().length === 0) {
    throw new Error('postContent is required');
  }
  const startedAt = Date.now();

  const author = (postAuthorName || '對方').toString().trim() || '對方';
  const list = Array.isArray(replies) ? replies.filter((r) => !r.isAi) : [];
  const last = list.length > 0 ? list[list.length - 1] : null;
  const lastName = last ? ((last.authorName || '另一位').toString().trim() || '另一位') : null;
  const focus = last ? (last.content || '') : postContent;
  const toxicityFlags = detectToxicity(focus);

  let comment;
  if (toxicityFlags.length > 0 && lastName) {
    comment =
      `我感覺到 ${author} 想被理解，也聽見 ${lastName} 的在意。` +
      `「${maskToxicWords((last.content || '').trim()).slice(0, 30)}」這樣的說法，可能讓對方覺得被責怪。` +
      `也許可以這樣說：「我希望我們一起想辦法面對這件事」，會更靠近彼此。`;
  } else if (lastName) {
    comment =
      `謝謝 ${author} 和 ${lastName} 都願意把話說出來。` +
      `你們其實都在乎彼此，試著先聽懂對方的感受，再說出自己的需要，會更靠近一些。`;
  } else {
    comment =
      `謝謝 ${author} 願意把心情寫下來。` +
      `等對方回應時，試著先說出自己的感受與需要，會更容易被聽懂。`;
  }

  return {
    comment,
    toxicityFlags,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] post=${postContent.trim()} replies=${list.length}`,
    },
  };
}

// Deterministic reconciliation openers. Same intensity (+ optional event) →
// same three openers. No randomness or timestamps. Real provider can replace.
const RECONCILIATION_OPENERS = {
  goodwill: [
    { label: '輕鬆問候', text: '欸，今天吃飯了嗎？想到就問一下。' },
    { label: '小小關心', text: '剛剛看到一個你會喜歡的東西，先傳給你看看 🙂' },
    { label: '釋出善意', text: '今天天氣不錯，突然有點想你。' },
  ],
  reflect: [
    { label: '各退一步', text: '我想了想，這件事我也有需要調整的地方，不想一直這樣僵著。' },
    { label: '一起面對', text: '我們是不是都有點累了？我也有我可以做得更好的部分。' },
    { label: '放下對錯', text: '比起爭誰對誰錯，我更在乎我們之間。我也願意退一步。' },
  ],
  talk: [
    { label: '想好好談', text: '我真的很在乎你，想找個時間好好聊聊，可以嗎？' },
    { label: '主動邀約', text: '剛剛的事我也有不對的地方，等你方便的時候，我們談談好嗎？' },
    { label: '帶點歉意', text: '對不起讓你不開心了，我想和你把話講開，不想就這樣放著。' },
  ],
};

async function generateReconciliationOpeners({ intensity /* , eventContext */ }) {
  const openers = RECONCILIATION_OPENERS[intensity];
  if (!openers) {
    throw new Error(`unknown reconciliation intensity: ${intensity}`);
  }
  const startedAt = Date.now();
  return {
    openers: openers.map((o) => ({ ...o })),
    toxicityFlags: [],
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    },
  };
}

// Deterministic emotion-acceptance coaching for the receiver. Detects the
// partner's dominant emotion from the latest [對方] message (or the event
// summary) and returns a short empathy note + three validating responses. Same
// input → same output. Real provider replaces this.
async function generateEmotionAcceptance({ eventSummary, recentMessages /* , createdBySelf */ }) {
  const startedAt = Date.now();
  const partnerLast = Array.isArray(recentMessages)
    ? [...recentMessages].reverse().find((m) => !m.fromSelf)
    : null;
  const focusText = (partnerLast?.content || eventSummary || '').toString();
  const emotion = pickEmotions(focusText)[0] || '複雜情緒';

  const empathy = `對方現在可能正感受到「${emotion}」。先讓對方覺得這份情緒被你看見、被接住，比急著解釋或解決更重要。`;
  const acceptances = [
    { label: '單純承接', text: `我聽到了，你現在覺得很${emotion}，這很重要，我有放在心上。` },
    { label: '溫柔安撫', text: '你先別急，我在這裡。你的感受我想好好接住，不急著講道理。' },
    { label: '表達同在', text: '謝謝你願意告訴我。不管怎樣我都和你站在一起，我們慢慢來。' },
  ];

  return {
    empathy,
    acceptances,
    toxicityFlags: [],
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] focus=${focusText.trim().slice(0, 80)}`,
    },
  };
}

// Deterministic marriage check-up summary. Finds the dimension with the biggest
// score gap (the most worth talking about) and builds a neutral summary + three
// talking points. Same input → same output.
async function generateCheckupSummary({ dimensions, responseA, responseB }) {
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error('dimensions is required');
  }
  const startedAt = Date.now();
  const nameA = (responseA?.name || '一方').toString();
  const nameB = (responseB?.name || '另一方').toString();
  const scoresA = (responseA?.answers && responseA.answers.scores) || {};
  const scoresB = (responseB?.answers && responseB.answers.scores) || {};

  let gapDim = dimensions[0];
  let maxGap = -1;
  let bestDim = dimensions[0];
  let bestSum = -1;
  for (const d of dimensions) {
    const a = Number(scoresA[d.id]) || 0;
    const b = Number(scoresB[d.id]) || 0;
    const gap = Math.abs(a - b);
    if (gap > maxGap) {
      maxGap = gap;
      gapDim = d;
    }
    if (a + b > bestSum) {
      bestSum = a + b;
      bestDim = d;
    }
  }

  const summary =
    `謝謝 ${nameA} 和 ${nameB} 都願意誠實面對這段關係。看得出來你們在「${bestDim.label}」上都有不錯的感受，這是你們的基礎；` +
    `而在「${gapDim.label}」上，兩個人的感受比較不一樣，這通常就是最值得好好聊聊的地方。先彼此理解，再一起想辦法。`;
  const points = [
    `聊聊「${gapDim.label}」：各自說說看，這部分對你來說理想的樣子是什麼？`,
    `把各自寫的「想感謝對方」唸給彼此聽，讓對方知道他的付出被看見了。`,
    `從「最想一起改善」裡挑一件，約定這段時間先一起試試看怎麼調整。`,
  ];

  return {
    summary,
    points,
    toxicityFlags: [],
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] checkup gapDim=${gapDim.id} bestDim=${bestDim.id}`,
    },
  };
}

// Deterministic stand-in for Claude's script role parsing: detect speaker
// names (「名字：對白」 lines), assign the first speaker male and the second
// female, everyone else unknown. Predictable for e2e tests.
async function parseScriptRoles({ content }) {
  const startedAt = Date.now();
  const speakers = [];
  for (const rawLine of String(content || '').split('\n')) {
    const m = rawLine.trim().match(/^([^：:()（）[\]【】\s]{1,12})\s*[：:]/);
    if (m && !speakers.includes(m[1])) speakers.push(m[1]);
  }
  const roles = speakers.map((name, i) => ({
    name,
    gender: i === 0 ? 'male' : i === 1 ? 'female' : 'unknown',
  }));

  return {
    roles,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] parse roles speakers=${speakers.join(',')}`,
    },
  };
}

// Deterministic story insights: fixed templates parameterized by title so e2e
// assertions are stable; toxicity flags reuse the shared lexical detector.
async function generateStoryInsights({ title, sections }) {
  const s = sections || {};
  const allText = [s.context, s.happened, s.impact, s.tried, s.repair, s.now]
    .map((t) => (t || '').toString())
    .join('\n');
  const toxicityFlags = detectToxicity(allText);
  const t = (title || '你們的故事').toString().trim();

  return {
    insights: [
      {
        title: '先接住情緒再談事情',
        body: `在「${t}」裡，先讓彼此的感受被看見，是修復能開始的關鍵。遇到類似狀況的伴侶，可以先說出對方的感受，再討論怎麼辦。`,
      },
      {
        title: '把指責換成具體的事',
        body: '故事中有效的一步，是把「你都不在乎」換成具體發生的事與自己的感受。這讓對方比較能聽進去，也比較知道能改什麼。',
      },
      {
        title: '小的修復動作也算數',
        body: '轉捩點往往不是大和解，而是一個先伸出的小動作。願意先遞出一句話或一杯水，常常就是關係回暖的開始。',
      },
    ],
    toxicityFlags,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    },
  };
}

// Deterministic freeform structuring: split the raw text into 6 roughly-equal
// slices, one per section, so the review step always has editable content.
async function structureStory({ rawText }) {
  const text = (rawText || '').toString().trim();
  const keys = ['context', 'happened', 'impact', 'tried', 'repair', 'now'];
  const sections = {};
  if (text.length === 0) {
    keys.forEach((k) => { sections[k] = ''; });
  } else {
    const size = Math.ceil(text.length / keys.length);
    keys.forEach((k, i) => {
      const slice = text.slice(i * size, (i + 1) * size).trim();
      // Guarantee non-empty sections even for short input.
      sections[k] = slice.length > 0 ? slice : text.slice(0, Math.min(text.length, 12));
    });
  }
  return {
    sections,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    },
  };
}

// Deterministic intimacy reminder nudges. Same day count → same three gentle,
// neutral one-liners. No randomness or timestamps. Real provider can replace.
async function generateIntimacyNudges({ days }) {
  const dayCount = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : null;
  const d = dayCount === null ? '有一陣子' : `${dayCount} 天`;
  const startedAt = Date.now();
  const nudges = [
    { label: '輕鬆邀約', text: `${d}沒親密囉～找個時間靠近一下吧 🙂` },
    { label: '溫柔關心', text: `突然發現我們${d}沒好好抱抱了，好想你 💗` },
    { label: '俏皮撒嬌', text: `喂～已經${d}了耶，今晚要不要來點我們的時間？😌` },
  ];
  return {
    nudges,
    toxicityFlags: [],
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
    },
  };
}

module.exports = {
  generateIcebreaker,
  rewriteReply,
  generateRoleplayMessages,
  generateWallCounselorComment,
  generateReconciliationOpeners,
  generateEmotionAcceptance,
  generateCheckupSummary,
  generateStoryInsights,
  structureStory,
  parseScriptRoles,
  generateIntimacyNudges,
};
