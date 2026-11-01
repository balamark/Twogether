import React, { useMemo, useState } from 'react';
import { Copy, Check, Trash2, Star, RotateCcw, Plus, ArrowLeft } from 'lucide-react';
import { tr, dateLocale } from '../../i18n/tr';
import { SampleTag } from '../LoggedOutPreview';
import { trackAction } from '../../utils/track';
import { analyzeSoften } from './guestSoften';
import {
  localDate,
  newId,
  type GuestMood,
  type GuestState,
} from './guestStore';
import {
  LOVE_LANGUAGES,
  LOVE_LANGUAGE_ORDER,
  LOVE_LANGUAGE_QUIZ,
  LOVE_ACTIONS,
  emptyScores,
  topLanguage,
  type LoveLanguageScores,
} from '../../data/loveLanguage';
import { conflictPhraseTiers } from '../../data/conflictSteps';
import { MOOD_OPTIONS } from '../rhythmDisplay';

// The five guest-playground panels. All state goes through the session-only
// guest store (guestStore.ts) — nothing here talks to the API. Tracking beacons
// carry only the action name, never the visitor's text.

type Update = (fn: (s: GuestState) => GuestState) => void;
interface PanelProps {
  state: GuestState;
  update: Update;
}

const Card: React.FC<{ children: React.ReactNode; className?: string; testId?: string }> = ({ children, className = '', testId }) => (
  <div className={`bg-white border border-petal-rule rounded-xl px-4 py-3 ${className}`} data-testid={testId}>{children}</div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-body text-[11px] font-medium uppercase tracking-[0.12em] text-petal-muted mb-1.5">{children}</div>
);

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    try {
      void navigator.clipboard?.writeText(text);
    } catch { /* clipboard blocked — the text is still visible to select */ }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  };
  return [copied, copy];
}

const CopyButton: React.FC<{ id: string; text: string; copied: string | null; onCopy: (k: string, t: string) => void }> = ({ id, text, copied, onCopy }) => (
  <button
    type="button"
    onClick={() => onCopy(id, text)}
    className="inline-flex items-center gap-1 rounded-full border border-petal-rule px-2 py-0.5 font-body text-[11px] text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink shrink-0"
  >
    {copied === id ? <Check className="w-3 h-3 text-petal-sage-deeper" /> : <Copy className="w-3 h-3" />}
    {copied === id ? tr('已複製', 'Copied') : tr('複製', 'Copy')}
  </button>
);

