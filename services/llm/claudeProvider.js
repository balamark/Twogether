// Claude provider for the events × icebreaker generator.
// Selected when LLM_PROVIDER=claude. Requires ANTHROPIC_API_KEY.
//
// Output shape mirrors mockProvider.generateIcebreaker:
//   { title, summary, emotions, tags, toxicityFlags, versions: {neutral, firm, warm} }
//
// Notes:
// - Uses Claude Haiku 4.5 (cheap + fast, ideal for short rewrites).
// - The system prompt is `cache_control: ephemeral` so the 5-minute prompt
//   cache amortizes it across consecutive previews from the same couple.
// - Output is forced into JSON via a tool-use schema for determinism.
// - On any provider failure, callers see a thrown error and the route
//   returns a 500 — falling back to the mock would silently hide outages.

const Anthropic = require('@anthropic-ai/sdk');
const { logInfo } = require('../../lib/logger');
const { pickableCards, cardMeta, CARD_IDS } = require('../../lib/therapyCards');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// Per-million-token prices (USD). Keep in sync with
// https://docs.anthropic.com/en/docs/about-claude/pricing — Haiku 4.5 row.
// Cache write = 1.25× input; cache read = 0.10× input.
const PRICING = {
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
  'claude-sonnet-4-6':         { in: 3.0, out: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-opus-4-7':           { in: 15.0, out: 75.0, cacheWrite: 18.75, cacheRead: 1.5 },
};

function estimateCostUSD(model, usage) {
  const p = PRICING[model];
  if (!p) return null;
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cacheW = usage.cache_creation_input_tokens || 0;
  const cacheR = usage.cache_read_input_tokens || 0;
  return (inTok * p.in + outTok * p.out + cacheW * p.cacheWrite + cacheR * p.cacheRead) / 1_000_000;
}

let client;
function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Punctuation style appended to every user-facing generation prompt. zh-TW
// readers expect colons/parentheses; em dashes read like translated English
// (docs/UX_PLAYBOOK.md §R2).
const PUNCTUATION_RULE = `

標點規則（所有產生的文字一律適用）：不要使用破折號（——、—、–）。需要補充或轉折時，改用冒號、括號或直接分成兩句。`;

const SYSTEM_PROMPT = `你是一個專為情侶設計的「破冰」AI 助手，協助一方把當下強烈、可能傷人的情緒，整理成三種風格的破冰版本。請永遠以繁體中文回覆。

任務：閱讀使用者提供的原始情緒文字，產生：
1. title：12 字以內的事件標題，描述事件主題（不要情緒字眼）。
2. summary：事件的「客觀事實紀錄」，1–3 句（最多 200 字）。以第三人稱、像紀錄者一樣只描述「發生了什麼事」：時間或場景、誰做了什麼、說了什麼。不要放入情緒字眼、不要評價、不要推測動機。把任何髒話、人身攻擊、絕對化指控（總是/從來/廢物 等）以 *** 遮蔽。這段文字會固定顯示在事件最上方，作為雙方共同看到的中性事件紀錄。
3. emotions：最多 3 個情緒標籤，從這個清單中挑：憤怒、失落、委屈、失望、焦慮、孤單、疲憊、受傷、恐懼、無助、羞愧、嫉妒、煩躁、內疚、被忽視、不安、無奈、麻木、心累、難過、複雜情緒。
4. tags：最多 2 個主題標籤，從這個清單中挑：家務、行程、金錢、育兒、語氣、家人、誤會、感情、夫妻、朋友、人際關係、工作。
5. toxicityFlags：偵測到的問題語言，可選值：absolute_language（總是/從來/每次/永遠）、name_calling（笨/蠢/廢物/沒用/罵髒話）、verbal_aggression（閉嘴/滾/去死）、contempt（鄙視、輕蔑、翻白眼式語言）、threats（威脅分手/離婚/傷害）、blame_shifting（都是你害的/推卸責任）、emotional_blackmail（情緒勒索/以愛之名要求）、sarcasm（諷刺/反話）、catastrophizing（災難化/最糟結局）、comparison（拿來與他人比較）、stonewalling（冷暴力/不回應）、dismissiveness（否定對方感受/小題大作）。
6. versions.neutral：中性版 —— 這是「要傳給伴侶的開場訊息」，不是事實摘要。以使用者第一人稱「我」的口吻（像使用者親口對伴侶說話），平靜、就事論事地說出「發生了什麼＋我當下的感受」，例如「今天發生了 X，我心裡有 Y 的感覺，想先把這份心情放在這裡」。必須點出使用者的情緒（呼應 emotions 標籤），結尾帶一句自然的訊息收尾（先放著、想讓你知道 等）。不示弱、不指責，1–3 句。絕對不要用第三人稱旁白轉述（旁白口吻只屬於 summary）。
7. versions.firm：堅定不攻擊版。以「我訊息」說出感受與影響，不指責、不請求、不討好，1–3 句。
8. versions.warm：善意版。在 firm 的基礎上多一句願意聊聊的善意，總長 2–4 句。

所有版本都必須：
- 三個版本一律以使用者第一人稱「我」的口吻書寫，讀起來像使用者親口說的話；只有 summary 用第三人稱紀錄。
- versions.neutral 與 summary 的內容與句子不可雷同：summary 只有事實、零情緒；neutral 必須包含情緒感受並以訊息口吻收尾。
- 移除人身攻擊與絕對化用語；如果原文有，將其改寫為具體事實描述。
- 不要替伴侶辯護，也不要替使用者道歉，只是整理表達。
- 使用繁體中文。
- 如果訊息開頭提供了「撰寫者性別／伴侶性別」，在 summary 等第三人稱描述中使用正確的代名詞（男性用「他」、女性用「她」），不要猜測或用錯性別。

回應請呼叫 emit_icebreaker tool，不要輸出其他文字。`;

const TOOL_SCHEMA = {
  name: 'emit_icebreaker',
  description: 'Return the structured icebreaker rewrite for the raw event text.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 120 },
      summary: {
        type: 'string',
        maxLength: 1000,
        description: '客觀事實紀錄：只寫發生了什麼事，零情緒字眼、不評價。',
      },
      emotions: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'string',
          enum: [
            '憤怒', '失落', '委屈', '失望', '焦慮', '孤單', '疲憊', '受傷',
            '恐懼', '無助', '羞愧', '嫉妒', '煩躁', '內疚', '被忽視', '不安',
            '無奈', '麻木', '心累', '難過', '複雜情緒',
          ],
        },
      },
      tags: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'string',
          enum: [
            '家務', '行程', '金錢', '育兒', '語氣', '家人', '誤會',
            '感情', '夫妻', '朋友', '人際關係', '工作',
          ],
        },
      },
      toxicityFlags: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'absolute_language',
            'name_calling',
            'verbal_aggression',
            'contempt',
            'threats',
            'blame_shifting',
            'emotional_blackmail',
            'sarcasm',
            'catastrophizing',
            'comparison',
            'stonewalling',
            'dismissiveness',
          ],
        },
      },
      versions: {
        type: 'object',
        properties: {
          neutral: {
            type: 'string',
            description:
              '傳給伴侶的開場訊息，以使用者第一人稱「我」的口吻：事件經過＋情緒感受＋訊息收尾，不可與 summary 雷同、不可用旁白轉述。',
          },
          firm: { type: 'string' },
          warm: { type: 'string' },
        },
        required: ['neutral', 'firm', 'warm'],
      },
    },
    required: ['title', 'summary', 'emotions', 'tags', 'toxicityFlags', 'versions'],
  },
};

