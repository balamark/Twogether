import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Shuffle, Send, Check, Sparkles, Wand2 } from 'lucide-react';
import AutoGrowTextarea from './AutoGrowTextarea';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiService } from '../services/api';
import { trackAction } from '../utils/track';
import type { AuthState, Notification } from '../App';

interface DailyLoveViewProps {
  authState: AuthState;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  onBack: () => void;
  onGoToWall: () => void;
}

// 今天你還喜歡他什麼？ — a daily micro-habit. Each day surfaces ONE small,
// life-like question ("今天有沒有一個瞬間，讓你覺得『還好是他』？") so noticing and
// appreciating your partner becomes a one-minute-a-day habit, not a chore. The
// answer posts to 我們的牆 so TA receives it.
//
// The question bank is deliberately concrete and playful — the whole point is
// that it reads like a friend nudging you, never a worksheet ("請表達你對伴侶
// 的感謝"). If none of the built-ins land, 讓 AI 想幾個新的 asks the LLM for a
// fresh batch (persisted on-device, so tomorrow's question can come from it).

const TAG = '今天喜歡你';

// ~28 curated questions. Angles vary on purpose: 被照顧, 覺得可愛, 覺得可靠,
// 心動, 好笑, 感激, 重新看見付出… Includes the seed questions from the original
// product sketch ("還好是他", "被照顧", "很可愛", "只能誇一件事").
const CURATED: string[] = [
  '今天有沒有一個瞬間，讓你覺得「還好是他」？',
  '今天他做了什麼，讓你覺得被照顧？',
  '今天他有沒有一個很可愛、讓你想多看一眼的瞬間？',
  '如果今天只能誇他一件事，你會說什麼？',
  '今天他有沒有一句話，讓你心裡暖了一下？',
  '今天他為家裡或孩子做了哪件你有注意到的小事？',
  '最近他有沒有一件事，讓你覺得很可靠？',
  '今天他有沒有讓你笑出來？是什麼？',
  '今天有沒有一個「幸好有他在」的時刻？',
  '今天他身上，有沒有一個你一直很喜歡的樣子又出現了？',
  '如果現在傳一句話謝謝他，你會想謝什麼？',
  '今天他有沒有做一件很小、但很貼心的事？',
  '今天他忙起來的樣子，有沒有哪個瞬間讓你有點心動？',
  '今天你們相處時，哪一刻最讓你覺得放鬆？',
  '今天他有沒有記得一件你以為他會忘記的事？',
  '今天他有沒有讓你覺得「被理解」的一刻？',
  '最近他做了什麼，讓你覺得他其實很努力？',
  '今天他有沒有一個小動作，是你偷偷覺得很可愛的？',
  '如果要把今天和他的一個畫面拍下來，你會拍哪一個？',
  '今天他有沒有在你沒開口時，就先想到你？',
  '今天他哪一個表情，讓你想多看兩秒？',
  '今天他有沒有幫你分擔了什麼，讓你鬆一口氣？',
  '今天你有沒有突然覺得，跟他在一起很安心？',
  '今天他說的哪句話，你想記起來？',
  '今天他對孩子（或對你）溫柔的哪一刻，被你看見了？',
  '最近他有沒有為你們兩個人，默默做了什麼？',
  '今天他哪個地方，讓你想起當初喜歡他的原因？',
  '如果今晚睡前要跟他說一件今天的好事，你會說什麼？',
];

