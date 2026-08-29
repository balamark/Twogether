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

// Deterministic emotion/need translation for a thread. For each requested
// message, picks a surface emotion from the lexicon, maps it to an underlying
// need, and rewrites the line as a gentle first-person I-message. Same input →
// same output; no randomness. Real provider (Claude) replaces this.
const NEED_LEXICON = [
  { keys: ['家庭', '第一', '重要', '在乎'], need: '被重視', rewrite: '我最近很沒有安全感，希望我們的家能被放在更重要的位置。' },
  { keys: ['工作', '忙', '加班', '賺'], need: '被看見', rewrite: '我希望你能看見，我這麼努力，其實也是在照顧這個家。' },
  { keys: ['隊', '這邊', '站'], need: '被支持', rewrite: '我希望在這件事上，你能站到我這邊，當我的隊友。' },
  { keys: ['陪', '一個人', '孤單', '回家'], need: '被陪伴', rewrite: '我最近很想你，也有點孤單，很需要你的陪伴。' },
  { keys: ['碎念', '唸', '煩'], need: '喘口氣', rewrite: '我現在有點 overwhelmed，想先休息一下再談。' },
  { keys: ['信任', '懷疑', '相信'], need: '被信任', rewrite: '我很在乎我們，也希望能感覺到你對我的信任。' },
];

function pickNeed(text) {
  for (const entry of NEED_LEXICON) {
    if (entry.keys.some((k) => text.includes(k))) return entry;
  }
  return { need: '被理解', rewrite: '我其實只是想被你理解，希望我們能好好聽彼此說話。' };
}

async function generateThreadTranslations({ messages, targetIds }) {
  const startedAt = Date.now();
  const all = Array.isArray(messages) ? messages : [];
  const wanted = Array.isArray(targetIds) && targetIds.length > 0
    ? new Set(targetIds)
    : new Set(all.map((m) => m.id));

  const translations = all
    .filter((m) => wanted.has(m.id))
    .map((m) => {
      const text = (m.content || '').toString();
      const surface = pickEmotions(text)[0] || '複雜情緒';
      const { need, rewrite } = pickNeed(text);
      return {
        id: m.id,
        emotions: [
          { label: surface, intensity: 60 },
          { label: '不安', intensity: 45 },
        ],
        need,
        rewrite,
      };
    });

  return {
    translations,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      // Same shape as the Claude provider so routes can read these uniformly.
      chunks: 1,
      truncatedChunks: 0,
      truncated: false,
      requested: wanted.size,
      returned: translations.length,
      assembledPrompt: `[mock] translate ${translations.length} of ${all.length} messages`,
    },
  };
}

// Deterministic post-conflict therapy note. Picks the first two distinct human
// speakers, maps each to a need via the lexicon, and builds a fixed-shape cycle
// + repair + next-time line. Same input → same output. Real provider replaces.
async function generateTherapyNote({ eventSummary, messages }) {
  const startedAt = Date.now();
  const humans = (Array.isArray(messages) ? messages : []).filter((m) => !m.isAi);
  const names = [];
  for (const m of humans) {
    const who = (m.speaker || '').toString().trim();
    if (who && !names.includes(who)) names.push(who);
    if (names.length >= 2) break;
  }
  const a = names[0] || '一方';
  const b = names[1] || '另一方';
  const needA = pickNeed((humans[0]?.content || '').toString()).need;
  const needB = pickNeed((humans.find((m) => (m.speaker || '') === b)?.content || '').toString()).need;

  return {
    trigger: (eventSummary || '這次的分歧').toString().trim().slice(0, 40),
    needs: [
      { who: a, need: needA },
      { who: b, need: needB },
    ],
    cycle: [`${a} 追問`, `${b} 退縮`, `${a} 更急`, `${b} 更沉默`],
    repairs: [
      { who: b, text: '願意承認自己忽略了對方的訊息。' },
      { who: a, text: '願意說出真正擔心的是失去連結。' },
    ],
    nextTime: '我現在不是生氣，我只是有點害怕。',
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] therapy note for ${humans.length} human messages`,
    },
  };
}

// Deterministic per-message emotion meter for a composer draft. Reuses the
// emotion + need + toxicity lexicons. Same input → same output.
const EMOTION_EMOJI = {
  憤怒: '😠', 失落: '😢', 委屈: '🥺', 失望: '😔', 焦慮: '😰', 孤單: '😞',
  疲憊: '😮‍💨', 受傷: '💔', 複雜情緒: '💭',
};

async function analyzeDraft({ draft }) {
  if (typeof draft !== 'string' || draft.trim().length === 0) {
    throw new Error('draft is required');
  }
  const startedAt = Date.now();
  const text = draft.trim();
  const surface = pickEmotions(text);
  const toxicityFlags = detectToxicity(text);
  const { need, rewrite } = pickNeed(text);

  const emotions = surface.slice(0, 2).map((label, i) => ({
    label,
    emoji: EMOTION_EMOJI[label] || '💭',
    intensity: i === 0 ? 70 : 45,
  }));
  emotions.push({ label: '不安', emoji: '😰', intensity: 60 });

  return {
    emotions: emotions.slice(0, 3),
    partnerHears: {
      misread: '你在怪我、你覺得我很糟。',
      real: '你是不是快要撐不下去、需要我？',
    },
    need,
    rewrite,
    toxicityFlags,
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] analyze draft: ${text.slice(0, 60)}`,
    },
  };
}