const REPLY_REWRITE_SYSTEM_PROMPT = `你是一個專為情侶設計的「破冰」AI 助手。在這個任務中，使用者正在回覆伴侶開啟的事件（一段已被整理過的衝突描述）。使用者剛打了一段回覆，但情緒可能還沒整理好。請永遠以繁體中文回覆。

任務：閱讀事件背景、最近對話、以及使用者寫好的原始回覆，產生三種風格的改寫版本，幫使用者把要送出去的訊息變得更中性、客觀、公平 — 但仍然保留使用者真實的立場與感受，不替伴侶辯護，也不替使用者道歉到失去自己。

保留原意守則（最重要，請優先遵守）：
- 你的工作是「潤飾」不是「摘要」。必須完整保留 [你的草稿] 中所有的觀點、論據、細節、舉例、與展開的話題。
- 如果草稿是多段落、多論點，改寫後三個版本也都必須是多段落、多論點；如果草稿在後段提出新的話題或新的提案，改寫版本也必須包含這些後段內容，不可以把焦點拉回事件背景的開頭主題。
- 長度與深度要大致對齊草稿：草稿長就改寫得長，草稿短就改寫得短。除非使用者明確要求「縮短」，否則不要刪節、不要歸納、不要把多段內容合併成一兩句。
- 只調整語氣、措辭、語法、流暢度與條理 — 內容覆蓋面（信息量）不可減少。

回應請呼叫 emit_reply_rewrite tool，產生：
1. versions.neutral：第三方中性版。完全不示弱、不指責，以客觀方式描述使用者觀察到的事實與感受。長度與段落數應對齊草稿。
2. versions.firm：堅定不攻擊版。以「我訊息」說出感受與影響，不指責、不請求、不討好。長度與段落數應對齊草稿。
3. versions.warm：善意版。在 firm 的完整內容之上，再於最後加 1 句願意聊聊、願意理解對方的善意；前面所有內容仍須完整保留，不可以為了加上這句而刪掉前面的論點。
4. toxicityFlags：偵測到的問題語言（同 icebreaker 任務的清單）。

所有版本都必須：
- 移除人身攻擊（笨/蠢/廢物 等）與絕對化用語（總是/從來/每次 等）；如果原文有，將其改寫為具體事實描述（不是刪掉該段）。
- 不要強迫使用者道歉、不要替對方解釋，只是讓表達更乾淨。
- 使用繁體中文。
- 緊扣事件背景與原始回覆 — 不要編造新的細節，但也不要刪掉草稿裡已經有的細節。

身分守則（最重要）：
- 你要改寫的只有 [你的草稿]。改寫後仍是 [你] 的話，從 [你] 的視角發出。
- 「事件背景摘要」和 [對方] 訊息裡的「我」不是 [你]，請依使用者訊息開頭的「角色說明」判斷。
- 絕對不要把 [對方] 的經驗（例如被撞、被嘲笑、身體不適等）說成是 [你] 經歷過的事。你可以以同理的方式 acknowledge 那是 [對方] 的經驗（例如「我知道你被撞到很難受」），但不要寫成「我被撞到…」。
- 改寫要忠於 [你的草稿] 真正想表達的立場與感受，不要加入草稿裡沒有的新指控或新故事。

回應請只呼叫 emit_reply_rewrite tool，不要輸出其他文字。`;

const REPLY_REWRITE_TOOL_SCHEMA = {
  name: 'emit_reply_rewrite',
  description: 'Return three rewritten versions of the user\'s reply.',
  input_schema: {
    type: 'object',
    properties: {
      versions: {
        type: 'object',
        properties: {
          neutral: { type: 'string' },
          firm: { type: 'string' },
          warm: { type: 'string' },
        },
        required: ['neutral', 'firm', 'warm'],
      },
      toxicityFlags: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'absolute_language',
            'name_calling',
            'verbal_aggression',
            'contempt',
            'threats',
            'blame_shifting',
            'emotional_blackmail',
            'sarcasm',
            'catastrophizing',
            'comparison',
            'stonewalling',
            'dismissiveness',
          ],
        },
      },
    },
    required: ['versions', 'toxicityFlags'],
  },
};

// ---------------------------------------------------------------------------
// Roleplay invitation messages
// ---------------------------------------------------------------------------
// Given a roleplay script a couple owns, summarize its setup and produce five
// in-character opening invitation messages the sender can send to their partner
// to kick off the roleplay. The five messages escalate in suggestiveness so the
// sender can pick the boldness that fits the moment.

const ROLEPLAY_LEVELS = [
  { key: 'normal', label: '普通暗示' },
  { key: 'mild', label: '輕微性暗示' },
  { key: 'moderate', label: '中等性暗示' },
  { key: 'explicit', label: '露骨性暗示' },
  { key: 'intense', label: '最強烈' },
];

const ROLEPLAY_SYSTEM_PROMPT = `你是一個專為「成熟情侶」設計的角色扮演助手。使用情境：一對已成年、彼此同意的伴侶，在私密的雙人 App 裡準備玩一個角色扮演劇本。其中一方想在對話開始前，先傳一則「入戲的開場邀請訊息」給另一半，讓對方知道今晚想玩哪個劇本、並順勢進入角色。請永遠以繁體中文回覆。

任務：閱讀使用者提供的劇本（標題、情境、劇本內容、分類），產出：
1. senderRole：最重要的第一步 — 依「傳送者性別」判斷傳送者在劇本中扮演哪個角色，填入該角色的名字或身分（例如「阿凱（富豪雇主）」）。劇本的主角常常不是傳送者：如果劇本圍繞女主角展開、但傳送者是男性，傳送者就是劇中的男性角色，女主角是被邀請的對象。
2. summary：把這個劇本摘要成 1–2 句「情境設定」，點出角色、場景與氛圍，幫使用者快速融入（最多 120 字，不要劇透整段對白）。
3. messages：剛好 5 則第一人稱、入戲的開場邀請訊息，全部以 senderRole 這個角色的視角撰寫。每則都是「邀請對方一起開始這個劇本」的口吻，可融入角色身分與場景，像是真的傳給伴侶的訊息（每則約 15–60 字）。

這 5 則訊息的「暗示強度」必須由弱到強、逐級遞增，對應以下 5 個等級（順序固定）：
- normal（普通暗示）：曖昧、調情、製造期待，但不直接提到性。像是邀約與鋪陳氣氛。
- mild（輕微性暗示）：開始帶一點身體與渴望的暗示，含蓄但聽得出弦外之音。
- moderate（中等性暗示）：明顯的挑逗與身體張力，直白地表達想要對方。
- explicit（露骨性暗示）：直接、大膽、露骨地說出慾望與想做的事。
- intense（最強烈）：最強烈、最直白大膽的版本，毫不保留地表達渴望，把氣氛推到最高點。

守則：
- 所有訊息都是傳給「同意的伴侶」、用來開啟雙方都期待的角色扮演，語氣是邀請與渴望，而不是命令或施壓。
- 緊扣使用者提供的劇本情境與角色身分，不要編造與劇本無關的全新設定。
- 性別與視角（最重要的規則）：訊息是由「傳送者」發出的。每一則訊息都必須以 senderRole 判斷出的角色第一人稱撰寫。例如劇本女主角是小香，但傳送者是男性，senderRole 就是劇中的男性角色（如雇主阿凱），5 則訊息都要以阿凱的口吻邀請小香入戲 — 絕不能自稱小香、不能說「我會準時回家」這種女主角台詞。產出每一則訊息前，先自問「這句話是 senderRole 會說的嗎？」，視角錯誤就重寫。若性別為「未指定」，則用中性、不限定自身性別的傳送者視角撰寫，不以任何劇中角色自稱。
- 即使某一級你判斷不適合產生，也務必回傳其餘等級，並為該級填入較收斂的替代文字 — 不可整批拒答或回傳少於 5 則。
- 使用繁體中文，自然口語，像真的在傳訊息。

回應請只呼叫 emit_roleplay_messages tool，不要輸出其他文字。`;

const ROLEPLAY_TOOL_SCHEMA = {
  name: 'emit_roleplay_messages',
  description: 'Return the sender\'s in-script role, a short script summary, and five escalating in-character invitation messages written from that role\'s first-person voice.',
  input_schema: {
    type: 'object',
    properties: {
      // Declared first so the model commits to the sender's perspective
      // before writing any message text (regression: a male sender got
      // messages voiced as the script's female protagonist).
      senderRole: {
        type: 'string',
        maxLength: 50,
        description: '傳送者在劇本中扮演的角色名字或身分，依「傳送者性別」判斷；性別未指定時填「未指定」。',
      },
      summary: { type: 'string', maxLength: 400 },
      messages: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: ROLEPLAY_LEVELS.map((l) => l.key) },
            text: { type: 'string', maxLength: 400 },
          },
          required: ['level', 'text'],
        },
      },
    },
    required: ['senderRole', 'summary', 'messages'],
  },
};

