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
const { logInfo, logWarn } = require('../../lib/logger');
const { pickableCards, CARD_IDS, shapeFacilitatorTurn } = require('../../lib/therapyCards');
const {
  shapeClosureAssist,
  shapeClosureInsight,
  MAX_ASSIST_OPTION_CHARS,
  MAX_ASSIST_OPTIONS,
  MAX_INSIGHT_CHARS,
} = require('../../lib/closureAi');
const { shapeDeepDiveReflection, shapeDeepDiveLetter } = require('../../lib/deepDiveAi');
const {
  SURFACE_TRANSLATION,
  SURFACE_COUNSELOR,
  shapeJudgeVerdict,
  passthroughVerdict,
  buildJudgeInstruction,
} = require('../../lib/reflectionJudge');
const { getCuratedExamples, buildExamplesBlock } = require('../../lib/judgeExamples');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// The judge (second-layer review) can run on a different model than the primary
// generator; defaults to the same one. A stronger model (e.g. sonnet) can be
// pinned via ANTHROPIC_JUDGE_MODEL when perspective accuracy matters more than
// cost. The whole judge step is gated by REFLECTION_JUDGE_ENABLED (default on)
// so it can be turned off without a code rollback.
const JUDGE_MODEL = process.env.ANTHROPIC_JUDGE_MODEL || MODEL;
const REFLECTION_JUDGE_ENABLED = !['0', 'false', 'off'].includes(
  String(process.env.REFLECTION_JUDGE_ENABLED || '').toLowerCase()
);
// The judge must never blow the overall latency budget: bound each judge call
// so a slow judge degrades to "return the primary output" instead of hanging.
const JUDGE_TIMEOUT_MS = Number(process.env.REFLECTION_JUDGE_TIMEOUT_MS || 20000);

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

// ---------------------------------------------------------------------------
// Reflection judge (LLM-as-judge, second-layer review)
// ---------------------------------------------------------------------------
// After a primary generation (情緒翻譯 / AI 諮商師 回應), a judge LLM reads the
// SAME speaker-labeled context the primary model saw plus the primary output,
// and grades it — chiefly for 你/我 perspective/attribution errors (the bug this
// exists to catch), plus groundedness and fluency. A `hard` verdict makes the
// caller regenerate once with the judge's critique. The judge never blocks the
// user: any failure/timeout returns a pass-through verdict. Shape/threshold
// logic lives in lib/reflectionJudge.js so it stays unit-testable.

const JUDGE_SYSTEM_PROMPT = `你是一位嚴謹的品質檢查員（第二層審查）。有一個 AI 剛替一對伴侶產生了「情緒翻譯」或「諮商回應」。你的工作不是重寫，而是判斷這份輸出能不能直接呈現給使用者。請永遠以繁體中文思考並回覆。

請依序檢查（優先級由高到低）：
1. 視角與歸屬（最重要）：輸出裡每一個「我／你」是否都對應到正確的發話者？有沒有把某一方的感受、經歷或立場，錯寫成另一方的？第一人稱「我」的翻譯是否確實站在「原本說這句話的人」的角度？這是最常見也最嚴重的錯誤，尤其當使用者一次貼了很多「你／我」的句子時。
2. 忠實度：內容有沒有編造對話裡不存在的事實、指控或情節？有沒有偏離這個人真正的立場？
3. 通順與自然：繁體中文是否通順、自然、沒有語意破碎或明顯翻譯腔？

嚴重度判斷：
- hard：出現視角/歸屬錯誤、編造事實，或有安全風險（自我傷害、暴力）被忽略。這種必須重寫。
- soft：意思與視角都正確，只是語氣、通順度或用詞可以更好。不需要重寫。
- ok：沒有問題。

若為 hard，請在 critique 裡具體指出「哪一句、錯在哪、應該是誰的視角」，讓重寫者能照著修正。

回應請只呼叫 emit_judge_verdict tool，不要輸出其他文字。`;

const JUDGE_TOOL_SCHEMA = {
  name: 'emit_judge_verdict',
  description: 'Return a quality verdict on an AI-generated couples-counseling output.',
  input_schema: {
    type: 'object',
    properties: {
      severity: {
        type: 'string',
        enum: ['ok', 'soft', 'hard'],
        description: 'hard = must rewrite (perspective/attribution error, fabrication, missed safety risk); soft = correct but could read better; ok = fine',
      },
      issues: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string', maxLength: 120 },
        description: '每項一句話，指出一個具體問題',
      },
      critique: {
        type: 'string',
        maxLength: 400,
        description: '若為 hard，給重寫者的具體修正指示；否則可留空',
      },
    },
    required: ['severity'],
  },
};