// Deterministic Therapist Mode facilitator turn. Cycles through a fixed
// exercise sequence by stepCount so a full session can be driven in tests
// without the paid LLM. Same input → same output. Normalization goes through
// the shared shapeFacilitatorTurn so mock and claude obey one contract.
const { getCard: mockGetCard, shapeFacilitatorTurn } = require('../../lib/therapyCards');

const MOCK_FACILITATION_SEQUENCE = [
  { card: 'slow_down', target: 'both', instruction: '先一起深呼吸三次。準備好了，我們就開始。' },
  { card: 'emotion_label', target: 'A', instruction: '選一個你覺得對方此刻的情緒。', quickReplies: ['😔 受傷', '😟 擔心', '😡 生氣', '😞 孤單'] },
  { card: 'mirror', target: 'B', instruction: '先不要解釋，只重複你聽到的：「我聽到你說的是…」' },
  { card: 'validation', target: 'A', instruction: '不需要同意，也試著說：「我可以理解你為什麼會覺得…」' },
  { card: 'perspective_switch', target: 'B', instruction: '站在對方的角度，完成：「我想我是在告訴你…」' },
  { card: 'need_translation', target: 'A', instruction: '把剛剛的話翻成「我需要…」。' },
];

async function generateFacilitatorTurn({ session } = {}) {
  const startedAt = Date.now();
  const s = session || {};
  const step = Math.max(0, Number(s.stepCount) || 0);
  const idx = Math.min(step, MOCK_FACILITATION_SEQUENCE.length - 1);
  const pick = MOCK_FACILITATION_SEQUENCE[idx];
  const done = step >= MOCK_FACILITATION_SEQUENCE.length - 1;

  // Grade the previous response if the active card was evaluable.
  const prevCard = mockGetCard(s.activeCard);
  const evaluation = prevCard && prevCard.evaluable && s.turnOwnerRole
    ? { verdict: 'accurate', note: '你做到了，這就是重點。' }
    : null;

  return shapeFacilitatorTurn(
    {
      say: done
        ? '我看見你們願意試著聽見彼此，這已經是很重要的一步。今天先到這裡，好好抱一下。'
        : '我們一次只做一小步。慢慢來，我在這裡陪你們。',
      card: pick.card,
      target: pick.target,
      instruction: pick.instruction,
      quickReplies: pick.quickReplies || [],
      evaluation,
      sessionDone: done,
    },
    {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] facilitator step ${step} → ${pick.card}`,
    }
  );
}

// Deterministic 諮商摘要 (between-sessions therapy summary). Derives themes /
// emotions from the precomputed stats and splits events by status, so tests can
// drive the endpoint without the paid LLM. Same input → same output.
async function generateTherapySummary({ periodLabel, events, stats }) {
  const startedAt = Date.now();
  const evs = Array.isArray(events) ? events : [];
  const themes = (stats?.themeCounts || []).map((t) => t.tag).filter(Boolean).slice(0, 4);
  const emotions = (stats?.emotionCounts || []).map((e) => e.emotion).filter(Boolean).slice(0, 4);
  const repaired = evs
    .filter((e) => e.status === 'resolved')
    .map((e) => ({ title: (e.title || '未命名').toString().trim(), insight: '你們願意把話說開，讓彼此靠近了一點。' }))
    .slice(0, 6);
  const unresolved = evs
    .filter((e) => e.status !== 'resolved')
    .map((e) => ({ title: (e.title || '未命名').toString().trim(), note: '這件事還沒劃下句點，可以帶去諮商裡一起看。' }))
    .slice(0, 6);

  return {
    overview: `${periodLabel || '最近兩週'}你們記錄了 ${evs.length} 件事，最常圍繞在${themes[0] || '相處'}上。`,
    themes,
    emotions,
    repaired,
    unresolved,
    questions: [
      '我們每次談到同一個主題就會升溫，可以怎麼開始這個對話？',
      '當一方想靠近、另一方想先冷靜，我們可以怎麼配合彼此的節奏？',
      '這段期間還沒解決的事，哪一件最值得我們先一起處理？',
    ],
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] therapy summary for ${evs.length} events`,
    },
  };
}