// ─── #1 說之前，先看看 ────────────────────────────────────────────────────────
export const SoftenPanel: React.FC<PanelProps> = ({ state, update }) => {
  const [draft, setDraft] = useState('');
  const [analyzed, setAnalyzed] = useState<string | null>(state.softens[0]?.original ?? null);
  const [copied, copy] = useCopy();
  const result = useMemo(() => (analyzed ? analyzeSoften(analyzed) : null), [analyzed]);

  const run = (text: string, fromHistory = false) => {
    const t = text.trim();
    if (!t) return;
    setAnalyzed(t);
    if (!fromHistory) {
      update((s) => ({
        ...s,
        softens: [{ id: newId(), original: t, createdAt: new Date().toISOString() }, ...s.softens.filter((x) => x.original !== t)].slice(0, 10),
      }));
      setDraft('');
      trackAction('onboarding.guest.soften_run');
    }
  };

  return (
    <div className="space-y-3" data-testid="guest-panel-soften">
      <Card>
        <Label>{tr('那句差點送出的話', 'The line you almost sent')}</Label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder={tr('例如：你每次都這樣，說好要早點回來又不回訊息！', 'e.g. You always do this. You said you\'d be home early and didn\'t text back!')}
          className="w-full resize-none rounded-lg border border-petal-rule bg-petal-cream px-3 py-2 font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-ink"
          data-testid="guest-soften-input"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-body text-[11px] text-petal-muted">{tr('在你的裝置上分析，不會上傳', 'Analyzed on your device, never uploaded')}</span>
          <button
            type="button"
            onClick={() => run(draft)}
            disabled={!draft.trim()}
            className="rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-sm hover:bg-pink-700 disabled:opacity-40"
            data-testid="guest-soften-run"
          >
            {tr('看看對方會聽到什麼', 'See what they\'ll hear')}
          </button>
        </div>
      </Card>

      {result && analyzed && (
        <Card testId="guest-soften-result">
          <p className="font-body text-sm text-petal-ink-soft italic mb-3">「{analyzed}」</p>

          <Label>{tr('火藥味', 'Heat level')}</Label>
          <div className="space-y-1.5 mb-3">
            {[
              { name: tr('原句', 'Original'), v: result.heat, cls: 'bg-vivid-rose' },
              { name: tr('換句話說', 'Rewritten'), v: result.heatAfter, cls: 'bg-petal-sage-deep' },
            ].map((row) => (
              <div key={row.name} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-body text-xs text-petal-ink">{row.name}</span>
                <div className="flex-1 h-2 rounded-full bg-petal-cream-2 overflow-hidden">
                  <div className={`h-full rounded-full ${row.cls} transition-all duration-700`} style={{ width: `${row.v}%` }} />
                </div>
                <span className="w-8 text-right font-body text-[11px] text-petal-muted">{row.v}</span>
              </div>
            ))}
          </div>

          <Label>{tr('這句話底下的情緒', 'The feelings beneath it')}</Label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {result.emotions.map((e) => (
              <span key={e.key} className="rounded-full bg-petal-cream-2 px-2.5 py-0.5 font-body text-xs text-petal-ink">
                {e.emoji} {e.label} <span className="text-petal-muted">{e.intensity}%</span>
              </span>
            ))}
          </div>

          <Label>{tr('對方可能聽到的', 'What they\'ll probably hear')}</Label>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">{result.partnerHears}</p>

          <Label>{tr('你真正需要的', 'What you actually need')}</Label>
          <p className="font-body text-sm text-petal-ink mb-3">{result.need}</p>

          <div className="rounded-lg bg-petal-sage/15 border border-petal-sage/40 px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-body text-[11px] font-medium uppercase tracking-[0.12em] text-petal-sage-deeper">{tr('換成這樣說', 'Try saying it like this')}</span>
              <CopyButton id="rewrite" text={result.rewrite} copied={copied} onCopy={copy} />
            </div>
            <p className="font-body text-sm text-petal-ink leading-relaxed" data-testid="guest-soften-rewrite">{result.rewrite}</p>
          </div>

          <div className="mt-3">
            <Label>{tr('如果是對方這樣對你說，可以這樣接住', 'If they said this to you, here\'s how to receive it')}</Label>
            <ul className="space-y-1">
              {result.receiveLines.map((l) => (
                <li key={l} className="font-body text-sm text-petal-ink-soft">• {l}</li>
              ))}
            </ul>
          </div>
          <p className="mt-3 font-body text-[11px] text-petal-muted">
            {tr('試玩版用關鍵字在本機分析；註冊後由 AI 依你們的對話脈絡給出更細的版本。', 'The playground uses on-device keyword cues; after signing up, AI tailors it to your real conversations.')}
          </p>
        </Card>
      )}

      {state.softens.length > 0 && (
        <div>
          <Label>{tr('最近看過的句子', 'Recently checked')}</Label>
          <div className="space-y-1.5">
            {state.softens.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-petal-rule-soft bg-petal-cream px-3 py-1.5">
                <button type="button" onClick={() => run(s.original, true)} className="flex-1 text-left font-body text-xs text-petal-ink-soft truncate hover:text-petal-ink">
                  {s.original}
                </button>
                {s.sample && <SampleTag />}
                <button
                  type="button"
                  aria-label={tr('刪除', 'Delete')}
                  onClick={() => update((st) => ({ ...st, softens: st.softens.filter((x) => x.id !== s.id) }))}
                  className="p-1 text-petal-muted hover:text-vivid-rose-ink"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── #2 愛的語言測驗 ──────────────────────────────────────────────────────────
export const LoveLanguagePanel: React.FC<PanelProps> = ({ state, update }) => {
  const [quizStep, setQuizStep] = useState<number | null>(state.loveLanguage ? null : 0);
  const [answers, setAnswers] = useState<LoveLanguageScores>(emptyScores());

  const start = () => { setAnswers(emptyScores()); setQuizStep(0); trackAction('onboarding.guest.love_quiz_start'); };

  const pick = (code: keyof LoveLanguageScores) => {
    const next = { ...answers, [code]: answers[code] + 1 };
    setAnswers(next);
    if (quizStep !== null && quizStep + 1 < LOVE_LANGUAGE_QUIZ.length) {
      setQuizStep(quizStep + 1);
      return;
    }
    // Scale to /10 per language (each appears in 6 of 15 questions).
    const scaled = LOVE_LANGUAGE_ORDER.reduce((acc, c) => ({ ...acc, [c]: Math.round((next[c] / 6) * 10) }), emptyScores());
    update((s) => ({ ...s, loveLanguage: { result: topLanguage(next), scores: scaled } }));
    setQuizStep(null);
    trackAction('onboarding.guest.love_quiz_done');
  };

  if (quizStep !== null) {
    const q = LOVE_LANGUAGE_QUIZ[quizStep];
    return (
      <Card testId="guest-panel-love-language">
        <div className="flex items-center justify-between mb-2">
          {state.loveLanguage ? (
            <button type="button" onClick={() => setQuizStep(null)} className="inline-flex items-center gap-1 font-body text-xs text-petal-muted hover:text-petal-ink">
              <ArrowLeft className="w-3.5 h-3.5" /> {tr('回到結果', 'Back to result')}
            </button>
          ) : <span />}
          <span className="font-body text-xs text-petal-muted">{quizStep + 1} / {LOVE_LANGUAGE_QUIZ.length}</span>
        </div>
        <div className="h-1 rounded-full bg-petal-cream-2 overflow-hidden mb-4">
          <div className="h-full bg-pink-500 transition-all" style={{ width: `${((quizStep) / LOVE_LANGUAGE_QUIZ.length) * 100}%` }} />
        </div>
        <p key={q.id} className="font-display text-lg text-petal-ink mb-3 motion-safe:animate-guest-rise">{q.prompt}</p>
        <div className="space-y-2">
          {q.options.map((o) => (
            <button
              key={o.code}
              type="button"
              onClick={() => pick(o.code)}
              className="w-full rounded-xl border border-petal-rule bg-petal-cream px-3 py-2.5 text-left font-body text-sm text-petal-ink hover:border-pink-500 hover:bg-petal-rose-soft/20 transition-colors"
              data-testid="guest-love-option"
            >
              {o.text}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  const ll = state.loveLanguage!;
  const meta = LOVE_LANGUAGES[ll.result];
  return (
    <Card testId="guest-panel-love-language">
      <div className="flex items-center justify-between mb-2">
        <Label>{tr('你的愛的語言', 'Your love language')}</Label>
        {ll.sample && <SampleTag />}
      </div>
      <div className="text-center mb-3" data-testid="guest-love-result">
        <div className="text-4xl mb-1">{meta.emoji}</div>
        <div className="font-display text-2xl text-petal-ink">{meta.label}</div>
        <div className="font-display italic text-sm text-petal-muted">{meta.tagline}</div>
      </div>
      <div className="space-y-1.5 mb-3">
        {LOVE_LANGUAGE_ORDER.map((c) => (
          <div key={c} className="flex items-center gap-2">
            <span className="w-28 shrink-0 font-body text-xs text-petal-ink truncate">{LOVE_LANGUAGES[c].emoji} {LOVE_LANGUAGES[c].label}</span>
            <div className="flex-1 h-2 rounded-full bg-petal-cream-2 overflow-hidden">
              <div className={`h-full rounded-full ${c === ll.result ? 'bg-pink-500' : 'bg-petal-rule'}`} style={{ width: `${(ll.scores[c] ?? 0) * 10}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">{meta.description}</p>
      <Label>{tr('把這個傳給另一半：愛我的方法', 'Send this to your partner: how to love me')}</Label>
      <ul className="space-y-1 mb-4">
        {LOVE_ACTIONS[ll.result].slice(0, 3).map((a) => (
          <li key={a} className="font-body text-sm text-petal-ink">💌 {a}</li>
        ))}
      </ul>
      <button type="button" onClick={start} className="inline-flex items-center gap-1.5 rounded-full border border-petal-ink px-4 py-1.5 font-body text-sm text-petal-ink hover:bg-petal-ink hover:text-petal-cream" data-testid="guest-love-retake">
        <RotateCcw className="w-3.5 h-3.5" /> {ll.sample ? tr('換我來測（2 分鐘）', 'Take it myself (2 min)') : tr('重新測驗', 'Retake')}
      </button>
    </Card>
  );
};

// ─── #3 心情日記 ──────────────────────────────────────────────────────────────
export const MoodPanel: React.FC<PanelProps> = ({ state, update }) => {
  const today = localDate();
  const todayEntry = state.moods.find((m) => m.date === today);
  const [note, setNote] = useState(todayEntry?.note ?? '');

  const log = (mood: GuestMood) => {
    update((s) => ({
      ...s,
      moods: [...s.moods.filter((m) => m.date !== today), { date: today, mood, ...(note.trim() ? { note: note.trim() } : {}) }],
    }));
    trackAction('onboarding.guest.mood_log');
  };

  const last14 = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = localDate(d);
    return { key, d, entry: state.moods.find((m) => m.date === key) };
  });
  const last7 = last14.slice(7).map((x) => x.entry).filter(Boolean);
  const goodDays = last7.filter((e) => e!.mood === 'great' || e!.mood === 'good').length;
  const hardDays = last7.filter((e) => e!.mood === 'low' || e!.mood === 'stressed').length;
  const emojiOf = (m: GuestMood) => MOOD_OPTIONS.find((o) => o.key === m)?.emoji ?? '·';
  const hasSample = state.moods.some((m) => m.sample);

  return (
    <div className="space-y-3" data-testid="guest-panel-mood">
      <Card>
        <Label>{tr('今天的心情', 'Today\'s mood')}</Label>
        <div className="flex justify-between gap-1 mb-2">
          {MOOD_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => log(o.key as GuestMood)}
              title={o.label}
              aria-label={o.label}
              aria-pressed={todayEntry?.mood === o.key}
              className={`flex-1 flex flex-col items-center gap-0.5 rounded-xl py-2 border transition-colors ${
                todayEntry?.mood === o.key ? 'border-pink-500 bg-petal-rose-soft/30' : 'border-petal-rule-soft hover:border-petal-ink'
              }`}
              data-testid={`guest-mood-${o.key}`}
            >
              <span className="text-2xl">{o.emoji}</span>
              <span className="font-body text-[10px] text-petal-muted leading-tight text-center">{o.label}</span>
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => todayEntry && update((s) => ({ ...s, moods: s.moods.map((m) => (m.date === today ? { ...m, note: note.trim() || undefined } : m)) }))}
          maxLength={80}
          placeholder={tr('一句話記下為什麼（選填）', 'One line on why (optional)')}
          className="w-full rounded-lg border border-petal-rule bg-petal-cream px-3 py-1.5 font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-ink"
        />
        {todayEntry && <p className="mt-1.5 font-body text-[11px] text-petal-sage-deeper">✓ {tr('今天記好了，換心情隨時再點一次。', 'Logged for today. Tap again any time your mood changes.')}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <Label>{tr('最近兩週', 'Last two weeks')}</Label>
          {hasSample && <SampleTag />}
        </div>
        <div className="grid grid-cols-7 gap-1.5" data-testid="guest-mood-strip">
          {last14.map(({ key, d, entry }) => (
            <div key={key} className="flex flex-col items-center" title={entry?.note ?? ''}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${key === today ? 'ring-2 ring-pink-500' : ''} ${entry ? 'bg-petal-cream-2' : 'bg-petal-cream border border-dashed border-petal-rule'}`}>
                {entry ? emojiOf(entry.mood) : ''}
              </span>
              <span className="font-body text-[10px] text-petal-muted">{d.toLocaleDateString(dateLocale(), { month: 'numeric', day: 'numeric' })}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 font-body text-sm text-petal-ink-soft">
          📈 {tr(`這週 ${goodDays} 天心情不錯、${hardDays} 天比較辛苦。`, `${goodDays} good days and ${hardDays} hard days this week.`)}
          {hardDays >= 2 && (
            <span className="block mt-1 text-petal-ink">
              💡 {tr('辛苦的日子偏多。試著跟 TA 說：「我最近壓力比較大，需要你多抱抱我。」', 'More hard days than usual. Try telling them: "I\'ve been under a lot of stress; I need a few more hugs."')}
            </span>
          )}
        </p>
      </Card>
    </div>
  );
};

// ─── #4 回憶時間軸 ────────────────────────────────────────────────────────────
const MEMORY_EMOJI = ['💞', '☕', '🍜', '🌊', '🎬', '✈️', '🎂', '🌸', '🏠', '🐶'];

export const MemoriesPanel: React.FC<PanelProps> = ({ state, update }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(localDate());
  const [note, setNote] = useState('');
  const [emoji, setEmoji] = useState(MEMORY_EMOJI[0]);

  const sorted = [...state.memories].sort((a, b) => b.date.localeCompare(a.date));
  const daysSince = (iso: string) => Math.max(0, Math.round((Date.parse(localDate()) - Date.parse(iso)) / 86400000));

  const add = () => {
    if (!title.trim()) return;
    update((s) => ({ ...s, memories: [{ id: newId(), date, emoji, title: title.trim(), ...(note.trim() ? { note: note.trim() } : {}) }, ...s.memories] }));
    setTitle(''); setNote(''); setOpen(false);
    trackAction('onboarding.guest.memory_add');
  };

  return (
    <div className="space-y-3" data-testid="guest-panel-memories">
      {open ? (
        <Card>
          <Label>{tr('新增一個回憶', 'Add a memory')}</Label>
          <div className="flex flex-wrap gap-1 mb-2">
            {MEMORY_EMOJI.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} aria-pressed={emoji === e} className={`h-8 w-8 rounded-full text-lg ${emoji === e ? 'bg-petal-rose-soft ring-2 ring-pink-500' : 'bg-petal-cream-2'}`}>{e}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder={tr('發生了什麼？例如：一起去夜市', 'What happened? e.g. Night market together')} className="w-full mb-2 rounded-lg border border-petal-rule bg-petal-cream px-3 py-1.5 font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-ink" data-testid="guest-memory-title" />
          <input type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value || localDate())} className="w-full mb-2 rounded-lg border border-petal-rule bg-petal-cream px-3 py-1.5 font-body text-sm text-petal-ink focus:outline-none focus:border-petal-ink" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} placeholder={tr('想記住的小細節（選填）', 'A little detail to remember (optional)')} className="w-full resize-none rounded-lg border border-petal-rule bg-petal-cream px-3 py-1.5 font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-ink" />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 font-body text-sm text-petal-muted hover:text-petal-ink">{tr('取消', 'Cancel')}</button>
            <button type="button" onClick={add} disabled={!title.trim()} className="rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 font-body text-sm hover:bg-pink-700 disabled:opacity-40" data-testid="guest-memory-save">{tr('收進時間軸', 'Add to timeline')}</button>
          </div>
        </Card>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-petal-ink/40 py-2.5 font-body text-sm text-petal-ink hover:border-petal-ink" data-testid="guest-memory-add">
          <Plus className="w-4 h-4" /> {tr('新增一個回憶', 'Add a memory')}
        </button>
      )}

      {sorted.length === 0 ? (
        <Card>
          <p className="font-body text-sm text-petal-ink-soft">{tr('時間軸還是空的。第一個回憶可以很小：今天一起吃的早餐也算。', 'The timeline is empty. Your first memory can be tiny: today\'s breakfast together counts.')}</p>
        </Card>
      ) : (
        <div className="relative border-l-2 border-petal-rose-soft pl-4 ml-1 space-y-2" data-testid="guest-memory-list">
          {sorted.map((m) => (
            <div key={m.id} className="relative rounded-xl bg-white border border-petal-rule px-3 py-2">
              <span className="absolute -left-[23px] top-3.5 h-2.5 w-2.5 rounded-full bg-pink-500" />
              <div className="flex items-start gap-2">
                <span className="text-xl leading-none mt-0.5">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm text-petal-ink">{m.title}</div>
                  <div className="font-body text-[11px] text-petal-muted">
                    {new Date(`${m.date}T00:00:00`).toLocaleDateString(dateLocale(), { year: 'numeric', month: 'short', day: 'numeric' })} · {daysSince(m.date) === 0 ? tr('今天', 'today') : tr(`${daysSince(m.date)} 天前`, `${daysSince(m.date)} days ago`)}
                  </div>
                  {m.note && <p className="mt-1 font-body text-xs text-petal-ink-soft leading-relaxed">{m.note}</p>}
                </div>
                {m.sample && <SampleTag />}
                <button type="button" aria-label={tr('刪除', 'Delete')} onClick={() => update((s) => ({ ...s, memories: s.memories.filter((x) => x.id !== m.id) }))} className="p-1 text-petal-muted hover:text-vivid-rose-ink">
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── #5 和好小抄 ──────────────────────────────────────────────────────────────
export const RepairPanel: React.FC<PanelProps> = ({ state, update }) => {
  const [stepKey, setStepKey] = useState(conflictPhraseTiers[0].key);
  const [copied, copy] = useCopy();
  const step = conflictPhraseTiers.find((s) => s.key === stepKey) ?? conflictPhraseTiers[0];

  const phraseOf = (fav: string) => {
    const [k, i] = fav.split(':');
    return conflictPhraseTiers.find((s) => s.key === k)?.phrases[Number(i)];
  };
  const toggle = (fav: string) => {
    update((s) => ({
      ...s,
      favoritePhrases: s.favoritePhrases.includes(fav) ? s.favoritePhrases.filter((f) => f !== fav) : [...s.favoritePhrases, fav],
    }));
    trackAction('onboarding.guest.phrase_star');
  };
  const favs = state.favoritePhrases.filter((f) => phraseOf(f));

  return (
    <div className="space-y-3" data-testid="guest-panel-repair">
      {favs.length > 0 && (
        <Card>
          <Label>{tr('我的小抄', 'My cheat sheet')}</Label>
          <ul className="space-y-1.5">
            {favs.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="flex-1 font-body text-sm text-petal-ink">⭐ {phraseOf(f)}</span>
                <CopyButton id={`fav-${f}`} text={phraseOf(f)!} copied={copied} onCopy={copy} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {conflictPhraseTiers.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStepKey(s.key)}
            className={`shrink-0 rounded-full px-3 py-1 font-body text-xs border ${s.key === stepKey ? 'bg-petal-ink text-petal-cream border-petal-ink' : 'border-petal-rule text-petal-ink-soft hover:border-petal-ink'}`}
          >
            {s.dot} {s.badge}
          </button>
        ))}
      </div>

      <div className={`rounded-xl border px-4 py-3 ${step.cardClass}`}>
        <h4 className="font-display text-lg text-petal-ink mb-1">{step.title}</h4>
        <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">{step.why}</p>
        <ul className="space-y-1.5">
          {step.phrases.map((p, i) => {
            const fav = `${step.key}:${i}`;
            const on = state.favoritePhrases.includes(fav);
            return (
              <li key={fav} className="flex items-center gap-2 rounded-lg bg-white/80 px-3 py-1.5">
                <span className="flex-1 font-body text-sm text-petal-ink">{p}</span>
                <button type="button" onClick={() => toggle(fav)} aria-pressed={on} aria-label={on ? tr('取消收藏', 'Unsave') : tr('收藏', 'Save')} className="p-1" data-testid="guest-phrase-star">
                  <Star className={`w-4 h-4 ${on ? 'fill-amber-400 text-amber-500' : 'text-petal-muted'}`} strokeWidth={1.5} />
                </button>
                <CopyButton id={fav} text={p} copied={copied} onCopy={copy} />
              </li>
            );
          })}
        </ul>
        <p className="mt-2 font-body text-[11px] text-petal-muted">{step.note}</p>
      </div>
    </div>
  );
};