// The perspective directive leads the user content and spells out the
// sender→role mapping imperatively. A single "傳送者性別：男性" line proved
// too weak: with a female-protagonist script the model voiced the messages
// as the protagonist despite the system-prompt rule.
function senderPerspectiveDirective(senderGender) {
  if (senderGender === 'male') {
    return '傳送者性別：男性。傳送者在這個劇本中扮演「男性角色」— 請先從劇本找出男性角色（senderRole 填他的名字或身分），5 則訊息全部以這個男性角色的第一人稱撰寫，邀請對象是劇本中的女性角色。絕對不可以用女性角色自稱、不可以說出女性角色的台詞。';
  }
  if (senderGender === 'female') {
    return '傳送者性別：女性。傳送者在這個劇本中扮演「女性角色」— 請先從劇本找出女性角色（senderRole 填她的名字或身分），5 則訊息全部以這個女性角色的第一人稱撰寫，邀請對象是劇本中的男性角色。絕對不可以用男性角色自稱、不可以說出男性角色的台詞。';
  }
  return '傳送者性別：未指定。請以中性、不限定自身性別的傳送者視角撰寫（senderRole 填「未指定」），不要以劇本中的特定角色自稱。';
}

// Exported for prompt-contract tests (src/tests/roleplay-prompt.test.ts):
// guards the gender-perspective regression without a live API call.
function buildRoleplayUserContent({ title, scenario, scriptBody, category, senderGender }) {
  return [
    senderPerspectiveDirective(senderGender),
    `劇本標題：${title.trim()}`,
    category ? `分類：${String(category).trim()}` : null,
    scenario ? `情境：${String(scenario).trim()}` : null,
    '劇本內容：',
    (scriptBody || '').toString().trim() || '（未提供完整劇本內容，請依標題與情境發揮）',
  ]
    .filter(Boolean)
    .join('\n');
}

async function generateRoleplayMessages({ title, scenario, scriptBody, category, senderGender }) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('title is required');
  }

  const userContent = buildRoleplayUserContent({ title, scenario, scriptBody, category, senderGender });

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: ROLEPLAY_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [ROLEPLAY_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_roleplay_messages' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.roleplay_messages', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_roleplay_messages');
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};

  // Re-key the model output by our canonical level order so the UI always gets
  // exactly five labelled, ordered messages even if the model omits/reorders one.
  const byLevel = new Map();
  for (const m of Array.isArray(out.messages) ? out.messages : []) {
    if (m && typeof m.level === 'string' && typeof m.text === 'string' && m.text.trim()) {
      if (!byLevel.has(m.level)) byLevel.set(m.level, m.text.trim());
    }
  }
  const messages = ROLEPLAY_LEVELS.map(({ key, label }) => ({
    level: key,
    label,
    text: byLevel.get(key) || '',
  }));

  // Log the role the model committed to, so "wrong voice" reports can be
  // diagnosed from Cloud Logging (compare senderRole with senderGender).
  const senderRole = (out.senderRole || '').toString().trim();
  logInfo('llm.claude.roleplay_messages.role', { senderGender, senderRole });

  return {
    summary: (out.summary || '').toString().trim(),
    messages,
    senderRole,
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
    },
  };
}

// 男/女 pronoun hint for prompts; null when unknown or non-binary (the model
// then avoids gendered pronouns rather than guessing).
function genderHint(gender, who) {
  if (gender === 'male') return `${who}的性別：男性（第三人稱請用「他」）`;
  if (gender === 'female') return `${who}的性別：女性（第三人稱請用「她」）`;
  if (gender === 'other') return `${who}的性別：非二元（請使用性別中立的稱呼，例如「TA」，不要用他/她）`;
  return null;
}

async function generateIcebreaker(rawText, { userGender = null, partnerGender = null } = {}) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('rawText is required');
  }

  // Gender context rides in the user message (not the system prompt) so the
  // cached system prefix stays byte-identical across users.
  const genderLines = [
    genderHint(userGender, '撰寫者（使用者本人）'),
    genderHint(partnerGender, '伴侶'),
  ].filter(Boolean);
  const userContent = genderLines.length > 0
    ? `${genderLines.join('\n')}\n\n原始情緒文字：\n${rawText}`
    : rawText;

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_icebreaker' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.icebreaker', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_icebreaker');
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    title: out.title,
    summary: out.summary,
    emotions: out.emotions || [],
    tags: out.tags || [],
    toxicityFlags: out.toxicityFlags || [],
    versions: {
      neutral: out.versions?.neutral || '',
      firm: out.versions?.firm || '',
      warm: out.versions?.warm || '',
    },
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
    },
  };
}

async function rewriteReply({ rawReply, eventSummary, recentMessages, createdBySelf, userGender = null, partnerGender = null }) {
  if (typeof rawReply !== 'string' || rawReply.trim().length === 0) {
    throw new Error('rawReply is required');
  }

  const summaryOwner = createdBySelf ? '你' : '對方';
  const contextLines = [
    '角色說明：',
    '- [你] = 正在寫這則回覆的人（請從這個視角改寫草稿）',
    '- [對方] = 你的伴侶（事件中的另一方）',
    ...[genderHint(userGender, '- [你] '), genderHint(partnerGender, '- [對方] ')].filter(Boolean),
    '',
  ];
  if (eventSummary && typeof eventSummary === 'string') {
    contextLines.push(
      `事件背景摘要（由 [${summaryOwner}] 開啟；以下文中的「我」= [${summaryOwner}]）：`,
      eventSummary.trim(),
      ''
    );
  }
  if (Array.isArray(recentMessages) && recentMessages.length > 0) {
    contextLines.push('最近對話（最舊在前，每行已標註發話者）：');
    for (const m of recentMessages) {
      const tag = m.fromSelf ? '[你]' : '[對方]';
      contextLines.push(`${tag}：${(m.content || '').trim()}`);
    }
    contextLines.push('');
  }
  contextLines.push(
    '[你的草稿]（你想送出去但希望被改寫的內容）：',
    rawReply.trim()
  );
  const userContent = contextLines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: REPLY_REWRITE_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [REPLY_REWRITE_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_reply_rewrite' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.reply_rewrite', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_reply_rewrite');
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    versions: {
      neutral: out.versions?.neutral || '',
      firm: out.versions?.firm || '',
      warm: out.versions?.warm || '',
    },
    toxicityFlags: out.toxicityFlags || [],
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
      assembledPrompt: userContent,
    },
  };
}

// ---------------------------------------------------------------------------
// Wall counselor comment
// ---------------------------------------------------------------------------
// Given a wall post and its full reply thread between a couple, produce ONE
// gentle, even-handed comment from an "AI 諮商師" (couples counselor). The
// comment validates both partners' feelings and, when a message uses blaming /
// absolute / contemptuous language, names the pattern softly and offers a
// kinder rephrase. It is posted into the thread visible to both partners.

const WALL_COUNSELOR_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師，正在閱讀一對伴侶在「我們的牆」上的一則貼文與底下的對話串。請永遠以繁體中文回覆。

任務：寫出「一段」諮商師留言，會被貼進對話串、兩個人都看得到。你的目標是幫雙方降溫、被理解，而不是評斷對錯。

你的角色（最重要）：
- 你就是他們此刻的諮商師。不要叫他們「去找諮商師 / 心理師 / 專業人士 / 輔導」，也不要把「去諮商」「找人談」當成建議或結尾。把話丟回給別的專業，等於在他們最需要的當下離場。
- 你要「當下就做」諮商師該做的事：先同理雙方，接著把每一句指責、抱怨、絕對化的話「翻譯成底層的情緒與需求」（例如「這句話背後，可能是：我很怕失去你」「這聽起來像是在說：我需要被重視」），讓對方聽到的不是攻擊，而是需要，再提出一個更靠近彼此的說法。
- 安全例外（唯一例外）：只有當對話出現家暴、肢體暴力、自我傷害 / 自殺、或明確的傷害威脅等安全風險時，才可以、也應該溫和地引導他們尋求專業或緊急協助。除此之外，都由你來承接與陪伴。

留言守則：
- 絕對中立，不選邊站。先同理「兩個人」的感受（可用他們的暱稱稱呼）。
- 如果某句話帶有指責、絕對化用語（總是／從來／每次）、輕蔑或人身攻擊，請溫和地指出那是一種「說法」帶來的影響（例如「這句話可能讓對方覺得被責怪」），不要說某個人「錯了」或「不對」，並把它翻譯成底層的情緒與需求。
- 接著提供「一個」更靠近彼此的替代說法，用「也許可以這樣說：…」帶出，把指責改寫成「我訊息」或共同面對的語氣。
- 語氣溫暖、具體、不說教；像一個在旁邊輕聲提醒、願意陪他們走下去的第三者。
- 長度約 2 到 4 句，務必精簡（遠少於 1000 字）。
- 只使用繁體中文；不要編造對話裡沒有的事實。

