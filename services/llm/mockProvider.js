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

  const neutral = `關於${topic}，目前產生了一些情緒波動。整體事件可以這樣描述：${summary} 目前先將狀態整理成這樣的紀錄。`;

  const firm = `我感受到${topEmotion}，主要是因為${topic}。${summary} 我先把這件事提出來放著。`;

  const warm = `${firm} 等彼此比較平靜後，我願意找時間再聊聊，也想聽聽你的想法。`;

  return { neutral, firm, warm };
}

async function generateIcebreaker(rawText /* , context */) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('rawText is required');
  }

  const title = deriveTitle(rawText);
  const summary = deriveSummary(rawText);
  const emotions = pickEmotions(rawText);
  const tags = pickTags(rawText);
  const toxicityFlags = detectToxicity(rawText);
  const versions = buildVersions({ summary, emotions, tags });

  return { title, summary, emotions, tags, toxicityFlags, versions };
}

module.exports = { generateIcebreaker };