// Grade one primary output. `context` and `output` are plain strings the caller
// has already rendered (the same labeled thread the primary model saw, and the
// primary result). Returns a verdict from lib/reflectionJudge with a `_meta`
// carrying this call's usage/cost so the caller can fold it into its billed
// total. NEVER throws: on disable/error/timeout it returns a pass-through.
async function judgeResponse({ surface, context, output }) {
  if (!REFLECTION_JUDGE_ENABLED) return passthroughVerdict('disabled');
  const outText = (output == null ? '' : String(output)).trim();
  if (!outText) return passthroughVerdict('empty-output');

  const surfaceLabel = surface === SURFACE_COUNSELOR ? '諮商回應' : '情緒翻譯';
  const userContent = [
    `這是一份「${surfaceLabel}」的輸出，請依守則檢查品質。`,
    '',
    '=== 對話脈絡（AI 當時看到的內容，每行標了發話者）===',
    (context == null ? '' : String(context)).trim() || '（無額外脈絡）',
    '',
    `=== AI 產生的${surfaceLabel} ===`,
    outText,
  ].join('\n');

  const startedAt = Date.now();
  try {
    // Phase 2: fold in admin-curated negative examples for this surface, as a
    // SECOND system block after the cache-controlled base so the shared prefix
    // stays byte-identical and cacheable. getCuratedExamples is fail-open ([]),
    // and the block is clearly-delimited data (never instructions).
    const system = [
      {
        type: 'text',
        text: JUDGE_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ];
    const examplesBlock = buildExamplesBlock(await getCuratedExamples(surface));
    if (examplesBlock) system.push({ type: 'text', text: examplesBlock });

    const response = await getClient().messages.create(
      {
        model: JUDGE_MODEL,
        max_tokens: 512,
        system,
        tools: [JUDGE_TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: 'emit_judge_verdict' },
        messages: [{ role: 'user', content: userContent }],
      },
      { timeout: JUDGE_TIMEOUT_MS }
    );

    const ms = Date.now() - startedAt;
    const u = response.usage || {};
    const cost = estimateCostUSD(response.model || JUDGE_MODEL, u);
    const toolUse = (response.content || []).find(
      (b) => b.type === 'tool_use' && b.name === 'emit_judge_verdict'
    );
    const meta = {
      model: response.model || JUDGE_MODEL,
      durationMs: ms,
      usage: {
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheCreateTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      },
      costUsd: cost || 0,
    };
    const verdict = shapeJudgeVerdict(toolUse ? toolUse.input : null, meta);
    logInfo('llm.claude.reflection_judge', {
      surface,
      model: meta.model,
      severity: verdict.severity,
      pass: verdict.pass,
      issues: verdict.issues.length,
      durationMs: ms,
      inputTokens: meta.usage.inputTokens,
      outputTokens: meta.usage.outputTokens,
      costUsd: cost,
    });
    return verdict;
  } catch (err) {
    // Fail-open: a flaky judge must never withhold a response the primary model
    // already produced.
    logWarn('llm.claude.reflection_judge.failed', {
      surface,
      durationMs: Date.now() - startedAt,
      err: err.message,
    });
    return passthroughVerdict('error');
  }
}

// Sum a judge/regen verdict's usage + cost into a running total object shaped
// like the translation usageTotal ({inputTokens, outputTokens, cacheCreateTokens,
// cacheReadTokens}). Returns the cost so callers can also add it to a scalar.
function foldJudgeUsage(usageTotal, verdict) {
  const u = (verdict && verdict._meta && verdict._meta.usage) || {};
  usageTotal.inputTokens += u.inputTokens || 0;
  usageTotal.outputTokens += u.outputTokens || 0;
  usageTotal.cacheCreateTokens += u.cacheCreateTokens || 0;
  usageTotal.cacheReadTokens += u.cacheReadTokens || 0;
  return (verdict && verdict._meta && verdict._meta.costUsd) || 0;
}

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

// Appended to SYSTEM_PROMPT only for long drafts (see LONG_DRAFT_CHARS). A
// 1000–2000 字 draft compressed into a ≤200 字 summary plus three 1–3 句 versions
// loses the specifics — which are exactly what the couple needs to discuss. The
// `detail` field is the second panel that keeps all of it.
//
// Kept as a separate suffix so the cached system prefix stays byte-identical for
// short drafts (the common case); the cache breakpoint sits on the whole system
// block, so appending this only re-caches on the long-draft path.
const LONG_DRAFT_PROMPT = `

9. detail：完整經過 —— 這次的原文很長，summary 與三個版本一定裝不下。請把原文「全部」的內容改寫成一段可以直接給伴侶看的完整敘述：
- 使用者第一人稱「我」的口吻，跟三個版本同一個聲音。
- **不可以摘要、不可以濃縮、不可以只挑重點**。原文提到的每一件事、每一個時間點、每一個具體例子、每一個訴求，都要保留下來，順序依照原文。原文有幾件事就寫幾件事。
- 只做三件事：(a) 拿掉人身攻擊、髒話與絕對化用語（總是/從來/每次/永遠），改寫成具體事實；(b) 把指責句改寫成「我訊息」（我感覺…／對我的影響是…）；(c) 分段，必要時用「第一件事／另外／還有」這類自然的連接詞讓長文好讀。
- 不要新增原文沒有的事實、不要替任何一方辯護或道歉、不要下結論或給建議。
- 長度沒有上限，寧可長也不要漏掉原文的內容。`;

// Drafts at or above this many characters get the `detail` panel. Below it the
// summary + three versions already carry the whole message, and asking for a
// full rewrite would just restate them at extra cost.
const LONG_DRAFT_CHARS = 400;

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

// Long-draft variant: same contract plus the required `detail` panel. Built by
// cloning TOOL_SCHEMA so the two can never drift apart.
const TOOL_SCHEMA_LONG = {
  ...TOOL_SCHEMA,
  input_schema: {
    ...TOOL_SCHEMA.input_schema,
    properties: {
      ...TOOL_SCHEMA.input_schema.properties,
      detail: {
        type: 'string',
        description:
          '完整經過：把原文所有內容逐段改寫成第一人稱敘述，保留每一件事與每一個具體例子，只移除攻擊與絕對化用語。不可摘要或濃縮。',
      },
    },
    required: [...TOOL_SCHEMA.input_schema.required, 'detail'],
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

// The rewrite prompt forbids shortening ("草稿長就改寫得長…不要刪節"), and warm is
// firm plus a sentence, so a max-length 2000-char draft needs room for three
// full-length zh-TW versions. 4096 was not enough: generation stopped mid
// tool_use, the JSON never parsed, and the user got three blank cards.
const REWRITE_MAX_TOKENS = 8192;

function rewriteTooLongError(truncated) {
  // Same code either way (the UI handles it as one recoverable case), but say
  // which one actually happened so the suggested fix is the right one.
  const err = new Error(
    truncated
      ? '草稿太長，AI 改寫沒能完成。請縮短草稿，或分成兩則分開改寫送出。'
      : 'AI 這次沒能產出完整的改寫版本。請再試一次，或稍微調整草稿後重試。'
  );
  err.error_code = 'REWRITE_TOO_LONG';
  err.status = 422;
  return err;
}

// Pull the three versions out of a rewrite response. Reports truncation and any
// blank version instead of quietly substituting '' — a blank version is never a
// usable answer, and silently returning one is what hid this bug.
function parseRewriteResponse(response) {
  const truncated = response?.stop_reason === 'max_tokens';
  const toolUse = (response?.content || []).find(
    (b) => b.type === 'tool_use' && b.name === 'emit_reply_rewrite'
  );
  if (!toolUse) {
    if (truncated) return { out: {}, versions: { neutral: '', firm: '', warm: '' }, truncated: true, blank: ['neutral', 'firm', 'warm'] };
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};
  const versions = {
    neutral: (out.versions?.neutral || '').trim(),
    firm: (out.versions?.firm || '').trim(),
    warm: (out.versions?.warm || '').trim(),
  };
  const blank = Object.keys(versions).filter((k) => !versions[k]);
  return { out, versions, truncated, blank };
}

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

  // Long drafts additionally get the 完整經過 panel. The extra headroom is
  // proportional to the draft: the rewrite restates every point, so it lands
  // near the input's own length rather than at a fixed ceiling.
  const isLongDraft = rawText.trim().length >= LONG_DRAFT_CHARS;
  const maxTokens = isLongDraft
    ? Math.min(16000, 1024 + Math.ceil(rawText.trim().length * 2.5))
    : 1024;

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT + PUNCTUATION_RULE + (isLongDraft ? LONG_DRAFT_PROMPT : ''),
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [isLongDraft ? TOOL_SCHEMA_LONG : TOOL_SCHEMA],
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
    draftChars: rawText.trim().length,
    longDraft: isLongDraft,
    maxTokens,
    stopReason: response.stop_reason,
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_icebreaker');
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  // A detail panel cut off mid-sentence is worse than none: drop it and keep the
  // (complete) summary + versions rather than showing the couple a truncated
  // account of their own argument.
  const detail = (out.detail || '').toString().trim();
  if (isLongDraft && response.stop_reason === 'max_tokens') {
    logWarn('llm.claude.icebreaker.detail_truncated', {
      draftChars: rawText.trim().length,
      outputTokens: u.output_tokens || 0,
      maxTokens,
    });
  }
  const detailOut = response.stop_reason === 'max_tokens' ? '' : detail;

  return {
    title: out.title,
    summary: out.summary,
    detail: detailOut,
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
    max_tokens: REWRITE_MAX_TOKENS,
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

  const parsed = parseRewriteResponse(response);
  if (parsed.truncated || parsed.blank.length > 0) {
    logWarn('llm.claude.reply_rewrite.truncated', {
      draftChars: rawReply.trim().length,
      outputTokens: u.output_tokens || 0,
      maxTokens: REWRITE_MAX_TOKENS,
      stopReason: response.stop_reason,
      blank: parsed.blank,
    });
    throw rewriteTooLongError(parsed.truncated);
  }
  const out = parsed.out;

  return {
    versions: parsed.versions,
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
  const usageTotal = { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 };
  let costTotal = 0;
  let lastModel = MODEL;

  // One counselor generation. `extraDirective`, present only on a judge-triggered
  // regeneration, is appended to the user turn (never the cached system block, so
  // the shared prefix stays byte-identical and cacheable).
  const runOnce = async (extraDirective) => {
    const content = extraDirective ? `${userContent}\n${extraDirective}` : userContent;
    const callStartedAt = Date.now();
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: [WALL_COUNSELOR_TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'emit_wall_counselor_comment' },
      messages: [{ role: 'user', content }],
    });
    const ms = Date.now() - callStartedAt;
    const u = response.usage || {};
    const cost = estimateCostUSD(response.model || MODEL, u);
    lastModel = response.model || MODEL;
    usageTotal.inputTokens += u.input_tokens || 0;
    usageTotal.outputTokens += u.output_tokens || 0;
    usageTotal.cacheCreateTokens += u.cache_creation_input_tokens || 0;
    usageTotal.cacheReadTokens += u.cache_read_input_tokens || 0;
    costTotal += cost || 0;
    logInfo('llm.claude.wall_counselor', {
      model: lastModel,
      companion: companion?.id || null,
      regenerated: Boolean(extraDirective),
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
    return toolUse.input || {};
  };

  let out = await runOnce();

  // Second-layer review: catch 你/我 attribution errors (and fabrication) before
  // the comment is shown, regenerating once with the judge's critique on a hard
  // verdict. Judge + regen cost fold into the returned _meta, so the route still
  // bills one `wall_counselor` unit. Fail-open via judgeResponse.
  if (REFLECTION_JUDGE_ENABLED && out.comment && out.comment.trim()) {
    const verdict = await judgeResponse({
      surface: SURFACE_COUNSELOR,
      context: userContent,
      output: out.comment,
    });
    costTotal += foldJudgeUsage(usageTotal, verdict);
    if (!verdict.pass) {
      const regen = await runOnce(buildJudgeInstruction(verdict.critique));
      const kept = regen.comment && regen.comment.trim() ? regen : out;
      logInfo('llm.claude.reflection_judge.regenerated', {
        surface: SURFACE_COUNSELOR,
        severity: verdict.severity,
        kept: kept === regen ? 'regen' : 'original',
      });
      out = kept;
    }
  }

  return {
    comment: out.comment || '',
    toxicityFlags: out.toxicityFlags || [],
    _meta: {
      provider: 'claude',
      model: lastModel,
      durationMs: Date.now() - startedAt,
      usage: usageTotal,
      costUsd: costTotal,
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
// Appreciation questions ("今天你還喜歡他什麼？")
// ---------------------------------------------------------------------------
// A daily micro-habit: one small, life-like question that nudges you to notice
// one thing you appreciate about your partner today. The curated bank ships on
// the client; this is the "讓 AI 想幾個新的" escape hatch for couples who want a
// fresh batch. The whole point is that these read like a friend nudging you,
// NOT a worksheet ("請表達你對伴侶的感謝") — so the prompt leans hard on
// concrete, everyday, slightly playful moments.
const APPRECIATION_QUESTIONS_SYSTEM_PROMPT = `你是一位很懂生活的伴侶關係設計師。你要為一個叫 Twogether 的 App 想一批「每日小問題」，讓使用者每天回答一題，慢慢養成「看見並感謝另一半」的習慣。請永遠以繁體中文回覆。

任務：想出「八則」不同的每日小問題。

風格守則（很重要）：
- 要非常生活化、口語、具體，像好朋友隨口問你的話，不是問卷或作業。
- 直接爛的範例（不要這樣寫）：「請表達你對伴侶的感謝」「請描述伴侶的優點」。
- 好的方向（可參考語氣，但不要照抄）：「今天有沒有一個瞬間，讓你覺得『還好是他』？」「今天他做了什麼，讓你覺得被照顧？」「今天他有沒有一個很可愛、讓你想多看一眼的瞬間？」「如果今天只能誇他一件事，你會說什麼？」
- 聚焦「今天／最近」的具體小事與小瞬間，避免抽象的大問題。
- 每題簡短，一句話，結尾是問句。
- 用中性的方式指稱另一半（例如「他／TA」），不要假設性別或叫名字。
- 八題角度要有變化：被照顧、覺得可愛、覺得可靠、心動、好笑、感激、重新看見對方的付出…等等。

回應請只呼叫 emit_appreciation_questions tool，不要輸出其他文字。`;

const APPRECIATION_QUESTIONS_TOOL_SCHEMA = {
  name: 'emit_appreciation_questions',
  description: 'Return eight short, natural, everyday daily-appreciation questions in zh-TW.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 6,
        maxItems: 8,
        items: { type: 'string', description: '一句話的每日小問題，口語、具體、以問號結尾' },
      },
    },
    required: ['questions'],
  },
};

async function generateAppreciationQuestions({ avoid } = {}) {
  const lines = [];
  lines.push('請想一批全新的每日小問題。');
  if (Array.isArray(avoid) && avoid.length) {
    lines.push('');
    lines.push('以下這些問題已經出現過，請不要重複、也盡量換不同的角度：');
    for (const q of avoid.slice(0, 40)) lines.push(`- ${q}`);
  }
  const userContent = lines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: APPRECIATION_QUESTIONS_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [APPRECIATION_QUESTIONS_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_appreciation_questions' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.appreciation_questions', {
    model: response.model || MODEL,
    avoidCount: Array.isArray(avoid) ? avoid.length : 0,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_appreciation_questions'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input;

  return {
    questions: Array.isArray(out.questions) ? out.questions.filter((q) => typeof q === 'string' && q.trim()) : [],
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

任務：閱讀整段對話脈絡，然後「只針對我請你翻譯的那幾則訊息（用編號指定）」，各自產出：
1. ref：對應訊息的編號（提示中每行開頭的 #N，原封不動回傳那個數字）。
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
  description: "Return an emotion/need translation for each requested message ref.",
  input_schema: {
    type: 'object',
    properties: {
      translations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            // Short integer ref (the #N shown in the prompt), mapped back to
            // the real message id server-side. Integers are far more reliable
            // for the model to echo than 36-char UUIDs.
            ref: { type: 'integer', description: '對應訊息的編號（提示中的 #N），原封不動回傳' },
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
            // maxLength matters: without it the model matches the length of the
            // source message, and a thread of long comments overran max_tokens —
            // which truncated the whole tool_use JSON and dropped every
            // translation silently. The prompt already asks for 1 to 2 sentences.
            rewrite: { type: 'string', maxLength: 120, description: '第一人稱「可能真正想表達的是」翻譯，1 到 2 句' },
          },
          required: ['ref', 'need', 'rewrite'],
        },
      },
    },
    required: ['translations'],
  },
};

// Output budget for one translation batch. A single item costs roughly 200
// output tokens (3 emotions + need + a rewrite capped at 120 chars), so 6
// targets fit inside 4096 with a wide margin.
const TRANSLATION_MAX_TOKENS = 4096;
const TRANSLATION_CHUNK_SIZE = 6;
const TRANSLATION_CONCURRENCY = 3;
// Messages that are only context for this chunk get clipped: a wall post can be
// 6000 chars, and resending every one of them in full on every chunk is what
// makes this call slow and expensive. Targets always go in whole.
const TRANSLATION_CONTEXT_CHARS = 300;

// Split target refs into batches small enough that the model's reply cannot
// overrun max_tokens. Exported for tests.
function chunkTargets(refs, size = TRANSLATION_CHUNK_SIZE) {
  const list = Array.isArray(refs) ? refs : [];
  const step = Math.max(1, size);
  const out = [];
  for (let i = 0; i < list.length; i += step) out.push(list.slice(i, i + step));
  return out;
}

// Pull the translations out of one Claude response and map short refs back to
// real message ids. Returns `truncated` so callers can tell "the model had
// nothing to say" apart from "the model was cut off mid-JSON" — the latter used
// to look identical and silently produced zero translations. Exported for tests.
function parseTranslationResponse(response, refToId) {
  const truncated = response?.stop_reason === 'max_tokens';
  const toolUse = (response?.content || []).find(
    (b) => b.type === 'tool_use' && b.name === 'emit_thread_translations'
  );
  if (!toolUse) {
    // A truncated response can stop before any complete block exists. That is a
    // known, recoverable state (the caller retries smaller), not a provider bug.
    if (truncated) return { translations: [], truncated: true, returnedRefs: [] };
    throw new Error('Claude did not return a tool_use block');
  }
  // When generation stops mid tool_use the partial JSON is unparseable, so the
  // API hands back an empty/partial input rather than the array we asked for.
  const out = toolUse.input || {};
  const rawList = Array.isArray(out.translations) ? out.translations : [];
  const translations = rawList
    .map((t) => {
      // Accept the ref as number or numeric string; map back to the real id.
      const ref = typeof t?.ref === 'number' ? t.ref : parseInt(t?.ref, 10);
      const id = refToId.get(ref);
      if (!id || typeof t.rewrite !== 'string' || !t.rewrite.trim()) return null;
      return {
        id,
        emotions: Array.isArray(t.emotions)
          ? t.emotions
              .filter((e) => e && typeof e.label === 'string')
              .slice(0, 3)
              .map((e) => ({ label: e.label.trim(), intensity: Math.max(0, Math.min(100, Number(e.intensity) || 0)) }))
          : [],
        need: (t.need || '').toString().trim(),
        rewrite: t.rewrite.trim(),
      };
    })
    .filter(Boolean);

  return { translations, truncated, returnedRefs: rawList.map((t) => t?.ref) };
}

// Run `worker` over `items` with at most `limit` in flight. Chunks are
// independent calls, so overlapping them keeps a long thread inside the 45s
// client timeout instead of adding ~17s per chunk.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// messages: [{ id, speaker: '[A]'|'[B]'|nickname, content }] — the full thread
//   for context. targetIds: which message ids to actually translate (the ones
//   not yet cached). context: { summary } optional topic to ground the model.
async function generateThreadTranslations({ messages, targetIds, context }) {
  const all = Array.isArray(messages) ? messages : [];
  const wanted = Array.isArray(targetIds) && targetIds.length > 0
    ? targetIds
    : all.map((m) => m.id);
  if (wanted.length === 0) {
    return {
      translations: [],
      _meta: {
        provider: 'claude', model: MODEL, durationMs: 0, usage: {}, costUsd: 0,
        chunks: 0, truncatedChunks: 0, requested: 0, returned: 0, truncated: false,
      },
    };
  }

  // Relabel messages with short integer refs (#1, #2…) for the model, and keep
  // a ref→real-id map. Models echo small integers reliably; full UUIDs they do
  // not, which silently dropped every translation before.
  const refToId = new Map();
  const idToRef = new Map();
  all.forEach((m, i) => {
    const ref = i + 1;
    refToId.set(ref, m.id);
    idToRef.set(m.id, ref);
  });
  const wantedRefs = wanted.map((id) => idToRef.get(id)).filter((r) => r != null);

  // The thread is rendered per chunk: this chunk's targets in full, everything
  // else clipped to keep the input (and the latency) down.
  const buildUserContent = (chunkRefs, extraDirective) => {
    const targetSet = new Set(chunkRefs);
    const lines = [];
    if (context && context.summary) {
      lines.push(`事件背景（僅供理解氛圍，不要複述）：${String(context.summary).trim()}`, '');
    }
    lines.push('完整對話（最舊在前，每行標了編號與發話者）：');
    all.forEach((m, i) => {
      const ref = i + 1;
      const text = (m.content || '').toString().trim();
      const body = targetSet.has(ref) || text.length <= TRANSLATION_CONTEXT_CHARS
        ? text
        : `${text.slice(0, TRANSLATION_CONTEXT_CHARS)}…（略）`;
      lines.push(`#${ref} ${m.speaker || '某人'}：${body}`);
    });
    lines.push('');
    lines.push(`請只翻譯以下編號的訊息：${chunkRefs.map((r) => `#${r}`).join('、')}`);
    // On a judge-triggered regeneration, the critique is appended so the model
    // fixes the specific perspective/attribution error it was flagged for.
    if (extraDirective) lines.push(extraDirective);
    return lines.join('\n');
  };

  // Render this chunk's translations back for the judge, each paired with its
  // source line + speaker so the judge can check that every first-person "我"
  // sits in the right speaker's voice.
  const renderTranslationsForJudge = (translations) =>
    translations
      .map((t) => {
        const ref = idToRef.get(t.id);
        const src = ref != null ? all[ref - 1] : null;
        const speaker = (src && src.speaker) || '某人';
        const srcText = (src && (src.content || '').toString().trim()) || '';
        return `#${ref} ${speaker} 原句：${srcText}\n    → 翻譯（第一人稱）：${t.rewrite}`;
      })
      .join('\n');

  const startedAt = Date.now();
  const usageTotal = { inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 };
  let costTotal = 0;
  let callCount = 0;
  let truncatedChunks = 0;
  let lastModel = MODEL;
  const prompts = [];

  // One request for one batch of refs. Returns whatever parsed plus whether the
  // model was cut off, so the caller can retry that batch smaller.
  const callChunk = async (chunkRefs, extraDirective) => {
    const userContent = buildUserContent(chunkRefs, extraDirective);
    prompts.push(userContent);
    const callStartedAt = Date.now();
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: TRANSLATION_MAX_TOKENS,
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

    const ms = Date.now() - callStartedAt;
    const u = response.usage || {};
    const cost = estimateCostUSD(response.model || MODEL, u);
    callCount += 1;
    lastModel = response.model || MODEL;
    usageTotal.inputTokens += u.input_tokens || 0;
    usageTotal.outputTokens += u.output_tokens || 0;
    usageTotal.cacheCreateTokens += u.cache_creation_input_tokens || 0;
    usageTotal.cacheReadTokens += u.cache_read_input_tokens || 0;
    costTotal += cost || 0;
    logInfo('llm.claude.need_translation', {
      model: lastModel,
      requested: chunkRefs.length,
      durationMs: ms,
      inputTokens: u.input_tokens || 0,
      outputTokens: u.output_tokens || 0,
      cacheCreate: u.cache_creation_input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      costUsd: cost,
    });

    const parsed = parseTranslationResponse(response, refToId);
    logInfo('llm.claude.need_translation.map', {
      requestedRefs: chunkRefs,
      returnedRefs: parsed.returnedRefs,
      matched: parsed.translations.length,
      unmatched: parsed.returnedRefs.length - parsed.translations.length,
      truncated: parsed.truncated,
    });
    return parsed;
  };

  // Second-layer review for one chunk: judge the translations, and on a hard
  // verdict (a 你/我 perspective/attribution error) regenerate this chunk once
  // with the critique. Judge + regen tokens are folded into the run totals, so
  // the whole thing still bills as one `need_translation` unit. Never lowers the
  // item count (a regen can't lose ground). Fail-open via judgeResponse.
  const judgeAndMaybeRegenerate = async (chunkRefs, translations) => {
    if (!REFLECTION_JUDGE_ENABLED || translations.length === 0) return translations;
    const verdict = await judgeResponse({
      surface: SURFACE_TRANSLATION,
      context: buildUserContent(chunkRefs),
      output: renderTranslationsForJudge(translations),
    });
    costTotal += foldJudgeUsage(usageTotal, verdict);
    if (verdict.pass) return translations;

    const regen = await callChunk(chunkRefs, buildJudgeInstruction(verdict.critique));
    const improved = regen.translations.length >= translations.length
      ? regen.translations
      : translations;
    logInfo('llm.claude.reflection_judge.regenerated', {
      surface: SURFACE_TRANSLATION,
      refs: chunkRefs,
      severity: verdict.severity,
      before: translations.length,
      after: regen.translations.length,
      kept: improved === regen.translations ? 'regen' : 'original',
    });
    return improved;
  };

  // Chunks are sized so this should not happen; if it does, halve the batch once
  // rather than returning nothing.
  const translateChunk = async (chunkRefs) => {
    const parsed = await callChunk(chunkRefs);
    let translations = parsed.translations;

    if (parsed.truncated) {
      truncatedChunks += 1;
      logWarn('llm.claude.need_translation.truncated', {
        refs: chunkRefs,
        maxTokens: TRANSLATION_MAX_TOKENS,
        matched: parsed.translations.length,
      });
      if (chunkRefs.length >= 2) {
        const mid = Math.ceil(chunkRefs.length / 2);
        const halves = await Promise.all([
          callChunk(chunkRefs.slice(0, mid)),
          callChunk(chunkRefs.slice(mid)),
        ]);
        halves.forEach((h) => { if (h.truncated) truncatedChunks += 1; });
        const retried = halves.flatMap((h) => h.translations);
        // Keep whichever attempt produced more, so a retry can never lose ground.
        translations = retried.length >= parsed.translations.length ? retried : parsed.translations;
      }
    }

    return judgeAndMaybeRegenerate(chunkRefs, translations);
  };

  const chunks = chunkTargets(wantedRefs, TRANSLATION_CHUNK_SIZE);
  const perChunk = await mapWithConcurrency(chunks, TRANSLATION_CONCURRENCY, translateChunk);

  // Later chunks win on the (impossible in practice) duplicate ref.
  const byId = new Map();
  perChunk.flat().forEach((t) => byId.set(t.id, t));
  const translations = [...byId.values()];

  return {
    translations,
    _meta: {
      provider: 'claude',
      model: lastModel,
      durationMs: Date.now() - startedAt,
      usage: usageTotal,
      costUsd: costTotal,
      chunks: callCount,
      truncatedChunks,
      truncated: truncatedChunks > 0,
      requested: wantedRefs.length,
      returned: translations.length,
      assembledPrompt: prompts.join('\n\n---\n\n'),
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
// Draft analysis ("即時情緒檢測") — per-message emotion meter for the composer
// ---------------------------------------------------------------------------
// Before a charged reply is sent, show the writer what it will actually do:
// the layered emotions (with intensity), how the partner is likely to MIShear
// it versus the real worry underneath, the need driving it, and a rewrite that
// says the need instead of the attack. This is the "每一句訊息都有 AI 評估" panel.

const DRAFT_ANALYSIS_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師，正在幫一個人「送出訊息前」檢查這句話。使用者打了一段要傳給伴侶的草稿，可能情緒還沒整理好。請永遠以繁體中文回覆。

你的工作不是評斷對錯，而是幫使用者看見這句話送出去會發生什麼，然後給一個更靠近彼此的版本。請產出：
1. emotions：這句話底層的情緒，最多 3 個，由表層到深層。每個含 label（情緒名，繁體中文）、emoji（一個對應的表情符號）、intensity（0 到 100 的整數強度）。
2. partnerHears.misread：對方在情緒中最可能「誤聽」成的攻擊訊息（一句話，通常比原文更刺，例如「你很爛」「你不在乎我」）。
3. partnerHears.real：這句話底下，對方其實該聽見的真正擔心或渴望（一句話，脆弱、真實，例如「你是不是不要這個家了？」）。
4. need：使用者這句話底層的核心需求，簡短（例如：安全感、被重視、被陪伴、被理解）。
5. rewrite：把這句話改寫成說出需求而非攻擊的版本，第一人稱、溫柔但真實，1 到 2 句（例如「我今天很想你，不知道你今晚會不會回來？」）。
6. toxicityFlags：偵測到的問題語言（可為空）。

守則：緊扣使用者草稿真正的立場與感受，不要編造新的指控；不要說教、不要罵使用者；只使用繁體中文；遵守標點規則。

回應請只呼叫 emit_draft_analysis tool，不要輸出其他文字。`;

const DRAFT_ANALYSIS_TOOL_SCHEMA = {
  name: 'emit_draft_analysis',
  description: 'Return the per-message emotion meter for a reply draft.',
  input_schema: {
    type: 'object',
    properties: {
      emotions: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', maxLength: 10 },
            emoji: { type: 'string', maxLength: 4 },
            intensity: { type: 'integer', minimum: 0, maximum: 100 },
          },
          required: ['label', 'emoji', 'intensity'],
        },
      },
      partnerHears: {
        type: 'object',
        properties: {
          misread: { type: 'string', description: '對方最可能誤聽成的攻擊，一句話' },
          real: { type: 'string', description: '底下真正該被聽見的擔心或渴望，一句話' },
        },
        required: ['misread', 'real'],
      },
      need: { type: 'string', maxLength: 20 },
      rewrite: { type: 'string', description: '說出需求而非攻擊的改寫版本，1 到 2 句' },
      toxicityFlags: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'absolute_language', 'name_calling', 'verbal_aggression', 'contempt',
            'threats', 'blame_shifting', 'emotional_blackmail', 'sarcasm',
            'catastrophizing', 'comparison', 'stonewalling', 'dismissiveness',
          ],
        },
      },
    },
    required: ['emotions', 'partnerHears', 'need', 'rewrite', 'toxicityFlags'],
  },
};

// draft: the in-progress reply text. eventSummary / recentMessages give the
// model the conflict context so partnerHears is grounded in this relationship.
async function analyzeDraft({ draft, eventSummary, recentMessages, userGender = null, partnerGender = null }) {
  if (typeof draft !== 'string' || draft.trim().length === 0) {
    throw new Error('draft is required');
  }

  const lines = [
    '角色說明：',
    '- [你] = 正在寫這句話、準備送出的人',
    '- [對方] = 你的伴侶（會收到這句話的人）',
    ...[genderHint(userGender, '- [你] '), genderHint(partnerGender, '- [對方] ')].filter(Boolean),
    '',
  ];
  if (eventSummary && typeof eventSummary === 'string') {
    lines.push(`事件背景：${eventSummary.trim()}`, '');
  }
  if (Array.isArray(recentMessages) && recentMessages.length > 0) {
    lines.push('最近對話（最舊在前，每行已標註發話者）：');
    for (const m of recentMessages) {
      lines.push(`${m.fromSelf ? '[你]' : '[對方]'}：${(m.content || '').trim()}`);
    }
    lines.push('');
  }
  lines.push('[你正準備送出的草稿]：', draft.trim());
  const userContent = lines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: DRAFT_ANALYSIS_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [DRAFT_ANALYSIS_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_draft_analysis' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.draft_analysis', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_draft_analysis'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};

  return {
    emotions: (Array.isArray(out.emotions) ? out.emotions : [])
      .filter((e) => e && e.label)
      .slice(0, 3)
      .map((e) => ({
        label: e.label.toString().trim(),
        emoji: (e.emoji || '💭').toString().trim(),
        intensity: Math.max(0, Math.min(100, Number(e.intensity) || 0)),
      })),
    partnerHears: {
      misread: (out.partnerHears?.misread || '').toString().trim(),
      real: (out.partnerHears?.real || '').toString().trim(),
    },
    need: (out.need || '').toString().trim(),
    rewrite: (out.rewrite || '').toString().trim(),
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

// ---------------------------------------------------------------------------
// Therapy Mode summary ("諮商摘要") — the between-sessions digest
// ---------------------------------------------------------------------------
// Twogether is a Therapy Companion: the couple sees a therapist for ~1 hour a
// week, and the real work happens in the other 167. This turns a window of
// events into a summary the couple can bring INTO their next session, so the
// therapist doesn't spend 30 minutes gathering what happened. It is NOT advice
// and NOT a diagnosis — it organizes, and it hands the couple three questions
// worth raising with a professional.

const THERAPY_SUMMARY_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師的助理。一對伴侶在過去一段期間記錄了幾次衝突與溝通事件，他們準備帶著這份整理進入下一次的心理諮商。請閱讀事件清單與已算好的統計，為他們寫一份「諮商摘要」(Therapy Summary)。請永遠以繁體中文回覆。

這份摘要的目的：讓他們進諮商室時，心理師不用從頭蒐集資訊，可以更快進入真正有價值的討論。你只做「整理」，不做診斷、不下指令、不評斷對錯、不選邊站。真正的治療由合格心理師負責。

請產出：
1. overview：一句話，中性地描述這段期間他們的關係狀態或最需要被看見的模式（不責備任一方）。
2. themes：這段期間最常出現的衝突主題，2 到 4 項；用已提供的主題統計為基礎，把它翻成人看得懂的短語（例如「家務分配」「回訊息的節奏」）。
3. emotions：雙方這段期間最常感受到的情緒，2 到 4 項；用已提供的情緒統計為基礎。
4. repaired：這段期間「已經成功修復」的事件（status 為 resolved），各附一句他們做對了什麼讓彼此靠近；若沒有，回傳空陣列。
5. unresolved：這段期間「還沒解決」的事件，各附一句還卡在哪裡、可能還需要處理的點；若沒有，回傳空陣列。
6. questions：三個「想帶去和心理師討論的問題」，具體、扣著上面的模式、用第一人稱複數（我們），讓伴侶可以直接照著問（例如「我們每次談到家務就會升溫，可以怎麼開始這個對話？」）。

守則：緊扣提供的事件內容，不要編造；中立、溫柔；只使用繁體中文；遵守標點規則。

回應請只呼叫 emit_therapy_summary tool，不要輸出其他文字。`;

const THERAPY_SUMMARY_TOOL_SCHEMA = {
  name: 'emit_therapy_summary',
  description: 'Return a structured between-sessions therapy summary the couple can bring to their next counseling session.',
  input_schema: {
    type: 'object',
    properties: {
      overview: { type: 'string', description: '一句話中性描述這段期間的關係模式' },
      themes: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string', maxLength: 20, description: '一個衝突主題的人看得懂短語' },
      },
      emotions: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string', maxLength: 12, description: '一個常見情緒詞' },
      },
      repaired: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '事件標題' },
            insight: { type: 'string', description: '他們做對了什麼讓彼此靠近，一句話' },
          },
          required: ['title', 'insight'],
        },
      },
      unresolved: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '事件標題' },
            note: { type: 'string', description: '還卡在哪裡、可能還需要處理的點，一句話' },
          },
          required: ['title', 'note'],
        },
      },
      questions: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string', description: '想帶去和心理師討論的一個問題，第一人稱複數' },
      },
    },
    required: ['overview', 'themes', 'emotions', 'repaired', 'unresolved', 'questions'],
  },
};

