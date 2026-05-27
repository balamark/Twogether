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

const SYSTEM_PROMPT = `你是一個專為情侶設計的「破冰」AI 助手，協助一方把當下強烈、可能傷人的情緒，整理成三種風格的破冰版本。請永遠以繁體中文回覆。

任務：閱讀使用者提供的原始情緒文字，產生：
1. title：12 字以內的事件標題，描述事件主題（不要情緒字眼）。
2. summary：將原文整理為 1–3 句中性摘要（最多 200 字）。把任何髒話、人身攻擊、絕對化指控（總是/從來/廢物 等）以 *** 遮蔽。
3. emotions：最多 3 個情緒標籤，從這個清單中挑：憤怒、失落、委屈、失望、焦慮、孤單、疲憊、受傷、恐懼、無助、羞愧、嫉妒、煩躁、內疚、被忽視、不安、無奈、麻木、心累、難過、複雜情緒。
4. tags：最多 2 個主題標籤，從這個清單中挑：家務、行程、金錢、育兒、語氣、家人、誤會、感情、夫妻、朋友、人際關係、工作。
5. toxicityFlags：偵測到的問題語言，可選值：absolute_language（總是/從來/每次/永遠）、name_calling（笨/蠢/廢物/沒用/罵髒話）、verbal_aggression（閉嘴/滾/去死）、contempt（鄙視、輕蔑、翻白眼式語言）、threats（威脅分手/離婚/傷害）、blame_shifting（都是你害的/推卸責任）、emotional_blackmail（情緒勒索/以愛之名要求）、sarcasm（諷刺/反話）、catastrophizing（災難化/最糟結局）、comparison（拿來與他人比較）、stonewalling（冷暴力/不回應）、dismissiveness（否定對方感受/小題大作）。
6. versions.neutral：第三方中性旁白版。完全不示弱、不指責，以第三人稱客觀描述事件與情緒，1–3 句。
7. versions.firm：堅定不攻擊版。以「我訊息」說出感受與影響，不指責、不請求、不討好，1–3 句。
8. versions.warm：善意版。在 firm 的基礎上多一句願意聊聊的善意，總長 2–4 句。

所有版本都必須：
- 移除人身攻擊與絕對化用語；如果原文有，將其改寫為具體事實描述。
- 不要替伴侶辯護，也不要替使用者道歉，只是整理表達。
- 使用繁體中文。

回應請呼叫 emit_icebreaker tool，不要輸出其他文字。`;

const TOOL_SCHEMA = {
  name: 'emit_icebreaker',
  description: 'Return the structured icebreaker rewrite for the raw event text.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 120 },
      summary: { type: 'string', maxLength: 1000 },
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
          neutral: { type: 'string' },
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

async function generateIcebreaker(rawText) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('rawText is required');
  }

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_icebreaker' },
    messages: [{ role: 'user', content: rawText }],
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

async function rewriteReply({ rawReply, eventSummary, recentMessages, createdBySelf }) {
  if (typeof rawReply !== 'string' || rawReply.trim().length === 0) {
    throw new Error('rawReply is required');
  }

  const summaryOwner = createdBySelf ? '你' : '對方';
  const contextLines = [
    '角色說明：',
    '- [你] = 正在寫這則回覆的人（請從這個視角改寫草稿）',
    '- [對方] = 你的伴侶（事件中的另一方）',
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
        text: REPLY_REWRITE_SYSTEM_PROMPT,
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

module.exports = { generateIcebreaker, rewriteReply };