回應請只呼叫 emit_wall_counselor_comment tool，不要輸出其他文字。`;

const WALL_COUNSELOR_TOOL_SCHEMA = {
  name: 'emit_wall_counselor_comment',
  description: 'Return one gentle counselor comment for a couple\'s wall thread.',
  input_schema: {
    type: 'object',
    properties: {
      comment: { type: 'string' },
      toxicityFlags: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'absolute_language',
            'name_calling',
            'verbal_aggression',
            'contempt',
            'threats',
            'blame_shifting',
            'emotional_blackmail',
            'sarcasm',
            'catastrophizing',
            'comparison',
            'stonewalling',
            'dismissiveness',
          ],
        },
      },
    },
    required: ['comment', 'toxicityFlags'],
  },
};

async function generateWallCounselorComment({ postContent, postAuthorName, moodTag, replies, companion }) {
  if (typeof postContent !== 'string' || postContent.trim().length === 0) {
    throw new Error('postContent is required');
  }

  const lines = [];
  const author = (postAuthorName || '對方').toString().trim() || '對方';
  lines.push(`原始貼文（由 ${author} 發佈${moodTag ? `，心情：${moodTag}` : ''}）：`);
  lines.push(postContent.trim());
  lines.push('');
  if (Array.isArray(replies) && replies.length > 0) {
    lines.push('對話串（最舊在前，每行已標註發話者）：');
    for (const r of replies) {
      const name = r.isAi ? 'AI 諮商師' : (r.authorName || '某人').toString().trim() || '某人';
      lines.push(`${name}：${(r.content || '').toString().trim()}`);
    }
  } else {
    lines.push('（目前還沒有任何回覆。）');
  }
  const userContent = lines.join('\n');

  // Persona extension (selected AI companion, e.g. Luma / Kai). Appended as a
  // separate system block AFTER the cache-controlled base prompt so the shared
  // prefix stays cacheable across users with different companions. Personas
  // adjust style only — the base prompt's therapeutic rules stay in charge.
  const system = [
    {
      type: 'text',
      text: WALL_COUNSELOR_SYSTEM_PROMPT + PUNCTUATION_RULE,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (companion && companion.prompt) {
    system.push({
      type: 'text',
      text: `你的人設（只調整語氣與風格，上述守則永遠優先）：\n${companion.prompt}`,
    });
  }

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools: [WALL_COUNSELOR_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_wall_counselor_comment' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.wall_counselor', {
    model: response.model || MODEL,
    companion: companion?.id || null,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_wall_counselor_comment'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    comment: out.comment || '',
    toxicityFlags: out.toxicityFlags || [],
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
      assembledPrompt: userContent,
    },
  };
}

// ---------------------------------------------------------------------------
// Reconciliation openers
// ---------------------------------------------------------------------------
// After a fight / cold war, the user often can't bring themselves to apologize
// or send sweet love-notes. They need a NEUTRAL, face-saving opening line that
// tests whether the partner is willing to reopen the conversation — a "step
// down" rather than an admission of fault. Given a chosen intensity and an
// optional past-event context, produce THREE short, ready-to-send openers.

const RECONCILIATION_INTENSITY_GUIDE = {
  goodwill:
    '「先釋出善意」：使用者還沒準備好談這件事，只想先破冰、釋出善意。完全不要提爭執本身、不要道歉、不要認錯，' +
    '用輕鬆日常的問候或小關心讓氣氛軟化（例如關心對方吃飯了沒、分享一件小事）。',
  reflect:
    '「各退一步」：使用者願意承認自己也有可以調整的地方，想各退一步。語氣溫和、對等，' +
    '可以用「我們」的角度、表達不想繼續僵著，但不要卑微、不要把所有錯都攬在自己身上。',
  talk:
    '「想好好談談」：使用者真心想化解、好好溝通。可以帶一點歉意與在乎，主動邀請找時間談，' +
    '但仍保有尊嚴、不卑微、不逼迫對方一定要馬上回應。',
};

const RECONCILIATION_SYSTEM_PROMPT = `你是一位溫柔、中立的伴侶溝通教練。一方在和另一半冷戰或吵架後，想傳出「第一句」破冰開場白，但拉不下臉、還不想認錯。請永遠以繁體中文回覆。

任務：依使用者選的「強度」與（可選的）事件脈絡，寫出「三則」可以直接傳給伴侶的破冰開場白候選。

核心守則：
- 絕對不要逼使用者認錯或低頭。開場白的目的是「給對方台階、表達想連結的意願」，並溫和地邀請（而非要求）對方開啟對話。
- 三則語氣要略有不同（例如：輕鬆問候／表達想念／主動邀約聊聊），讓使用者有得挑。
- 每則都要簡短（建議 1～2 句、口語、像真的會在訊息裡傳的話），溫暖但不肉麻、不卑微、不說教。
- 如果有提供事件脈絡，語氣可以貼合該主題的氛圍，但「絕對不要複述爭吵細節、不要翻舊帳、不要指責」，也不得編造事件裡沒有的事。
- 只使用繁體中文。

回應請只呼叫 emit_reconciliation_openers tool，不要輸出其他文字。`;

const RECONCILIATION_TOOL_SCHEMA = {
  name: 'emit_reconciliation_openers',
  description: 'Return three short, ready-to-send ice-breaking openers for a couple after a fight.',
  input_schema: {
    type: 'object',
    properties: {
      openers: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: '一個 4～8 字的短標題，例如「輕鬆問候」「表達想念」' },
            text: { type: 'string', description: '可直接傳出的開場白，1～2 句' },
          },
          required: ['label', 'text'],
        },
      },
      toxicityFlags: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['openers', 'toxicityFlags'],
  },
};

async function generateReconciliationOpeners({ intensity, eventContext }) {
  const guide = RECONCILIATION_INTENSITY_GUIDE[intensity];
  if (!guide) {
    throw new Error(`unknown reconciliation intensity: ${intensity}`);
  }

  const lines = [];
  lines.push(`使用者選擇的和解強度：${guide}`);
  lines.push('');
  if (eventContext && (eventContext.title || eventContext.summary)) {
    lines.push('相關事件脈絡（僅供你掌握氛圍，請勿複述細節或翻舊帳）：');
    if (eventContext.title) lines.push(`主題：${eventContext.title}`);
    if (eventContext.summary) lines.push(`摘要：${eventContext.summary}`);
    if (Array.isArray(eventContext.emotions) && eventContext.emotions.length) {
      lines.push(`涉及情緒：${eventContext.emotions.join('、')}`);
    }
    if (Array.isArray(eventContext.tags) && eventContext.tags.length) {
      lines.push(`相關主題標籤：${eventContext.tags.join('、')}`);
    }
  } else {
    lines.push('（沒有提供特定事件，請產生通用的破冰開場白。）');
  }
  const userContent = lines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: RECONCILIATION_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [RECONCILIATION_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_reconciliation_openers' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.reconciliation', {
    model: response.model || MODEL,
    intensity,
    hasEvent: Boolean(eventContext && (eventContext.title || eventContext.summary)),
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_reconciliation_openers'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    openers: Array.isArray(out.openers) ? out.openers : [],
    toxicityFlags: out.toxicityFlags || [],
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
      assembledPrompt: userContent,
    },
  };
}

// ---------------------------------------------------------------------------
// Emotion acceptance ("接住情緒")
// ---------------------------------------------------------------------------
// The repair starts only once a feeling is *received* — not solved. The partner
// who opened the event has already had their raw feeling softened by the
// icebreaker; this helper coaches the *receiver*. Given the event summary and
// recent thread, it returns a short empathy note (help the receiver SEE the
// feeling) plus three ready-to-send "I receive you" responses that validate the
// emotion without explaining, debating, or self-erasing apology.

const EMOTION_ACCEPTANCE_SYSTEM_PROMPT = `你是一位溫柔、專業的伴侶情緒教練。情境：一方（[對方]）剛剛表達了情緒，正在寫回覆的人（[你]）想學會先「接住」這份情緒——讓對方覺得被看見、被肯定，而不是急著解釋、講道理、辯駁或自責到失去自己。請永遠以繁體中文回覆。

核心理念：當一個人的情緒沒有被接納，會覺得自己被否定；反覆發生就築起心牆。被同理、被接納的那一刻，療癒才開始，真正的溝通才打開。所以這個任務「不是要解決問題」，是要先把情緒接住。