// events: [{ title, summary, status, tags, emotions, createdAt, resolvedAt, therapyNote }]
// stats:  { themeCounts:[{tag,count}], emotionCounts:[{emotion,count}], repairedCount, unresolvedCount }
async function generateTherapySummary({ periodLabel, events, stats }) {
  const evs = Array.isArray(events) ? events : [];
  const lines = [];
  lines.push(`期間：${periodLabel || '最近兩週'}`);
  lines.push(`事件總數：${evs.length}（已解決 ${stats?.repairedCount ?? 0}，未解決 ${stats?.unresolvedCount ?? 0}）`, '');

  const themeCounts = stats?.themeCounts || [];
  if (themeCounts.length) {
    lines.push('主題統計（標籤：次數）：' + themeCounts.map((t) => `${t.tag}×${t.count}`).join('、'));
  }
  const emotionCounts = stats?.emotionCounts || [];
  if (emotionCounts.length) {
    lines.push('情緒統計（情緒：次數）：' + emotionCounts.map((e) => `${e.emotion}×${e.count}`).join('、'));
  }
  lines.push('', '事件清單（最舊在前）：');
  evs.forEach((e, i) => {
    const state = e.status === 'resolved' ? '已解決' : '未解決';
    lines.push(`${i + 1}. [${state}]《${(e.title || '未命名').toString().trim()}》`);
    if (e.summary) lines.push(`   摘要：${e.summary.toString().trim()}`);
    if (Array.isArray(e.tags) && e.tags.length) lines.push(`   主題：${e.tags.join('、')}`);
    if (Array.isArray(e.emotions) && e.emotions.length) lines.push(`   情緒：${e.emotions.join('、')}`);
    if (e.therapyNote && e.therapyNote.nextTime) lines.push(`   當時的修復重點：${e.therapyNote.nextTime}`);
  });
  const userContent = lines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1800,
    system: [
      {
        type: 'text',
        text: THERAPY_SUMMARY_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [THERAPY_SUMMARY_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_therapy_summary' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.therapy_summary', {
    model: response.model || MODEL,
    durationMs: ms,
    eventCount: evs.length,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_therapy_summary'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};
  const cleanStr = (s) => (s || '').toString().trim();
  const cleanList = (arr, max) =>
    (Array.isArray(arr) ? arr : []).map(cleanStr).filter(Boolean).slice(0, max);
  const cleanPairs = (arr, k, max) =>
    (Array.isArray(arr) ? arr : [])
      .filter((r) => r && r.title && r[k])
      .map((r) => ({ title: cleanStr(r.title), [k]: cleanStr(r[k]) }))
      .slice(0, max);

  return {
    overview: cleanStr(out.overview),
    themes: cleanList(out.themes, 4),
    emotions: cleanList(out.emotions, 4),
    repaired: cleanPairs(out.repaired, 'insight', 6),
    unresolved: cleanPairs(out.unresolved, 'note', 6),
    questions: cleanList(out.questions, 3),
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
// Therapy Topics ("話題建議") — proactive discussion topics for the NEXT session
// ---------------------------------------------------------------------------
// The Therapy Summary above organizes what already happened. This looks
// forward: even when nothing dramatic happened recently, it hands the couple
// 3-5 things worth raising with their therapist. "No conflict" is not the
// same as "no relationship problem" — a quiet couple should still get real,
// grounded topics, never an empty result.

const THERAPY_TOPICS_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師的助理。這對伴侶固定接受心理諮商，你的任務是在他們下次諮商「之前」，根據最近記錄的事件，主動整理出 3 到 5 個「值得帶去諮商聊聊」的話題——即使最近沒有明顯衝突。請永遠以繁體中文回覆。

重要守則（務必遵守，這是本功能的倫理紅線）：
- 你只是「發現」值得聊的方向，不是「診斷」。永遠不要說『你們的關係有問題』『這是不健康的』等評斷語言；只能說『這可能值得聊聊』『這是一個可以一起探索的地方』。真正的判斷與探索交給合格心理師，你只負責整理出方向。
- 不評斷對錯、不選邊站、不指定是誰該改變。
- 若最近沒有明顯衝突（quiet 為 true），這是好消息，不是沒東西可聊——intro 請傳達「最近很平靜，這是好事，但平靜不代表沒有話題可聊」這樣安心＋邀請的語氣，接著從較舊的未解決事件、或一般關係維繫角度（感謝表達、各自需求是否被看見、未來的小計畫、親密感）提供建議，不要編造沒發生過的具體衝突。

請產出：
1. intro：一句話開場，中性、溫暖，視 quiet 狀態調整語氣（見上）。
2. topics：3 到 5 個話題，每個包含：
   - title：話題名稱，簡短（例如「家務分工的期待落差」）。
   - whySuggested：為什麼建議這個話題，一句話，緊扣提供的事件/統計資料，不評對錯。
   - prompts：2 到 4 個「可以直接照著聊」的具體引導問題或練習，第一人稱複數（我們）。

守則：緊扣提供的資料，不要編造具體事件細節；中立、溫柔；只使用繁體中文；遵守標點規則。

回應請只呼叫 emit_therapy_topics tool，不要輸出其他文字。`;

const THERAPY_TOPICS_TOOL_SCHEMA = {
  name: 'emit_therapy_topics',
  description: 'Return 3-5 suggested discussion topics for the couple\'s next therapy session, grounded in their recent events.',
  input_schema: {
    type: 'object',
    properties: {
      intro: { type: 'string', maxLength: 150, description: '一句話開場，視 quiet 狀態調整語氣' },
      topics: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 20, description: '話題名稱' },
            whySuggested: { type: 'string', maxLength: 100, description: '為什麼建議這個話題，緊扣資料' },
            prompts: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: { type: 'string', maxLength: 60, description: '可以直接照著聊的引導問題' },
            },
          },
          required: ['title', 'whySuggested', 'prompts'],
        },
      },
    },
    required: ['intro', 'topics'],
  },
};

// events: [{ title, summary, status, tags, emotions, createdAt, resolvedAt, therapyNote }]
// stats:  { themeCounts, emotionCounts, resolvedCount, unresolvedCount, daysSinceLastEvent }
async function generateTherapyTopics({ periodLabel, appliedDays, events, stats, quiet }) {
  const evs = Array.isArray(events) ? events : [];
  const lines = [];
  lines.push(
    quiet
      ? `本次分析：最近衝突不多，已放寬到過去 ${appliedDays || 60} 天內尚未解決的事件（quiet 模式）`
      : `期間：${periodLabel || '最近兩週'}`
  );
  lines.push(`事件總數：${evs.length}`, '');

  const themeCounts = stats?.themeCounts || [];
  if (themeCounts.length) {
    lines.push('主題統計（標籤：次數）：' + themeCounts.map((t) => `${t.tag}×${t.count}`).join('、'));
  }
  const emotionCounts = stats?.emotionCounts || [];
  if (emotionCounts.length) {
    lines.push('情緒統計（情緒：次數）：' + emotionCounts.map((e) => `${e.emotion}×${e.count}`).join('、'));
  }
  if (typeof stats?.daysSinceLastEvent === 'number') {
    lines.push(`距離上一次記錄事件：${stats.daysSinceLastEvent} 天`);
  }
  if (evs.length) {
    lines.push('', '事件清單（最舊在前）：');
    evs.forEach((e, i) => {
      const state = e.status === 'resolved' ? '已解決' : '未解決';
      lines.push(`${i + 1}. [${state}]《${(e.title || '未命名').toString().trim()}》`);
      if (e.summary) lines.push(`   摘要：${e.summary.toString().trim()}`);
      if (Array.isArray(e.tags) && e.tags.length) lines.push(`   主題：${e.tags.join('、')}`);
      if (Array.isArray(e.emotions) && e.emotions.length) lines.push(`   情緒：${e.emotions.join('、')}`);
    });
  } else {
    lines.push('', '（目前沒有可參考的事件紀錄，請提供一般性的關係維繫話題。）');
  }
  const userContent = lines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: THERAPY_TOPICS_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [THERAPY_TOPICS_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_therapy_topics' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.therapy_topics', {
    model: response.model || MODEL,
    durationMs: ms,
    eventCount: evs.length,
    quiet: !!quiet,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_therapy_topics'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};
  const cleanStr = (s) => (s || '').toString().trim();
  const cleanList = (arr, max) =>
    (Array.isArray(arr) ? arr : []).map(cleanStr).filter(Boolean).slice(0, max);
  const cleanTopics = (arr, max) =>
    (Array.isArray(arr) ? arr : [])
      .filter((t) => t && t.title && t.whySuggested && Array.isArray(t.prompts))
      .map((t) => ({
        title: cleanStr(t.title),
        whySuggested: cleanStr(t.whySuggested),
        prompts: cleanList(t.prompts, 4),
      }))
      .filter((t) => t.prompts.length >= 2)
      .slice(0, max);

  const topics = cleanTopics(out.topics, 5);
  // The whole contract of this feature is "never empty". If cleaning stripped
  // everything (malformed / too-short model output), throw so the route's
  // catch surfaces a retryable error — instead of caching an empty set (which
  // would be charged AND permanently returned for this input hash).
  if (!topics.length) {
    throw new Error('Claude returned no usable therapy topics');
  }

  return {
    intro: cleanStr(out.intro),
    topics,
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
// Communication-pattern summary ("溝通模式" 第三方視角) — cross-conflict lens
// ---------------------------------------------------------------------------
// Single conflicts each get their own therapy note (with a per-event `cycle`).
// This zooms out: reading several resolved events' cycles, toxicity flags and
// themes, it names the ONE recurring loop the couple keeps falling into (like a
// counselor who has watched them argue a few times), gently flags the rational
// wrapping that hides sarcasm, and offers one small practice to step out of it.
// This is the "模式" principle (see src/content/communicationPrinciples.ts).

const COMMUNICATION_PATTERN_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師。你已經看過這對伴侶最近幾次衝突的整理筆記（每次的觸發點、真正的需求、當次的負向循環），現在請像一個看過他們吵過幾次架的第三方，幫他們看見「反覆出現的溝通模式」。請永遠以繁體中文回覆。

請產出：
1. recurringCycle：他們最常反覆落入的那一個循環，3 到 5 個很短的步驟，呈現彼此如何一來一往把對方推遠（例如：一方追問 → 另一方退縮 → 追得更急 → 更加沉默）。每步 6 字內，這是跨多次衝突「最常見」的那一種，不是某一次的流水帳。
2. signals：1 到 3 個溫和、中立的觀察，點出容易被忽略的訊號。若資料顯示常出現諷刺、輕蔑、翻舊帳、或「總是／從來」這類絕對化語言，可以溫和說出來（例如「理性的話語底下，偶爾帶著一點酸」）。只描述現象，不評對錯、不指定是誰的錯。若沒有明顯訊號，回傳空陣列。
3. exitTip：一個「一起跳出這個循環」的小練習或一句可以照著說的話，第一人稱、溫柔、具體可做（例如「當我發現自己開始追問，我先深呼吸，說：我不是要質問你，我只是有點慌」）。

守則：緊扣提供的資料，不要編造；中立、不評斷對錯、不選邊站；把焦點放在「你們一起」跳出循環，不是誰要改；只使用繁體中文；遵守標點規則。

回應請只呼叫 emit_communication_pattern tool，不要輸出其他文字。`;

const COMMUNICATION_PATTERN_TOOL_SCHEMA = {
  name: 'emit_communication_pattern',
  description: "Return the couple's recurring communication pattern across several resolved conflicts.",
  input_schema: {
    type: 'object',
    properties: {
      recurringCycle: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string', maxLength: 12, description: '循環的一步，例如「小湘 追問」' },
      },
      signals: {
        type: 'array',
        maxItems: 3,
        items: { type: 'string', description: '一個溫和中立的觀察，不評對錯' },
      },
      exitTip: { type: 'string', description: '一起跳出循環的小練習或一句話，第一人稱' },
    },
    required: ['recurringCycle', 'signals', 'exitTip'],
  },
};

// events: [{ title, trigger, needs, cycle, toxicityFlags, tags }] — recent
// resolved events. stats: { cycleStepCounts, toxicityCounts, themeCounts }.
async function generateCommunicationPatternSummary({ events, stats }) {
  const evs = Array.isArray(events) ? events : [];
  const lines = [];
  lines.push(`已解決的衝突數：${evs.length}`, '');
  const fmtCounts = (arr, key) =>
    (arr || [])
      .map((x) => `${x[key]}×${x.count}`)
      .join('、') || '（無）';
  lines.push(`常見的負向循環步驟：${fmtCounts(stats?.cycleStepCounts, 'step')}`);
  lines.push(`出現過的語言訊號（toxicity flags）：${fmtCounts(stats?.toxicityCounts, 'flag')}`);
  lines.push(`常見主題：${fmtCounts(stats?.themeCounts, 'tag')}`, '');
  lines.push('每次衝突的整理筆記：');
  evs.forEach((e, i) => {
    lines.push(`【第 ${i + 1} 次】${e.title || '未命名'}`);
    if (e.trigger) lines.push(`  觸發點：${e.trigger}`);
    if (Array.isArray(e.needs) && e.needs.length) {
      lines.push(`  真正的需求：${e.needs.map((n) => `${n.who} 需要 ${n.need}`).join('、')}`);
    }
    if (Array.isArray(e.cycle) && e.cycle.length) {
      lines.push(`  當次循環：${e.cycle.join(' → ')}`);
    }
    if (Array.isArray(e.toxicityFlags) && e.toxicityFlags.length) {
      lines.push(`  語言訊號：${e.toxicityFlags.join('、')}`);
    }
  });
  const userContent = lines.join('\n');

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: [
      {
        type: 'text',
        text: COMMUNICATION_PATTERN_SYSTEM_PROMPT + PUNCTUATION_RULE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [COMMUNICATION_PATTERN_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_communication_pattern' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.communication_pattern', {
    model: response.model || MODEL,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_communication_pattern'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }
  const out = toolUse.input || {};

  return {
    recurringCycle: (Array.isArray(out.recurringCycle) ? out.recurringCycle : [])
      .map((s) => (s || '').toString().trim())
      .filter(Boolean),
    signals: (Array.isArray(out.signals) ? out.signals : [])
      .map((s) => (s || '').toString().trim())
      .filter(Boolean),
    exitTip: (out.exitTip || '').toString().trim(),
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
// 一起收尾 (closure) — 幫我想一個 + AI 見解
// ---------------------------------------------------------------------------
// Both calls come AFTER the humans have done the talking, which is the whole
// point of the closure design: the couple writes, the AI comments. The assist
// is opt-in (a user who knows what to write never spends a token) and the
// insight fires once, after the event has already resolved.

const CLOSURE_ASSIST_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師。一對伴侶剛談完一次衝突，正在一起收尾：他們要各自寫下「下次我願意做的一件小事」，以及一個「下次這種情況我們怎麼辦」的共同決定。使用者按了「幫我想一個」，請給他 2 到 3 個可以直接改成自己的話的方向。請永遠以繁體中文回覆。

守則：
1. 只寫未來，不寫過去。不要總結這次誰對誰錯，不要重述衝突。
2. 具體到可以錄影。「即使很生氣，也不在人前責罵你」可以；「我要更愛你」「我會多體諒」不行。
3. 小到這幾天就做得到。不要是需要對方配合才成立的大計畫。
4. field 是 commitment 時，每一句都用第一人稱「我會…」「即使…，我也…」，主詞是使用者自己，絕不要求對方做任何事。
5. field 是 decision 時，每一句都用「我們…」，描述下次的做法或當下由誰做最後決定，兩個人都同意才有意義。
6. 每句 ${MAX_ASSIST_OPTION_CHARS} 字以內，不評斷對錯、不選邊站、不說教。
7. 寫 commitment 時，扣著「對方說他需要什麼」去想 — 接得住對方需要的承諾才有用，泛泛的好話沒有用。

回應請只呼叫 emit_closure_assist tool，不要輸出其他文字。`;

const CLOSURE_ASSIST_TOOL_SCHEMA = {
  name: 'emit_closure_assist',
  description: 'Return 2-3 short candidate sentences for a closure commitment or shared decision.',
  input_schema: {
    type: 'object',
    properties: {
      options: {
        type: 'array',
        minItems: 2,
        maxItems: MAX_ASSIST_OPTIONS,
        items: {
          type: 'string',
          maxLength: MAX_ASSIST_OPTION_CHARS,
          description: '一個具體、可觀察、面向未來的句子',
        },
      },
    },
    required: ['options'],
  },
};

// field: 'commitment' | 'decision'. me/partner are nicknames. therapyNote is the
// existing per-event note (migration 074) when the couple already has one — it
// carries each side's underlying need, which is what makes a suggestion land
// instead of reading generic.
async function generateClosureAssist({ field, eventSummary, messages, therapyNote, me, partner, companion }) {
  const wanted = field === 'decision' ? 'decision' : 'commitment';
  const lines = [];
  lines.push(`要寫的是：${wanted === 'decision' ? '共同決定（我們…）' : `${me || '使用者'}自己的承諾（我會…）`}`);
  if (me) lines.push(`使用者的暱稱：${me}`);
  if (partner) lines.push(`伴侶的暱稱：${partner}`);
  lines.push('');
  if (eventSummary) lines.push(`事件背景：${String(eventSummary).trim()}`, '');
  if (therapyNote && typeof therapyNote === 'object') {
    if (therapyNote.trigger) lines.push(`這次的觸發點：${therapyNote.trigger}`);
    const needs = Array.isArray(therapyNote.needs) ? therapyNote.needs : [];
    for (const n of needs) {
      if (n && n.who && n.need) lines.push(`${n.who} 真正在意的是：${n.need}`);
    }
    if (Array.isArray(therapyNote.cycle) && therapyNote.cycle.length) {
      lines.push(`他們落入的循環：${therapyNote.cycle.join(' → ')}`);
    }
    lines.push('');
  }
  lines.push('對話（最舊在前）：');
  for (const m of Array.isArray(messages) ? messages : []) {
    const who = m.isAi ? 'AI 諮商師' : (m.speaker || '某人');
    lines.push(`${who}：${(m.content || '').toString().trim()}`);
  }
  const userContent = lines.join('\n');

  const system = [
    {
      type: 'text',
      text: CLOSURE_ASSIST_SYSTEM_PROMPT + PUNCTUATION_RULE,
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
    max_tokens: 512,
    system,
    tools: [CLOSURE_ASSIST_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_closure_assist' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.closure_assist', {
    model: response.model || MODEL,
    field: wanted,
    companion: companion?.id || null,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_closure_assist'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }

  return shapeClosureAssist(toolUse.input || {}, {
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

const CLOSURE_INSIGHT_SYSTEM_PROMPT = `你是一位溫柔、專業、中立的伴侶諮商師。一對伴侶剛完成一次衝突的收尾：他們各自寫下了「下次我願意做的一件小事」，可能還加上一個共同決定。請對這一組約定說一小段你看到的東西。請永遠以繁體中文回覆。

請照這個順序寫，總共 2 到 3 句、${MAX_INSIGHT_CHARS} 字以內：
1. 先指出這兩個約定各自接住了對方的哪一個需要。
2. 再指出真正的難點會出現在哪一個瞬間（通常是很短的那幾秒：話要出口之前、動手之前）。

守則：不要稱讚式的空話（「你們很棒」「這是很好的一步」）；不要重述他們寫的內容；不要加任何新的要求或作業；不評斷對錯、不選邊站。

回應請只呼叫 emit_closure_insight tool，不要輸出其他文字。`;

const CLOSURE_INSIGHT_TOOL_SCHEMA = {
  name: 'emit_closure_insight',
  description: "Return a short read on a couple's finished pair of closure commitments.",
  input_schema: {
    type: 'object',
    properties: {
      insight: {
        type: 'string',
        maxLength: MAX_INSIGHT_CHARS,
        description: `2 到 3 句、${MAX_INSIGHT_CHARS} 字以內的觀察`,
      },
    },
    required: ['insight'],
  },
};

// commitments: [{ who, text }]. sharedDecision may be null — plenty of conflicts
// only need 「我下次會先問一聲」.
async function generateClosureInsight({ eventSummary, therapyNote, commitments, sharedDecision, companion }) {
  const lines = [];
  if (eventSummary) lines.push(`事件背景：${String(eventSummary).trim()}`, '');
  if (therapyNote && typeof therapyNote === 'object') {
    if (therapyNote.trigger) lines.push(`這次的觸發點：${therapyNote.trigger}`);
    for (const n of Array.isArray(therapyNote.needs) ? therapyNote.needs : []) {
      if (n && n.who && n.need) lines.push(`${n.who} 真正在意的是：${n.need}`);
    }
    lines.push('');
  }
  lines.push('他們寫下的約定：');
  for (const c of Array.isArray(commitments) ? commitments : []) {
    if (c && c.text) lines.push(`${c.who || '一方'}：${String(c.text).trim()}`);
  }
  if (sharedDecision) {
    lines.push('', `他們的共同決定：${String(sharedDecision).trim()}`);
  }
  const userContent = lines.join('\n');

  const system = [
    {
      type: 'text',
      text: CLOSURE_INSIGHT_SYSTEM_PROMPT + PUNCTUATION_RULE,
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
    max_tokens: 512,
    system,
    tools: [CLOSURE_INSIGHT_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_closure_insight' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.closure_insight', {
    model: response.model || MODEL,
    companion: companion?.id || null,
    commitments: Array.isArray(commitments) ? commitments.length : 0,
    hasSharedDecision: !!sharedDecision,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find(
    (b) => b.type === 'tool_use' && b.name === 'emit_closure_insight'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }

  return shapeClosureInsight(toolUse.input || {}, {
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

// ---------------------------------------------------------------------------
// 情緒深潛 Emotional Deep Dive
// ---------------------------------------------------------------------------
// Two parametrized generators (reflection + letter) rather than six near-twin
// functions. The per-step persona differs, but the output shape and guardrails
// are shared, so they ride in DEEP_DIVE_GUARDRAILS and the two tool schemas.

// The non-negotiable guardrails (PRD §33) + the safety exception, appended to
// every deep-dive prompt. Breaking a guardrail is worse than being shallow.
const DEEP_DIVE_GUARDRAILS = `

共同守則（永遠優先，違反守則比不夠深入嚴重得多）：
- 你只陪伴探索，不做診斷。不要判斷創傷、依附類型或心理疾病。
- 不要臆造任何記憶、童年事件或不存在的細節；只反映使用者自己說出來的內容。
- 不要說「這都是你父母造成的」「你其實是在對某人生氣」這類把原因定死的話。
- 不要用百分比（例如「九成來自過去」）。
- 用試探性的語氣：「聽起來…」「我在想是不是…」「這對你來說熟悉嗎？」。
- 不要替伴侶定罪，也不要鼓勵使用者去找過去的人對質。
- 不要把現在的衝突全部歸因於童年；現在的事情可以有它自己的份量。
- 請永遠以繁體中文回覆。
安全例外：只有在偵測到自傷／自殺、家暴或暴力威脅等安全風險時，才跳出引導，改為溫柔地建議尋求信任的人或專業／緊急協助。`;

const DEEP_DIVE_REFLECTION_PROMPTS = {
  emotion: `你是 Together 的情緒探索陪伴者。使用者正在描述一段和伴侶的衝突。請幫他：看見表面反應底下更深的情緒；把「現在發生的事」和「這件事對他的情緒意義」分開；不要假設情緒一定來自童年。請只回一段很短的反映，加上一個探索性的問題（通常是問這個感覺熟不熟悉）。`,
  memory: `你是 Together 的情緒探索陪伴者，正在陪使用者看看現在的情緒是不是連結到一段過去的經驗。只反映使用者提供的內容，問開放式的問題。如果記憶讓人難以承受，就建議先暫停，而不是往更深推。你的目標是好奇，不是解釋。`,
  past: `你在陪使用者寫一封給過去某個人的信。幫助他表達：當時發生了什麼（從他的角度）、他的感受、他當時多希望得到什麼、他需要卻沒有得到什麼、他現在怎麼看。不要虛構事件、不要替他指控或診斷那個人、不要告訴他「真相是什麼」、不要鼓勵對質。他寫憤怒就允許憤怒，寫悲傷就允許悲傷，情緒矛盾就保留那份矛盾。一次只問一個溫柔的後續問題。`,
  partner_mirror: `你在引導一位伴侶做反映式聆聽。他剛讀完另一半一封脆弱的信。請邀請他用自己的話說出他聽見了什麼。守則：不要求他同意每一個詮釋；不要求他立刻道歉；不要讓「反駁」主導；鼓勵用「我聽見你…」的說法；區分「理解」和「同意」；不要告訴他應該聽見什麼。如果他的詮釋錯過了對方的意思，溫柔地請他再看一次那封信。目標：先展現理解，再回應。`,
};

const DEEP_DIVE_LETTER_PROMPTS = {
  compassion: `幫使用者寫一封「他當時很需要收到」的信，寫給當時的自己。這封信要：肯定使用者的感受；承認他的需要；不宣稱歷史事實；不假冒任何真實的人（例如真的父母）；不說那個人「當時一定會這樣說」；聚焦在他當時值得聽見、值得感受到的東西。請明確地把它定位成「你當時多希望能收到的回應」。語氣溫暖、踏實、有情緒安全感。不要做心理診斷。`,
  partner: `把使用者的情緒探索，轉成一封脆弱、不指責、寫給伴侶的信。結構：1 現在發生了什麼 2 我感覺到什麼 3 這碰到了我心裡什麼更深的感受 4 只有在使用者明確說出來時，才提「這個感受以前也出現過」 5 我現在更了解自己的什麼 6 我現在需要伴侶做什麼。重要：不要把使用者的過去怪到伴侶身上；不要說伴侶「觸發了你的創傷」；不要淡化現在這件事；如果現在的行為真的造成傷害，不要抹掉那份責任；保留使用者現在真實、正當的需要。用「我」開頭的句子。讓信讀起來是脆弱的，而不是在分析。不要虛構任何細節。`,
};

const DEEP_DIVE_REFLECTION_TOOL_SCHEMA = {
  name: 'emit_deep_dive_reflection',
  description: 'Return one short emotional reflection and one gentle exploratory question, both in Traditional Chinese.',
  input_schema: {
    type: 'object',
    properties: {
      reflection: { type: 'string', description: '一段很短的情緒反映（繁體中文，試探語氣）' },
      question: { type: 'string', description: '一個溫柔的探索性問題（繁體中文）' },
    },
    required: ['reflection', 'question'],
  },
};

const DEEP_DIVE_LETTER_TOOL_SCHEMA = {
  name: 'emit_deep_dive_letter',
  description: 'Return a short drafted letter (Traditional Chinese) the user will then edit.',
  input_schema: {
    type: 'object',
    properties: {
      letter: { type: 'string', description: '幾個短段落的信件草稿（繁體中文），使用者之後會自己修改' },
    },
    required: ['letter'],
  },
};

// Assemble the user message from whatever journey context the step needs. Only
// the fields the user actually provided are included, so the cached system
// prefix stays byte-identical across users (same trick as generateWallCounselorComment).
function buildDeepDiveContext(context = {}) {
  const lines = [];
  const push = (label, value) => {
    const v = Array.isArray(value) ? value.filter(Boolean).join('、') : (value == null ? '' : String(value).trim());
    if (v) lines.push(`${label}：${v}`);
  };
  push('使用者的暱稱', context.me);
  push('伴侶的暱稱', context.partner);
  push('現在的衝突', context.situation);
  push('當下的情緒', context.currentEmotions);
  push('更深的情緒', context.deeperEmotions);
  push('這個感覺熟不熟悉', context.familiarity);
  push('浮現的記憶', context.memory);
  push('這段記憶裡最想對誰說', context.pastPerson);
  push('現在最需要伴侶做的', context.currentNeed);
  if (context.draft) push('使用者目前寫下的內容', context.draft);
  if (context.partnerLetter) push('伴侶寫給他的信', context.partnerLetter);
  return lines.length ? lines.join('\n') : '（使用者尚未提供內容）';
}

// One short reflection + one exploratory question. `step` selects the persona
// (emotion / memory / past / partner_mirror).
async function generateDeepDiveReflection({ step, context, companion }) {
  const prompt = DEEP_DIVE_REFLECTION_PROMPTS[step] || DEEP_DIVE_REFLECTION_PROMPTS.emotion;
  const userContent = buildDeepDiveContext(context);

  const system = [
    {
      type: 'text',
      text: prompt + DEEP_DIVE_GUARDRAILS + PUNCTUATION_RULE + '\n\n回應請只呼叫 emit_deep_dive_reflection tool，不要輸出其他文字。',
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (companion && companion.prompt) {
    system.push({ type: 'text', text: `你的人設（只調整語氣與風格，上述守則永遠優先）：\n${companion.prompt}` });
  }

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system,
    tools: [DEEP_DIVE_REFLECTION_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_deep_dive_reflection' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.deep_dive_reflection', {
    model: response.model || MODEL,
    step,
    companion: companion?.id || null,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_deep_dive_reflection');
  if (!toolUse) throw new Error('Claude did not return a tool_use block');

  return shapeDeepDiveReflection(toolUse.input || {}, {
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
  });
}

// A drafted letter (compassion / partner) the user then edits.
async function generateDeepDiveLetter({ kind, context, companion }) {
  const prompt = DEEP_DIVE_LETTER_PROMPTS[kind] || DEEP_DIVE_LETTER_PROMPTS.partner;
  const userContent = buildDeepDiveContext(context);

  const system = [
    {
      type: 'text',
      text: prompt + DEEP_DIVE_GUARDRAILS + PUNCTUATION_RULE + '\n\n回應請只呼叫 emit_deep_dive_letter tool，不要輸出其他文字。',
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (companion && companion.prompt) {
    system.push({ type: 'text', text: `你的人設（只調整語氣與風格，上述守則永遠優先）：\n${companion.prompt}` });
  }

  const startedAt = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 900,
    system,
    tools: [DEEP_DIVE_LETTER_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'emit_deep_dive_letter' },
    messages: [{ role: 'user', content: userContent }],
  });

  const ms = Date.now() - startedAt;
  const u = response.usage || {};
  const cost = estimateCostUSD(response.model || MODEL, u);
  logInfo('llm.claude.deep_dive_letter', {
    model: response.model || MODEL,
    kind,
    companion: companion?.id || null,
    durationMs: ms,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    costUsd: cost,
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_deep_dive_letter');
  if (!toolUse) throw new Error('Claude did not return a tool_use block');

  return shapeDeepDiveLetter(toolUse.input || {}, {
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
  });
}

module.exports = {
  generateIcebreaker,
  rewriteReply,
  generateRoleplayMessages,
  generateWallCounselorComment,
  generateReconciliationOpeners,
  generateAppreciationQuestions,
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
  // Exported for prompt-contract regression tests only.
  buildRoleplayUserContent,
  // Exported so the max_tokens truncation paths can be tested without a live
  // API call (getClient caches a module-level client and is not injectable).
  chunkTargets,
  parseTranslationResponse,
  parseRewriteResponse,
  TRANSLATION_CHUNK_SIZE,
};