const poolKey = (userId?: string) => `tw:daily-love-pool:${userId || 'anon'}`;
const dayKey = (userId?: string) => `tw:daily-love-day:${userId || 'anon'}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

const DailyLoveView: React.FC<DailyLoveViewProps> = ({ authState, showNotification, onBack, onGoToWall }) => {
  const userId = authState.user?.id;
  const them = authState.user?.partnerNickname?.trim();

  // AI-added questions live on-device; the curated bank is always first.
  const [aiPool, setAiPool] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(poolKey(userId));
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.isArray(arr) ? arr.filter((q) => typeof q === 'string' && q.trim()) : [];
    } catch {
      return [];
    }
  });
  const pool = useMemo(() => {
    const seen = new Set<string>();
    return [...CURATED, ...aiPool].filter((q) => (seen.has(q) ? false : (seen.add(q), true)));
  }, [aiPool]);

  // Hydrate the AI pool from the couple's server-side cache once. This is the
  // free (no-token) read: a batch generated earlier — on this device, the
  // partner's device, or before the browser was cleared — comes back here so we
  // never re-spend a credit just to see questions we already paid for.
  useEffect(() => {
    let cancelled = false;
    apiService.getAppreciationQuestions([], false)
      .then(({ questions }) => {
        if (cancelled || !Array.isArray(questions) || questions.length === 0) return;
        setAiPool((prev) => {
          const seen = new Set<string>();
          const merged = [...questions, ...prev].filter((q) => (q && !seen.has(q) ? (seen.add(q), true) : false));
          try { localStorage.setItem(poolKey(userId), JSON.stringify(merged)); } catch { /* ignore */ }
          return merged;
        });
      })
      .catch(() => { /* offline / not paired — the localStorage copy still drives this session */ });
    return () => { cancelled = true; };
  }, [userId]);

  // Stable "today's question": seeded by the day so it doesn't change on every
  // render, persisted so re-opening shows the same one, and only rolling over
  // to a fresh pick when the date changes. 換一題 advances it manually.
  const [index, setIndex] = useState(0);
  useEffect(() => {
    let stored: { date?: string; idx?: number } = {};
    try {
      const raw = localStorage.getItem(dayKey(userId));
      if (raw) stored = JSON.parse(raw);
    } catch { /* ignore */ }
    if (stored.date === todayStr() && typeof stored.idx === 'number' && stored.idx < pool.length) {
      setIndex(stored.idx);
    } else {
      const dayNum = Math.floor(Date.now() / 86400000);
      const idx = pool.length ? ((dayNum % pool.length) + pool.length) % pool.length : 0;
      setIndex(idx);
      try { localStorage.setItem(dayKey(userId), JSON.stringify({ date: todayStr(), idx })); } catch { /* ignore */ }
    }
    // Only on mount / user change — 換一題 owns index afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const [draft, setDraft] = useState('');
  const [justSent, setJustSent] = useState(false);

  const setDayIndex = (idx: number) => {
    setIndex(idx);
    try { localStorage.setItem(dayKey(userId), JSON.stringify({ date: todayStr(), idx })); } catch { /* ignore */ }
  };

  const personalize = (s: string) => (them ? s.replace(/他/g, them) : s);
  const question = pool[index] ?? pool[0] ?? CURATED[0];

  const nextQuestion = () => {
    trackAction('daily_love.shuffle');
    setDayIndex(pool.length ? (index + 1) % pool.length : 0);
  };

  const persistAiPool = (next: string[]) => {
    setAiPool(next);
    try { localStorage.setItem(poolKey(userId), JSON.stringify(next)); } catch { /* ignore */ }
  };

  // 讓 AI 想幾個新的 — one AI credit; the server appends the fresh batch to the
  // couple's shared cache and returns the whole pool, so this is the only path
  // that ever spends a token.
  const { run: regenerate, pending: regenerating } = useAsyncAction(async () => {
    try {
      trackAction('daily_love.ai_regenerate');
      const { questions, added } = await apiService.getAppreciationQuestions(pool, true);
      if (!added || added.length === 0) {
        showNotification({ type: 'info', title: '這批和現在的很像', message: '再按一次可以請 AI 換個角度想想。' });
        return;
      }
      // Server pool is canonical; mirror it locally for offline reads.
      persistAiPool(questions);
      // Jump to the first newly-added question so the user sees the result.
      const firstNew = [...CURATED, ...questions].indexOf(added[0]);
      if (firstNew >= 0) setDayIndex(firstNew);
      showNotification({ type: 'success', title: 'AI 想了幾個新問題', message: `加了 ${added.length} 個新問題，用「換一題」逛逛看。` });
    } catch (err) {
      const e = err as { error_code?: string; message?: string };
      if (e?.error_code === 'billing:limit-reached') return; // paywall handled by interceptor
      showNotification({
        type: 'error',
        title: 'AI 暫時想不出來',
        message: e?.message || '先用現有的問題，稍後再試一次。',
      });
    }
  });

  const { run: submit, pending: submitting } = useAsyncAction(async () => {
    const answer = draft.trim();
    if (!answer) return;
    // Include the question so the wall post reads with context, not a floating
    // answer. Markdown blockquote → the question shows as a quiet lead-in.
    const content = `> ${personalize(question)}\n\n${answer}`;
    try {
      await apiService.createWallPost({ content, mood_tag: TAG, category: 'general', is_private: false });
      trackAction('daily_love.sent');
      setDraft('');
      setJustSent(true);
      showNotification({ type: 'success', title: '存進去了 ❤️', message: 'TA 會在我們的牆上看到。明天再存一點？' });
    } catch (err) {
      const e = err as { error_code?: string; message?: string };
      if (e?.error_code === 'billing:limit-reached') return;
      showNotification({
        type: 'error',
        title: '沒有送出去',
        message: e?.message || '網路好像不太穩，這句話還留著，再按一次試試。',
      });
    }
  });

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6" data-testid="daily-love-view">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 font-body text-sm text-petal-muted hover:text-petal-ink transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> 回到我們
      </button>

      <header className="mb-6">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
          — 今天存一點愛
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-2">
          今天你還<em className="not-italic font-light italic text-pink-600">喜歡</em>他什麼？
        </h1>
        <p className="font-body text-sm text-petal-muted leading-relaxed">
          每天一個小問題，花一分鐘，記下一件你喜歡對方的事。慢慢地，這些會變成你們一起存下的愛。
        </p>
      </header>

      {/* Today's question card */}
      <div className="rounded-3xl border border-petal-rose-soft bg-gradient-to-b from-white to-petal-cream p-6 md:p-8 shadow-petal">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="inline-flex items-center rounded-full bg-petal-rose-soft/50 px-2.5 py-0.5 font-body text-[10px] font-medium uppercase tracking-[0.14em] text-petal-rose-deep">
            今天的問題
          </div>
          <button
            type="button"
            onClick={nextQuestion}
            data-testid="daily-love-shuffle"
            className="inline-flex items-center gap-1.5 font-body text-[12px] text-petal-muted hover:text-petal-ink transition-colors"
          >
            <Shuffle className="w-3.5 h-3.5" strokeWidth={1.5} /> 換一題
          </button>
        </div>

        <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight text-petal-ink leading-[1.3] mb-5" data-testid="daily-love-question">
          {personalize(question)}
        </h2>

        <AutoGrowTextarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (justSent) setJustSent(false); }}
          placeholder="就算只是一件很小的事也可以…"
          data-testid="daily-love-input"
          className="w-full rounded-2xl border border-petal-rule bg-white px-4 py-3 font-body text-base text-petal-ink placeholder:text-petal-muted focus:border-petal-rose-deep focus:outline-none min-h-[110px]"
          autoFocus
        />

        <p className="mt-3 font-body text-[12px] text-petal-muted leading-relaxed">
          送出後會留在我們的牆上，讓 TA 也看見。
        </p>

        <button
          type="button"
          onClick={() => submit()}
          disabled={submitting || draft.trim().length === 0}
          data-testid="daily-love-submit"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-full bg-petal-rose-deep px-5 py-3 font-body text-sm font-medium text-white transition-colors hover:bg-petal-rose disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" strokeWidth={1.5} /> {submitting ? '存入中…' : '存一點愛'}
        </button>
      </div>

      {/* Don't like these? Let AI think of new ones. */}
      <div className="mt-4 flex items-center justify-center">
        <button
          type="button"
          onClick={() => regenerate()}
          disabled={regenerating}
          data-testid="daily-love-regenerate"
          className="inline-flex items-center gap-1.5 rounded-full border border-petal-rule px-4 py-2 font-body text-[13px] text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors disabled:opacity-50"
        >
          {regenerating ? (
            <>
              <Sparkles className="w-4 h-4 animate-pulse" strokeWidth={1.5} /> AI 想中…
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" strokeWidth={1.5} /> 都不喜歡？讓 AI 想幾個新的
            </>
          )}
        </button>
      </div>

      {justSent && (
        <div
          className="mt-5 flex items-center gap-3 rounded-2xl border border-petal-sage/40 bg-petal-sage/10 px-4 py-3.5"
          data-testid="daily-love-sent"
        >
          <Check className="w-4 h-4 text-petal-sage-deeper shrink-0" strokeWidth={2} />
          <span className="min-w-0 flex-1 font-body text-[13px] text-petal-ink">明天再存一點，慢慢累積成你們的愛。</span>
          <button
            type="button"
            onClick={onGoToWall}
            className="shrink-0 font-body text-[13px] font-medium text-petal-rose-deep hover:underline underline-offset-2"
          >
            去我們的牆看看
          </button>
        </div>
      )}
    </div>
  );
};

export default DailyLoveView;