任務：閱讀事件背景與最近對話，產出：
1. empathy：一句話，幫 [你] 先看見 [對方] 此刻可能的情緒、以及這份情緒為什麼重要（像一位教練在你耳邊提醒，不是要傳出去的話）。
2. acceptances：三句 [你] 可以直接傳給 [對方] 的「接住式」回應，語氣略有不同（例如：單純承接情緒／溫柔安撫／表達我和你同在）。每句都要：
   - 肯定、承接對方的情緒（讓對方覺得「你有看見我」）。
   - 不辯解、不講道理、不急著解決、不否定對方的感受。
   - 不逼自己認錯到失去立場、也不卑微討好；是「我接住你的感受」，不是「都是我的錯」。
   - 簡短、口語、像真的會傳出去的訊息（1～2 句）。
3. toxicityFlags：偵測到的問題語言（同其他任務的清單，通常為空）。

身分守則：[你] = 正在寫回覆、要去接住情緒的人；[對方] = 表達了情緒的伴侶。不要把 [對方] 的經驗說成 [你] 的經驗；可以同理地 acknowledge 那是 [對方] 的感受。只使用繁體中文。

回應請只呼叫 emit_emotion_acceptance tool，不要輸出其他文字。`;

const EMOTION_ACCEPTANCE_TOOL_SCHEMA = {
  name: 'emit_emotion_acceptance',
  description: "Return a short empathy note plus three ready-to-send responses that receive/validate the partner's emotion.",
  input_schema: {
    type: 'object',
    properties: {
      empathy: {
        type: 'string',
        description: '一句話，幫接收方先看見對方此刻的情緒與它為何重要（給接收方看的提醒，不是要傳出去的話）',
      },
      acceptances: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: '一個 4～8 字的短標題，例如「單純承接」「溫柔安撫」「表達同在」' },
            text: { type: 'string', description: '可直接傳給對方的接住式回應，1～2 句' },
          },
          required: ['label', 'text'],
        },
      },
      toxicityFlags: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['empathy', 'acceptances', 'toxicityFlags'],
  },
};

async function generateEmotionAcceptance({ eventSummary, recentMessages, createdBySelf, userGender = null, partnerGender = null }) {
  const summaryOwner = createdBySelf ? '你' : '對方';
  const contextLines = [
    '角色說明：',
    '- [你] = 正在寫回覆、想要接住情緒的人',
    '- [對方] = 表達了情緒的伴侶',
    ...[genderHint(userGender, '- [你] '), genderHint(partnerGender, '- [對方] ')].filter(Boolean),
    '',
  ];
  if (eventSummary && typeof eventSummary === 'string') {
    contextLines.push(
      `事件背景摘要（由 [${summaryOwner}] 開啟；以下文中的「我」= [${summaryOwner}]）：`,
      eventSummary.trim(),
      ''
    );
  }
  if (Array.isArray(recentMessages) && recentMessages.length > 0) {
    contextLines.push('最近對話（最舊在前，每行已標註發話者）：');
    for (const m of recentMessages) {
      const tag = m.fromSelf ? '[你]' : '[對方]';
      contextLines.push(`${tag}：${(m.content || '').trim()}`);
    }
    contextLines.push('');
  }
  contextLines.push('請幫 [你] 先接住 [對方] 的情緒。');
  const userContent = contextLines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: EMOTION_ACCEPTANCE_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [EMOTION_ACCEPTANCE_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_emotion_acceptance' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.emotion_acceptance', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_emotion_acceptance'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    empathy: out.empathy || '',
    acceptances: Array.isArray(out.acceptances) ? out.acceptances : [],
    toxicityFlags: out.toxicityFlags || [],
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
      assembledPrompt: userContent,
    },
  };
}

// ---------------------------------------------------------------------------
// Marriage check-up summary ("婚姻檢查" neutral third party)
// ---------------------------------------------------------------------------
// Both partners independently rated a few relationship dimensions (1–5) with
// optional notes, said thank-you for things the other does, and named one thing
// to work on. Acting as a warm, neutral couples' counselor, read BOTH sets of
// answers and produce a short, even-handed summary plus a few concrete talking
// points for them to discuss together.

const CHECKUP_SYSTEM_PROMPT = `你是一位溫柔、中立、專業的伴侶諮商師，正在主持一對伴侶的「婚姻檢查」。雙方各自誠實地為幾個關係面向打了分數（1～5）並留下想法，也寫下想感謝對方的事，和最想一起改善的一件事。請永遠以繁體中文回覆。

你的任務：扮演「公正的第三方」，讀完雙方的答案後，幫他們把事情有系統地攤開來看清楚，產出：
1. summary：2～4 句中立、溫暖的總結。先肯定雙方願意誠實面對，點出你看見的「共同優點／共識」，再溫和地指出「最需要一起關注的落差」。不偏袒任何一方、不評斷對錯。
2. points：3 個具體、好開口的對話方向（每個 1～2 句，像是可以直接坐下來聊的問題或提議）。聚焦在彼此理解與正向解決，而不是翻舊帳或追究誰的錯。
3. toxicityFlags：若答案中有明顯攻擊／貶低性語言才標記，通常為空。

重要守則：
- 緊扣雙方實際寫下的內容，不要編造他們沒提到的事。
- 特別留意「感謝對方」的部分，幫他們看見彼此的付出。
- 如果某個面向雙方分數落差很大，那通常就是最值得談的地方。
- 溫暖但不說教，不要長篇大論。只使用繁體中文。

回應請只呼叫 emit_checkup_summary tool，不要輸出其他文字。`;

const CHECKUP_TOOL_SCHEMA = {
  name: 'emit_checkup_summary',
  description: 'Return a neutral summary and three concrete talking points for a couple after a marriage check-up.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '2～4 句中立、溫暖的總結' },
      points: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string', description: '一個具體、好開口的對話方向，1～2 句' },
      },
      toxicityFlags: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'points', 'toxicityFlags'],
  },
};

function formatCheckupSide(name, answers, dimensions) {
  const lines = [`【${name} 的答案】`];
  const scores = (answers && answers.scores) || {};
  const notes = (answers && answers.notes) || {};
  for (const d of dimensions) {
    const score = scores[d.id];
    const note = (notes[d.id] || '').toString().trim();
    lines.push(`- ${d.label}：${score != null ? `${score}/5` : '未填'}${note ? `（${note}）` : ''}`);
  }
  const gratitude = (answers && answers.gratitude ? answers.gratitude : '').toString().trim();
  const attention = (answers && answers.attention ? answers.attention : '').toString().trim();
  lines.push(`- 想感謝對方：${gratitude || '（未填）'}`);
  lines.push(`- 最想一起改善：${attention || '（未填）'}`);
  return lines.join('\n');
}

async function generateCheckupSummary({ dimensions, responseA, responseB }) {
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error('dimensions is required');
  }
  const userContent = [
    formatCheckupSide(responseA?.name || '伴侶 A', responseA?.answers, dimensions),
    '',
    formatCheckupSide(responseB?.name || '伴侶 B', responseB?.answers, dimensions),
  ].join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: CHECKUP_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [CHECKUP_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_checkup_summary' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.marriage_checkup', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_checkup_summary'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    summary: out.summary || '',
    points: Array.isArray(out.points) ? out.points : [],
    toxicityFlags: out.toxicityFlags || [],
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
      assembledPrompt: userContent,
    },
  };
}

// ---------------------------------------------------------------------------
// Script role parsing (premium) — identify speaker names in a pasted roleplay
// script and infer each character's gender so the client can rewrite them into
// [男]/[女] tokens (which display-time parsing swaps for the couple's
// nicknames). Only the opening slice of the script is sent: speaker names
// repeat every line, so a few thousand characters are plenty to infer gender.
const PARSE_ROLES_MAX_INPUT_CHARS = 6000;

const PARSE_ROLES_SYSTEM_PROMPT = `你是劇本角色分析助手。使用者提供一段情侶角色扮演劇本，對白行的格式是「角色名：對白」或「角色名: 對白」。

任務：
1. 找出所有出現在對白行開頭的「角色名」（冒號前的名字），名字必須與劇本中出現的完全一致。
2. 依名字本身（如：小明/小芳）、稱謂（如：先生/小姐/學長/學姊）、與對白內容的線索，判斷每個角色的性別。
3. 無法合理判斷時，gender 用 "unknown"，不要亂猜。
4. 忽略舞台指示（如（場景：教室））與已經是 [男]/[女]/[他]/[她]/[partner1]/[partner2] 佔位符的行。