// Deterministic 話題建議 (Therapy Topics). Builds up to 3 topics from the top
// recurring themes when not quiet; tops up with general relationship-
// maintenance topics (and the product's own reassurance line) when quiet or
// when themes run out, so the couple always gets 3-5 topics — same input →
// same output, no live LLM needed.
const GENERAL_MAINTENANCE_TOPICS = [
  {
    title: '我們有沒有花時間只做兩個人的事？',
    whySuggested: '最近的紀錄比較少看到只屬於你們兩人的時光。',
    prompts: ['我們上一次單獨約會是什麼時候？', '最近聊天，多半在聊孩子/工作，還是彼此？'],
  },
  {
    title: '我們有沒有在照顧彼此？',
    whySuggested: '忙碌時很容易只顧著把事情做完，忘了問問對方過得好不好。',
    prompts: ['最近有沒有哪件事，希望對方能多注意到？', '我們怎麼讓彼此感覺被照顧？'],
  },
  {
    title: '我們對未來有沒有共同的小計畫？',
    whySuggested: '一起期待一件小事，是維繫關係很實在的方式。',
    prompts: ['最近有沒有什麼想一起做的事？', '我們多久會聊一次「以後」？'],
  },
];

async function generateTherapyTopics({ events, stats, quiet }) {
  const startedAt = Date.now();
  const evs = Array.isArray(events) ? events : [];
  const themeTopics = (stats?.themeCounts || [])
    .filter((t) => t.tag)
    .slice(0, 3)
    .map((t) => ({
      title: `${t.tag}的期待落差`,
      whySuggested: `最近「${t.tag}」出現了 ${t.count} 次，這通常代表期待落差，很適合找時間聊聊。`,
      prompts: [`我們對${t.tag}，各自心裡的期待是什麼？`, `最近在${t.tag}上，有沒有哪個瞬間讓你不太舒服？`],
    }));

  const topics = [...themeTopics];
  for (const t of GENERAL_MAINTENANCE_TOPICS) {
    if (topics.length >= 5) break;
    if (topics.length < 3 || quiet) topics.push(t);
  }

  const intro = quiet
    ? '最近很平靜，這是好事——但平靜不代表沒有話題可聊。'
    : `${evs.length} 件最近記錄的事，整理出了幾個可能值得聊聊的方向。`;

  return {
    intro,
    topics: topics.slice(0, 5),
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] therapy topics for ${evs.length} events (quiet=${!!quiet})`,
    },
  };
}

async function generateCommunicationPatternSummary({ events, stats }) {
  const startedAt = Date.now();
  const evs = Array.isArray(events) ? events : [];
  // Prefer the most frequent real cycle steps if we have them; otherwise a
  // sensible default loop so the mock still renders something meaningful.
  const topSteps = (stats?.cycleStepCounts || [])
    .map((c) => c.step)
    .filter(Boolean)
    .slice(0, 4);
  const recurringCycle = topSteps.length >= 3
    ? topSteps
    : ['一方追問', '另一方退縮', '追得更急', '更加沉默'];
  const flags = (stats?.toxicityCounts || []).map((t) => t.flag).filter(Boolean);
  const signals = [];
  if (flags.includes('sarcasm') || flags.includes('contempt')) {
    signals.push('理性的話語底下，偶爾帶著一點酸。');
  }
  if (flags.includes('absolute_language')) {
    signals.push('說到激動時，容易出現「總是、從來」這類把話說死的字。');
  }

  return {
    recurringCycle,
    signals,
    exitTip: '當我發現自己又開始追問，我先深呼吸，說：我不是要質問你，我只是有點慌，想靠近你。',
    _meta: {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] communication pattern for ${evs.length} events`,
    },
  };
}

// ---------------------------------------------------------------------------
// 一起收尾 (closure) — deterministic 幫我想一個 + AI 見解
// ---------------------------------------------------------------------------
// e2e drives the entire closing → resolved machine through this provider, so
// both functions are fixed-output: option strings keyed only off `field`, one
// fixed insight. Same shared shapers as claudeProvider — if the contract ever
// changes, both move together or neither does.
const { shapeClosureAssist, shapeClosureInsight } = require('../../lib/closureAi');

