// Stage 0 — 危機偵測 (Safety Check).
//
// A couples therapist's first move is not to reply, but to read the room. This
// classifies a conversation thread into one of four escalating states and, for
// anything past 🟢 Connection, returns a gentle intervention the UI shows as a
// banner. The goal (per the design) is not to STOP the couple, but to lower the
// amygdala takeover — name what is happening and offer a pause.
//
// Deliberately deterministic and client-side: a safety nudge must be always-on,
// instant, and free (never gated behind an AI quota or a button). It reuses the
// same toxicity-signal idea as the server lexicon; an LLM-backed refinement can
// layer on later without changing this contract.

export type ConflictLevel = 'connection' | 'escalation' | 'flooding' | 'crisis';

export interface ConflictSignal {
  level: ConflictLevel;
  /** Short banner heading. Empty for 'connection'. */
  title: string;
  /** The intervention copy shown to both partners. Empty for 'connection'. */
  message: string;
}

export interface ConflictMessage {
  content: string;
  isAi?: boolean;
}

// Only weigh the tail of the thread — escalation is about the current moment,
// not something that cooled off ten messages ago.
const RECENT_WINDOW = 6;

// 🔴 Crisis: divorce/break-up threats, walking out, contempt that humiliates,
// threats of harm, "I can't do this anymore". These end the conversation as a
// safe space; the right move is to pause, not to problem-solve.
const CRISIS_PATTERNS: RegExp[] = [
  /離婚|分手|離開你|不想跟你|再也不|我要走|滾出去|滾回去/,
  /去死|自殺|不想活|傷害你|揍你|打你|威脅/,
  /受夠你了|我不愛你|後悔跟你|當初就不該/,
];

// 🟠 Flooding: one partner is emotionally overwhelmed (physiological flooding).
// Signs: "enough", "whatever", "shut up", "I'm done", or a burst of exclamation.
const FLOODING_PATTERNS: RegExp[] = [
  /夠了|受夠了|我不管了|隨便你|閉嘴|不想講了|懶得跟你/,
  /崩潰|快瘋了|受不了|喘不過氣|情緒勒索/,
];

// 🟡 Escalation: mutual blame — absolute language, contempt, name-calling.
const ESCALATION_PATTERNS: RegExp[] = [
  /總是|從來|每次|永遠|老是/,
  /都是你|你害的|你就是|你根本|你又/,
  /笨|蠢|廢物|沒用|白痴|神經病/,
  /冷漠|自私|幼稚|噁心|可悲/,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) if (p.test(text)) n += 1;
  return n;
}

function hasExclamationBurst(text: string): boolean {
  const marks = (text.match(/[!！?？]/g) || []).length;
  return marks >= 3;
}

const COPY: Record<Exclude<ConflictLevel, 'connection'>, { title: string; message: string }> = {
  escalation: {
    title: '對話開始升溫',
    message:
      '你們的對話開始出現一些指責的說法（例如「你總是⋯」「都是你⋯」）。這通常代表彼此都很在乎，只是話說出口變成了攻擊。試著先說出自己的感受與需要，會比指出對方的錯更靠近彼此。',
  },
  flooding: {
    title: '先暫停一下',
    message:
      '我注意到你們現在比較像是在保護自己，而不是理解彼此。情緒滿出來的時候，很難好好聽對方說話。要不要先暫停十分鐘、深呼吸一下，等身體平靜一點再繼續？這不是逃避，而是為了不說出會後悔的話。',
  },
  crisis: {
    title: '這一刻，先照顧好彼此',
    message:
      '這段對話已經很激烈，甚至出現了讓彼此很受傷的話。現在不是做重大決定的時候。先各自冷靜、把身體和情緒安頓好，明天再談也不遲。如果你感到不安全，或有人可能受到傷害，請立刻尋求信任的人或專業協助。',
  },
};

/**
 * Classify the current state of a conversation thread from its recent human
 * messages. AI counselor messages are ignored (they are the calming voice, not
 * a signal of escalation).
 */
export function detectConflictState(messages: ConflictMessage[]): ConflictSignal {
  const connection: ConflictSignal = { level: 'connection', title: '', message: '' };
  if (!Array.isArray(messages) || messages.length === 0) return connection;

  const recent = messages
    .filter((m) => m && !m.isAi && typeof m.content === 'string')
    .slice(-RECENT_WINDOW);
  if (recent.length === 0) return connection;

  let crisis = false;
  let flooding = false;
  let escalationMessages = 0;

  for (const m of recent) {
    const text = m.content;
    if (countMatches(text, CRISIS_PATTERNS) > 0) crisis = true;
    if (countMatches(text, FLOODING_PATTERNS) > 0 || hasExclamationBurst(text)) flooding = true;
    if (countMatches(text, ESCALATION_PATTERNS) > 0) escalationMessages += 1;
  }

  // Highest severity wins.
  if (crisis) return { level: 'crisis', ...COPY.crisis };
  if (flooding) return { level: 'flooding', ...COPY.flooding };
  // Escalation needs a back-and-forth pattern (at least two blaming messages),
  // so a single sharp line doesn't nag a couple who are otherwise fine.
  if (escalationMessages >= 2) return { level: 'escalation', ...COPY.escalation };

  return connection;
}

// Severity ordering so the UI can decide whether a newly-detected level is more
// serious than one the couple already dismissed this session.
const ORDER: Record<ConflictLevel, number> = {
  connection: 0,
  escalation: 1,
  flooding: 2,
  crisis: 3,
};

export function conflictSeverity(level: ConflictLevel): number {
  return ORDER[level] ?? 0;
}

// Single-draft tone, for a free, instant hint in the composer as the writer
// types (no LLM, no quota). Unlike the thread classifier this fires on a SINGLE
// charged line — the whole point is to catch a hot message before it is sent.
// 'connection' means the draft reads fine and no hint is shown.
export function detectDraftTone(text: string): ConflictLevel {
  if (typeof text !== 'string' || text.trim().length === 0) return 'connection';
  if (countMatches(text, CRISIS_PATTERNS) > 0) return 'crisis';
  if (countMatches(text, FLOODING_PATTERNS) > 0 || hasExclamationBurst(text)) return 'flooding';
  if (countMatches(text, ESCALATION_PATTERNS) > 0) return 'escalation';
  return 'connection';
}

// Short nudge shown under the composer when a draft reads charged. Encourages
// (never forces) the writer to run the emotion check before sending.
export function draftToneHint(level: ConflictLevel): string {
  switch (level) {
    case 'crisis':
      return '這句話很重，送出前先深呼吸一下。要不要看看對方會怎麼聽？';
    case 'flooding':
      return '這句話帶著滿出來的情緒。送出前要不要先看看對方會怎麼聽？';
    case 'escalation':
      return '這句話帶有一點指責的語氣。送出前要不要看看對方會怎麼聽？';
    default:
      return '';
  }
}