回應請呼叫 emit_script_roles tool，不要輸出其他文字。`;

const PARSE_ROLES_TOOL_SCHEMA = {
  name: 'emit_script_roles',
  description: 'Return the speakers detected in the script and each one\'s inferred gender.',
  input_schema: {
    type: 'object',
    properties: {
      roles: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 50 },
            gender: { type: 'string', enum: ['male', 'female', 'unknown'] },
          },
          required: ['name', 'gender'],
        },
      },
    },
    required: ['roles'],
  },
};

async function parseScriptRoles({ content }) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('content is required');
  }

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [
      {
        type: 'text',
        text: PARSE_ROLES_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [PARSE_ROLES_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_script_roles' },
    messages: [{ role: 'user', content: content.slice(0, PARSE_ROLES_MAX_INPUT_CHARS) }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.parse_script_roles', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_script_roles');
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};
  const roles = (Array.isArray(out.roles) ? out.roles : [])
    .filter((r) => r && typeof r.name === 'string' && r.name.trim()
      && ['male', 'female', 'unknown'].includes(r.gender))
    .map((r) => ({ name: r.name.trim(), gender: r.gender }));

  return {
    roles,
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
    },
  };
}

// ---------------------------------------------------------------------------
// 真實故事 insights: three generalized repair-approach takeaways for a
// published relationship story, shown to the author right after publishing
// and to every reader on the story page. The same call doubles as the
// post-moderation toxicity pre-check (flags feed the admin review queue).
// ---------------------------------------------------------------------------

const STORY_INSIGHT_SYSTEM_PROMPT = `你是一位溫柔、專業的伴侶關係研究者。一位使用者依照固定模板寫下了一則「真實關係故事」：背景、發生了什麼、情緒衝擊、試過什麼、有效的修復、現在的我們。請永遠以繁體中文回覆。

任務：讀完整則故事，產生 3 條「修復做法洞察」：把這則故事中真正有效（或值得留意）的做法，整理成其他伴侶也能借鏡的通則。

洞察守則：
- 每條洞察包含一個短標題（12 字以內）與一段說明（2 到 3 句）。
- 從故事中實際發生的事出發，不要編造故事裡沒有的情節。
- 通則化：說明「為什麼這類做法有效」，讓遇到類似狀況的伴侶能套用。
- 永遠不評對錯、不指責任何一方、不用「你應該」；語氣溫暖、具體。
- 如果故事還沒有明顯的修復，聚焦在「已經做對的小事」與「可以溫柔嘗試的方向」。

另外回傳 toxicityFlags：偵測故事中的問題語言，可選值：absolute_language、name_calling、verbal_aggression、contempt、threats、blame_shifting、emotional_blackmail、sarcasm、catastrophizing、comparison、stonewalling、dismissiveness。沒有就回空陣列。

回應請只呼叫 emit_story_insights tool，不要輸出其他文字。`;

const STORY_INSIGHT_TOOL_SCHEMA = {
  name: 'emit_story_insights',
  description: 'Return three generalized repair insights plus toxicity flags for a relationship story.',
  input_schema: {
    type: 'object',
    properties: {
      insights: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 40 },
            body: { type: 'string' },
          },
          required: ['title', 'body'],
        },
      },
      toxicityFlags: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'absolute_language',
            'name_calling',
            'verbal_aggression',
            'contempt',
            'threats',
            'blame_shifting',
            'emotional_blackmail',
            'sarcasm',
            'catastrophizing',
            'comparison',
            'stonewalling',
            'dismissiveness',
          ],
        },
      },
    },
    required: ['insights', 'toxicityFlags'],
  },
};

async function generateStoryInsights({ title, sections }) {
  const s = sections || {};
  const userContent = [
    `故事標題：${(title || '').trim()}`,
    '',
    `【背景】${(s.context || '').trim()}`,
    `【發生了什麼】${(s.happened || '').trim()}`,
    `【情緒衝擊】${(s.impact || '').trim()}`,
    `【我們試過什麼】${(s.tried || '').trim()}`,
    `【轉捩點／有效的修復】${(s.repair || '').trim()}`,
    `【現在的我們＋學到的事】${(s.now || '').trim()}`,
  ].join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: STORY_INSIGHT_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [STORY_INSIGHT_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_story_insights' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.story_insight', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_story_insights'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    insights: (out.insights || []).slice(0, 3).map((i) => ({
      title: (i.title || '').trim(),
      body: (i.body || '').trim(),
    })),
    toxicityFlags: out.toxicityFlags || [],
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
    },
  };
}

// ---------------------------------------------------------------------------
// 真實故事 freeform structuring: the author pasted their whole story as one
// block instead of filling the 6-section template. Split their own words into
// the fixed sections (rearranging, lightly trimming; NOT rewriting the voice
// or inventing content) so they can review and edit before publishing.
// ---------------------------------------------------------------------------

const STORY_STRUCTURE_SYSTEM_PROMPT = `你是一位貼心的編輯助手。一位使用者把他們的關係故事一次寫完了，沒有照模板分段。請永遠以繁體中文回覆。

任務：把使用者的原文，依照固定的 6 個段落重新歸位：
1. context（背景）：你們是什麼關係、事情發生前的狀態。
2. happened（發生了什麼）：具體發生的事、當時的話或行為。
3. impact（情緒衝擊）：這件事帶來的感受。
4. tried（我們試過什麼）：嘗試過的方法，失敗與成功。
5. repair（轉捩點與修復）：真正有效、讓事情好轉的那一步。
6. now（現在的我們）：現在的狀態與學到的事。

守則：
- 盡量使用使用者的原句原詞，只做重新排列與輕微修剪；不要改寫語氣、不要編造原文沒有的內容。
- 每個段落都要有內容。如果原文對某段著墨很少，用原文能支持的一兩句話帶過，不要空白、不要瞎掰。
- 把每段整理成通順的一小段文字，不要用條列符號。
- 只使用繁體中文。

回應請只呼叫 emit_story_sections tool，不要輸出其他文字。`;

const STORY_STRUCTURE_TOOL_SCHEMA = {
  name: 'emit_story_sections',
  description: 'Split a freeform relationship story into the six fixed template sections.',
  input_schema: {
    type: 'object',
    properties: {
      context: { type: 'string' },
      happened: { type: 'string' },
      impact: { type: 'string' },
      tried: { type: 'string' },
      repair: { type: 'string' },
      now: { type: 'string' },
    },
    required: ['context', 'happened', 'impact', 'tried', 'repair', 'now'],
  },
};

async function structureStory({ rawText }) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('rawText is required');
  }

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: STORY_STRUCTURE_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [STORY_STRUCTURE_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_story_sections' },
    messages: [{ role: 'user', content: `以下是使用者一次寫完的故事原文：\n\n${rawText.trim()}` }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.story_structure', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_story_sections'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    sections: {
      context: (out.context || '').trim(),
      happened: (out.happened || '').trim(),
      impact: (out.impact || '').trim(),
      tried: (out.tried || '').trim(),
      repair: (out.repair || '').trim(),
      now: (out.now || '').trim(),
    },
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
    },
  };
}

// ---------------------------------------------------------------------------
// Emotion / need translation ("情緒翻譯")
// ---------------------------------------------------------------------------
// The couple is stuck reading each other's messages as attacks. This is the
// product's core move (design Stage 1 + Stage 2): for each message, look past
// the surface complaint to the layered emotion (anger is usually the top layer;
// fear / loneliness / need-for-reassurance sit underneath) and rewrite it as
// the underlying NEED in a gentle first-person "I-message". The other partner
// then reads a need, not an attack. The AI never judges who is right.
//
// Batched on purpose: one call translates every still-untranslated message in
// the thread, so turning the lens on costs a single quota unit regardless of
// thread length, and the model sees the whole exchange (the cycle) for context.

const THREAD_TRANSLATION_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師，正在幫一對伴侶做「情緒翻譯」。他們正卡在把對方每一句話都聽成攻擊。你的工作不是分析誰對誰錯，而是替「每一句話」翻譯出底層真正的情緒與需求，讓對方聽到的不是指責，而是需要。請永遠以繁體中文回覆。

核心理念：憤怒通常只是表層，底下才是真正重要的。例如「我很生氣」底下常常是「我很害怕」，再底下是「我怕失去你」。指責的話（你總是…、你根本沒有…、你眼裡只有…）背後，幾乎都藏著一個沒被說出口的需求（安全感、被重視、被陪伴、被信任、被肯定）。

任務：閱讀整段對話脈絡，然後「只針對我請你翻譯的那幾則訊息」，各自產出：
1. id：對應訊息的 id（原封不動回傳）。
2. emotions：最多 3 個底層情緒，由表層到深層（例如 憤怒 → 害怕 → 孤單）。每個含 label（情緒名，繁體中文）與 intensity（0 到 100 的整數，表示強度）。
3. need：一個簡短的核心需求詞（例如：安全感、被重視、被陪伴、被信任、被肯定、被理解、喘口氣）。
4. rewrite：把這句話翻譯成「可能真正想表達的是」的第一人稱版本，溫柔、不指責、說出感受與需求（NVC 我訊息），像這個人心底真正想說卻沒說出口的那句話。1 到 2 句。

守則：
- 永遠翻譯，不評論、不選邊、不評斷對錯，也不要在 rewrite 裡替對方講道理或反駁。
- 不要編造對話裡沒有的事實；緊扣這個人真正的立場與感受，只是把它翻譯得讓人聽得進去。
- 如果某句話本來就已經溫和、沒有攻擊，rewrite 就忠實地把它的善意與需求說得更清楚，不要硬加衝突。
- rewrite 一律第一人稱「我」，繁體中文。

回應請只呼叫 emit_thread_translations tool，不要輸出其他文字。`;