const MOCK_CLOSURE_OPTIONS = {
  commitment: [
    '即使很生氣，也不在人前說你',
    '要動孩子之前，我會先問你',
    '覺得你判斷錯了，我回房再說',
  ],
  decision: [
    '沒有立即危險就先不移動孩子',
    '當下由陪在旁邊的人做決定',
    '有一方喊暫停就先停十分鐘',
  ],
};

async function generateClosureAssist({ field } = {}) {
  const startedAt = Date.now();
  const wanted = field === 'decision' ? 'decision' : 'commitment';
  return shapeClosureAssist(
    { options: MOCK_CLOSURE_OPTIONS[wanted] },
    {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] closure assist for ${wanted}`,
    }
  );
}

async function generateClosureInsight({ commitments, sharedDecision } = {}) {
  const startedAt = Date.now();
  const list = Array.isArray(commitments) ? commitments : [];
  return shapeClosureInsight(
    {
      insight:
        '你們兩個約定剛好對上了彼此最在意的地方，一個接住不想被誤解，一個接住不想一個人承擔。真正要練的是當下那三秒鐘，先問一句，再決定。',
    },
    {
      provider: 'mock',
      model: 'mock',
      durationMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
      costUsd: 0,
      assembledPrompt: `[mock] closure insight for ${list.length} commitments${sharedDecision ? ' + decision' : ''}`,
    }
  );
}

// --- 情緒深潛 Emotional Deep Dive ------------------------------------------
// Deterministic, guardrail-safe stand-ins. Same output shape as the claude
// provider (via lib/deepDiveAi shapers) so the e2e journey runs on the mock.
const { shapeDeepDiveReflection, shapeDeepDiveLetter } = require('../../lib/deepDiveAi');

const MOCK_DEEP_DIVE_REFLECTIONS = {
  emotion: { reflection: '聽起來，生氣底下可能還有一種「我的感受沒有被重視」的委屈。', question: '這種不被重視的感覺，對你來說熟悉嗎？' },
  memory: { reflection: '你剛才想到的畫面，好像也帶著一種「沒有人聽見我」的感覺。', question: '那個時候的你，最希望有人怎麼對你？' },
  past: { reflection: '你願意把當時說不出口的話寫下來，這件事本身就很不容易。', question: '那時候的你，最想讓對方知道的是什麼？' },
  partner_mirror: { reflection: '先不用急著判斷誰對誰錯，你已經願意好好讀完，這很重要。', question: '用你自己的話說說看，你聽見對方真正想讓你知道的是什麼？' },
};

async function generateDeepDiveReflection({ step } = {}) {
  const startedAt = Date.now();
  const key = MOCK_DEEP_DIVE_REFLECTIONS[step] ? step : 'emotion';
  return shapeDeepDiveReflection(MOCK_DEEP_DIVE_REFLECTIONS[key], {
    provider: 'mock',
    model: 'mock',
    durationMs: Date.now() - startedAt,
    usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
    costUsd: 0,
    assembledPrompt: `[mock] deep dive reflection for ${key}`,
  });
}

const MOCK_DEEP_DIVE_LETTERS = {
  compassion:
    '親愛的那時候的我：\n\n你的感受沒有錯。你想被聽見，是很自然的。你不需要變得更乖、更安靜、更懂事，才值得有人認真聽你說話。我知道那時候你很孤單，但你值得被好好對待。',
  partner:
    '當你沒有回應我的時候，我表面上是生氣，但後來我發現，我很快就會覺得自己不重要。這種感覺以前也出現過。我不是要你為我的過去負責，我只是想讓你知道：當我變得很生氣的時候，我裡面其實有一個很怕不被聽見的自己。現在我需要的，是你先聽我說完，而不是馬上解釋。',
};

async function generateDeepDiveLetter({ kind } = {}) {
  const startedAt = Date.now();
  const key = MOCK_DEEP_DIVE_LETTERS[kind] ? kind : 'partner';
  return shapeDeepDiveLetter({ letter: MOCK_DEEP_DIVE_LETTERS[key] }, {
    provider: 'mock',
    model: 'mock',
    durationMs: Date.now() - startedAt,
    usage: { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 },
    costUsd: 0,
    assembledPrompt: `[mock] deep dive letter for ${key}`,
  });
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
  generateThreadTranslations,
  generateTherapyNote,
  analyzeDraft,
  generateTherapySummary,
  generateTherapyTopics,
  generateCommunicationPatternSummary,
  generateFacilitatorTurn,
  generateClosureAssist,
  generateClosureInsight,
  generateDeepDiveReflection,
  generateDeepDiveLetter,
};