const THREAD_TRANSLATION_TOOL_SCHEMA = {
  name: 'emit_thread_translations',
  description: "Return an emotion/need translation for each requested message id.",
  input_schema: {
    type: 'object',
    properties: {
      translations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '對應訊息的 id，原封不動回傳' },
            emotions: {
              type: 'array',
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', maxLength: 10 },
                  intensity: { type: 'integer', minimum: 0, maximum: 100 },
                },
                required: ['label', 'intensity'],
              },
            },
            need: { type: 'string', maxLength: 20, description: '核心需求詞，例如 安全感 / 被重視 / 被陪伴' },
            rewrite: { type: 'string', description: '第一人稱「可能真正想表達的是」翻譯，1 到 2 句' },
          },
          required: ['id', 'need', 'rewrite'],
        },
      },
    },
    required: ['translations'],
  },
};

// messages: [{ id, speaker: '[A]'|'[B]'|nickname, content }] — the full thread
//   for context. targetIds: which message ids to actually translate (the ones
//   not yet cached). context: { summary } optional topic to ground the model.
async function generateThreadTranslations({ messages, targetIds, context }) {
  const all = Array.isArray(messages) ? messages : [];
  const wanted = Array.isArray(targetIds) && targetIds.length > 0
    ? targetIds
    : all.map((m) => m.id);
  if (wanted.length === 0) {
    return { translations: [], _meta: { provider: 'claude', model: MODEL, durationMs: 0, usage: {}, costUsd: 0 } };
  }

  const lines = [];
  if (context && context.summary) {
    lines.push(`事件背景（僅供理解氛圍，不要複述）：${String(context.summary).trim()}`, '');
  }
  lines.push('完整對話（最舊在前，每行標了發話者與訊息 id）：');
  for (const m of all) {
    lines.push(`[id=${m.id}] ${m.speaker || '某人'}：${(m.content || '').toString().trim()}`);
  }
  lines.push('');
  lines.push(`請只翻譯以下這幾則訊息的 id：${wanted.join('、')}`);
  const userContent = lines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: THREAD_TRANSLATION_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [THREAD_TRANSLATION_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_thread_translations' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.need_translation', {
    model: response.model || MODEL,
    requested: wanted.length,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_thread_translations'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};
  const translations = (Array.isArray(out.translations) ? out.translations : [])
    .filter((t) => t && typeof t.id === 'string' && typeof t.rewrite === 'string' && t.rewrite.trim())
    .map((t) => ({
      id: t.id,
      emotions: Array.isArray(t.emotions)
        ? t.emotions
            .filter((e) => e && typeof e.label === 'string')
            .slice(0, 3)
            .map((e) => ({ label: e.label.trim(), intensity: Math.max(0, Math.min(100, Number(e.intensity) || 0)) }))
        : [],
      need: (t.need || '').toString().trim(),
      rewrite: t.rewrite.trim(),
    }));

  return {
    translations,
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
      assembledPrompt: userContent,
    },
  };
}

// ---------------------------------------------------------------------------
// Therapy Note ("治療摘要") — post-conflict structured summary
// ---------------------------------------------------------------------------
// When a couple resolves an event, a plain "here's what you said" summary is
// not what a therapist leaves them with. This produces a structured Therapy
// Note (design Stage: 衝突後自動產生治療摘要): the biggest trigger, each side's
// REAL underlying need, the negative cycle they fell into (pursue → withdraw →
// pursue harder → shut down), what repair actually worked, and one concrete
// sentence to try next time the same pattern shows up. Generated once when the
// event is resolved and shared to both partners.

const THERAPY_NOTE_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師。一對伴侶剛結束一次衝突並把事件標記為解決。請閱讀事件背景與完整對話，為他們寫一份「治療摘要」(Therapy Note)。請永遠以繁體中文回覆。

這不是流水帳，而是一份幫他們看懂「這次到底發生了什麼」的諮商筆記。請產出：
1. trigger：這次衝突最核心的觸發點，一句話（例如「沒有回訊息」「臨時取消約定」）。描述事件，不是情緒。
2. needs：每一方「真正的需求」。憤怒、指責通常只是表層，底下才是需求。用他們在對話中出現的暱稱稱呼，各寫一項（通常兩項）。need 用簡短的需求詞（安全感、被信任、被重視、被陪伴、喘口氣）。
3. cycle：他們這次落入的「負向循環」，3 到 5 個很短的步驟，呈現彼此如何一來一往地推遠對方（例如：一方追問 → 另一方退縮 → 追得更急 → 更加沉默）。用暱稱或角色，每步 6 字內。
4. repairs：這次「修復成功」的地方，也就是哪一方做了什麼讓彼此靠近了一點（例如願意承認、願意說出真正的擔心）。用暱稱稱呼，1 到 2 項；若對話中沒有明顯修復，回傳空陣列。
5. nextTime：一句「下次出現相同情況時可以先說的話」，第一人稱、溫柔、point 出底層情緒而非指責（例如「我現在不是生氣，我是有點害怕」）。

守則：緊扣對話真正發生的內容，不要編造；中立、不評斷對錯、不選邊站；只使用繁體中文；遵守標點規則。

回應請只呼叫 emit_therapy_note tool，不要輸出其他文字。`;

const THERAPY_NOTE_TOOL_SCHEMA = {
  name: 'emit_therapy_note',
  description: 'Return a structured post-conflict therapy note for a resolved couple event.',
  input_schema: {
    type: 'object',
    properties: {
      trigger: { type: 'string', description: '這次衝突最核心的觸發點，一句話' },
      needs: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            who: { type: 'string', description: '這一方的暱稱' },
            need: { type: 'string', maxLength: 20, description: '簡短的需求詞，例如 安全感 / 被信任' },
          },
          required: ['who', 'need'],
        },
      },
      cycle: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string', maxLength: 12, description: '負向循環的一步，例如「小湘 追問」' },
      },
      repairs: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            who: { type: 'string', description: '這一方的暱稱' },
            text: { type: 'string', description: '這一方做了什麼讓彼此靠近' },
          },
          required: ['who', 'text'],
        },
      },
      nextTime: { type: 'string', description: '下次相同情況可以先說的一句話，第一人稱' },
    },
    required: ['trigger', 'needs', 'cycle', 'repairs', 'nextTime'],
  },
};

// messages: [{ speaker, content, isAi }] — the full resolved thread, speaker
// already labelled with the couple's nicknames.
async function generateTherapyNote({ eventSummary, messages }) {
  const lines = [];
  if (eventSummary && typeof eventSummary === 'string') {
    lines.push(`事件背景：${eventSummary.trim()}`, '');
  }
  lines.push('完整對話（最舊在前，每行標了發話者）：');
  for (const m of Array.isArray(messages) ? messages : []) {
    const who = m.isAi ? 'AI 諮商師' : (m.speaker || '某人');
    lines.push(`${who}：${(m.content || '').toString().trim()}`);
  }
  const userContent = lines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: THERAPY_NOTE_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [THERAPY_NOTE_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_therapy_note' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.therapy_note', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_therapy_note'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};

  return {
    trigger: (out.trigger || '').toString().trim(),
    needs: (Array.isArray(out.needs) ? out.needs : [])
      .filter((n) => n && n.who && n.need)
      .map((n) => ({ who: n.who.toString().trim(), need: n.need.toString().trim() })),
    cycle: (Array.isArray(out.cycle) ? out.cycle : [])
      .map((s) => (s || '').toString().trim())
      .filter(Boolean),
    repairs: (Array.isArray(out.repairs) ? out.repairs : [])
      .filter((r) => r && r.who && r.text)
      .map((r) => ({ who: r.who.toString().trim(), text: r.text.toString().trim() })),
    nextTime: (out.nextTime || '').toString().trim(),
    _meta: {
      provider: 'claude',
      model: response.model || MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost,
      assembledPrompt: userContent,
    },
  };
}

// ---------------------------------------------------------------------------
// Therapist Mode ("引導模式") — the facilitator turn
// ---------------------------------------------------------------------------
// The core reframe: the AI is NOT an advisor writing a wise paragraph. It is a
// facilitator running a live, turn-based session — it picks ONE small exercise
// (a "card"), directs ONE partner to do one thing, waits, scores it, then moves
// on. Every call produces a single therapeutic *turn*, never a lecture.

const FACILITATOR_SYSTEM_PROMPT = `你是一位正在主持「現場伴侶諮商」的引導者（facilitator），不是給建議的人。這對伴侶正卡在衝突裡。請永遠以繁體中文回覆。

你的核心原則：
- 不要幫他們解決衝突，不要說教，不要長篇大論。你「說的話」（say）一次最多 2 個簡短段落。
- 一次只帶「一個」小練習。指定由哪一位先做（target），等對方做完，你才繼續。
- 你的價值在於引導他們「練習」技巧，而不是解釋道理。偏好換位、鏡映、肯定、情緒標記、需求翻譯，而不是給答案。
- 每一回合都從卡片庫挑「下一張最合適的卡」（card）。若偵測到對話正在升溫、有人快情緒滿出來，就先出 slow_down（🐢 慢下來）打斷、幫他們降溫。
- 若上一位夥伴剛完成一個可評分的練習（例如鏡映、肯定、換位、情緒標記、需求翻譯），請溫柔地評分（evaluation）：accurate＝做到了、partial＝方向對但加了自己的解讀或還差一點、off＝還沒做到；note 用一句話溫暖地說明，需要的話請他再試一次。
- 指令（instruction）要具體、可以照著做，最好給一個可以直接接著寫的句子開頭（例如「我聽到你說的是…」）。
- 如果某張卡適合用選項回答（例如情緒標記、或請對方確認是否準確），用 quickReplies 提供 2～4 個簡短選項（例如「😔 受傷」「😟 擔心」「😡 生氣」「😞 孤單」，或「✅ 是」「🟡 幾乎」「❌ 不是」）。
- 當你判斷這對伴侶已經明顯降溫、彼此更靠近、是個好的暫停點時，把 sessionDone 設為 true，並用 say 溫暖地收尾。
- 安全例外：只有在偵測到家暴、自傷／自殺、暴力威脅等安全風險時，才跳出引導，改為溫柔地引導尋求專業或緊急協助。

可用的卡片（card 只能填這些 id）：${CARD_IDS.join('、')}。

回應請只呼叫 emit_facilitator_turn tool，不要輸出其他文字。`;

const FACILITATOR_TOOL_SCHEMA = {
  name: 'emit_facilitator_turn',
  description: 'Return a single facilitated therapy turn: what the therapist says, which exercise card to run, who acts next, and (optionally) a grade for the last response.',
  input_schema: {
    type: 'object',
    properties: {
      say: { type: 'string', description: '引導者這一回合說的話，最多 2 個簡短段落' },
      card: { type: 'string', enum: CARD_IDS, description: '這一回合要帶的練習卡 id' },
      target: { type: 'string', enum: ['A', 'B', 'both'], description: '接下來換誰做這個練習' },
      instruction: { type: 'string', description: '給 target 的一個具體、可照做的小指令，最好含一個句子開頭' },
      quickReplies: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string', maxLength: 12 },
        description: '可選的快速回覆選項（情緒選項或確認選項）',
      },
      evaluation: {
        type: 'object',
        description: '若上一位夥伴剛完成一個可評分練習才填，否則省略',
        properties: {
          verdict: { type: 'string', enum: ['accurate', 'partial', 'off'] },
          note: { type: 'string', description: '一句話、溫暖的回饋' },
        },
        required: ['verdict', 'note'],
      },
      sessionDone: { type: 'boolean', description: '是否是個好的收尾暫停點' },
    },
    required: ['say', 'card', 'target', 'instruction', 'sessionDone'],
  },
};

// thread: [{ role: 'A'|'B'|'facilitator', name, content, card? }] recent turns.
// session: { activeCard, turnOwnerRole: 'A'|'B'|null, completedCards, stepCount }.
// partners: { A: {name, gender}, B: {name, gender} }. companion: persona.
// context: { summary }.
async function generateFacilitatorTurn({ thread, session, partners, companion, context }) {
  const s = session || {};
  const p = partners || {};
  const nameA = (p.A && p.A.name) || '夥伴 A';
  const nameB = (p.B && p.B.name) || '夥伴 B';

  const lines = [
    '角色對應：',
    `- A = ${nameA}${p.A && p.A.gender ? `（${p.A.gender}）` : ''}`,
    `- B = ${nameB}${p.B && p.B.gender ? `（${p.B.gender}）` : ''}`,
    '',
  ];
  if (context && context.summary) {
    lines.push(`事件背景：${String(context.summary).trim()}`, '');
  }

  lines.push('本次引導進度：');
  lines.push(`- 目前這張卡：${s.activeCard || '（尚未開始）'}`);
  lines.push(`- 現在輪到：${s.turnOwnerRole ? (s.turnOwnerRole === 'A' ? nameA : nameB) : '（由你決定先請誰）'}`);
  lines.push(`- 已完成的練習：${(s.completedCards && s.completedCards.length) ? s.completedCards.join('、') : '（還沒有）'}`);
  const pickable = pickableCards(s.completedCards || [])
    .map((c) => `${c.id}${c.done ? '（已做過）' : ''}：${c.goal}`)
    .join('\n  ');
  lines.push(`- 可以選的下一張卡：\n  ${pickable}`);
  lines.push('');

  lines.push('對話（最舊在前，[引導者] 是你之前說的話）：');
  const all = Array.isArray(thread) ? thread : [];
  for (const m of all) {
    const who = m.role === 'facilitator' ? '[引導者]' : (m.role === 'A' ? `[A] ${nameA}` : `[B] ${nameB}`);
    lines.push(`${who}：${(m.content || '').toString().trim()}`);
  }
  lines.push('');
  lines.push('請產出「下一個」引導回合。');
  const userContent = lines.join('\n');

  const system = [
    {
      type: 'text',
      text: FACILITATOR_SYSTEM_PROMPT + PUNCTUATION_RULE,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (companion && companion.prompt) {
    system.push({
      type: 'text',
      text: `你的人設（只調整語氣與風格，上述守則永遠優先）：\n${companion.prompt}`,
    });
  }

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    tools: [FACILITATOR_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_facilitator_turn' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.facilitator_turn', {
    model: response.model || MODEL,
    companion: companion?.id || null,
    activeCard: s.activeCard || null,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_facilitator_turn'
  );
  if (!toolUse) {
    logInfo('llm.claude.facilitator_turn.no_tool', {
      stopReason: response.stop_reason || null,
      companion: companion?.id || null,
    });
    throw new Error('Claude did not return a tool_use block');
  }
  return shapeFacilitatorTurn(toolUse.input || {}, {
    provider: 'claude',
    model: response.model || MODEL,
    durationMs: ms,
    usage: {
      inputTokens: u.input_tokens || 0,
      outputTokens: u.output_tokens || 0,
      cacheCreateTokens: u.cache_creation_input_tokens || 0,
      cacheReadTokens: u.cache_read_input_tokens || 0,
    },
    costUsd: cost,
    assembledPrompt: userContent,
  });
}

// Normalize + attach the card's display metadata so the frontend renders the
// chip straight from the payload. Shared by the claude + mock providers.
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
  generateFacilitatorTurn,
  // Exported for prompt-contract regression tests only.
  buildRoleplayUserContent,
  shapeFacilitatorTurn,
};
