import React, { useMemo, useState } from 'react';
import { ArrowLeft, Eye, Heart, Shuffle, Send, Check } from 'lucide-react';
import AutoGrowTextarea from './AutoGrowTextarea';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiService } from '../services/api';
import { trackAction } from '../utils/track';
import type { AuthState, Notification } from '../App';

export type AppreciationTheme = 'see-you' | 'secret';

interface AppreciationPromptViewProps {
  theme: AppreciationTheme;
  authState: AuthState;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  onBack: () => void;
  onGoToWall: () => void;
}

// 我看見你 / 他不知道的事 — two appreciation flows that used to be nothing more
// than another link to the wall. Now each is its own guided *card-prompt*
// experience: a rotating question card ("今天他做了哪件小事，是你有注意到的？"),
// an example to lower the blank-page cost, a 換一題 shuffle, then a short write
// that posts to 我們的牆 so TA actually sees that you noticed / that you've
// quietly appreciated this all along. The whole point is the partner receiving
// it — so these post shared (never private) and carry the theme as the mood tag.
//
// Deliberately not an AI generator: the words are yours. It just asks the right
// question and gets out of the way.

interface ThemeConfig {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  // Mood tag stamped on the wall post so the couple (and filters) can tell these
  // apart from a plain post. Kept short and human — it shows on the card.
  tag: string;
  // Rotating question cards. `example` seeds the textarea placeholder so the
  // first line is never a cold blank.
  prompts: { q: string; example: string }[];
  // Reassurance under the write box about who sees this and when.
  reachNote: string;
  cta: string;
  successTitle: string;
  successBody: string;
}

const THEMES: Record<AppreciationTheme, ThemeConfig> = {
  'see-you': {
    eyebrow: '我看見你',
    title: (
      <>
        我<em className="not-italic font-light italic text-pink-600">看見</em>你
      </>
    ),
    subtitle: '有時候愛不是不見了，而是我們太習慣它，所以忘了看見。把今天注意到的一件小事留下來。',
    icon: Eye,
    tag: '我看見你',
    prompts: [
      { q: '今天他做了哪件小事，是你有注意到的？', example: '他今天早上明明很累，還是起來幫小孩穿鞋。' },
      { q: '今天他做了什麼，可能自己都沒覺得有什麼，但你有注意到？', example: '他默默把我昨天沒洗的杯子洗了。' },
      { q: '今天有沒有一個瞬間，讓你覺得被照顧？', example: '出門前他提醒我帶傘，還幫我放進包包。' },
      { q: '他為家裡、為孩子、為你，做了哪件習以為常但其實不容易的事？', example: '他每天晚上都陪小孩刷牙，從來沒喊過累。' },
      { q: '今天他有沒有一個很可愛、讓你想多看一眼的瞬間？', example: '他哄睡到自己先睡著了，嘴巴還微微張著。' },
    ],
    reachNote: '送出後會留在我們的牆上，讓 TA 知道——你有注意到 TA。',
    cta: '讓 TA 知道我看見了',
    successTitle: '已經留在我們的牆上了',
    successBody: 'TA 會看到你注意到了 TA。要不要再看見一件？',
  },
  secret: {
    eyebrow: '他不知道的事',
    title: (
      <>
        他不<em className="not-italic font-light italic text-pink-600">知道</em>的事
      </>
    ),
    subtitle: '有一件你一直很欣賞他、但他可能不知道的事？偷偷告訴他，你其實一直有看到。',
    icon: Heart,
    tag: '他不知道的事',
    prompts: [
      { q: '有一件你一直很欣賞他，但他可能不知道的事？', example: '我一直很喜歡你抱著孩子睡覺的樣子。' },
      { q: '有沒有一個他的樣子，你一直偷偷很喜歡？', example: '你講到你喜歡的事情時，眼睛會發亮，我每次都看得出神。' },
      { q: '有什麼是你從以前到現在都很喜歡他的，卻從來沒說出口？', example: '你總是把最後一塊留給我，這件事我記到現在。' },
      { q: '他有沒有一個小習慣，其實一直很療癒你？', example: '你睡前都會摸摸我的頭，那一下我一整天的累都散了。' },
      { q: '如果他今天能聽見你心裡的一句話，你會說什麼？', example: '謝謝你這麼努力，我都有看見，只是很少說。' },
    ],
    reachNote: '送出後會變成一句悄悄話，留在我們的牆上，讓 TA 收到。',
    cta: '偷偷告訴 TA',
    successTitle: '悄悄話送出去了',
    successBody: 'TA 會在我們的牆上收到這句話。要不要再說一件？',
  },
};

const AppreciationPromptView: React.FC<AppreciationPromptViewProps> = ({
  theme,
  authState,
  showNotification,
  onBack,
  onGoToWall,
}) => {
  const cfg = THEMES[theme];
  const Icon = cfg.icon;
  const them = authState.user?.partnerNickname?.trim();

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [justSent, setJustSent] = useState(false);

  const prompt = cfg.prompts[index];
  // Render "他" as the partner's actual nickname where we have one, so the
  // questions read as being about *this* person, not a generic partner.
  const personalize = useMemo(
    () => (s: string) => (them ? s.replace(/他/g, them) : s),
    [them]
  );

  const nextPrompt = () => {
    trackAction(`appreciation.${theme}.shuffle`);
    setIndex((i) => (i + 1) % cfg.prompts.length);
  };

  const { run: submit, pending } = useAsyncAction(async () => {
    const answer = draft.trim();
    if (!answer) return;
    // Carry the prompt into the post so it reads with context on the wall, not
    // as a floating sentence. Markdown blockquote → the question leads quietly.
    const content = `> ${personalize(prompt.q)}\n\n${answer}`;
    try {
      await apiService.createWallPost({
        content,
        mood_tag: cfg.tag,
        category: 'general',
        is_private: false,
      });
      trackAction(`appreciation.${theme}.sent`);
      setDraft('');
      setJustSent(true);
      showNotification({ type: 'success', title: cfg.successTitle, message: cfg.successBody });
    } catch (err) {
      const e = err as { error_code?: string; message?: string };
      // Let the shared paywall interceptor handle a quota block; only surface a
      // toast for other failures, with a concrete next step.
      if (e?.error_code === 'billing:limit-reached') return;
      showNotification({
        type: 'error',
        title: '沒有送出去',
        message: e?.message || '網路好像不太穩，這句話還留著，再按一次試試。',
      });
    }
  });

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6" data-testid={`appreciation-${theme}`}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 font-body text-sm text-petal-muted hover:text-petal-ink transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> 回到我們
      </button>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
          <span className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted">
            — {cfg.eyebrow}
          </span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-2">
          {cfg.title}
        </h1>
        <p className="font-body text-sm text-petal-muted leading-relaxed">{cfg.subtitle}</p>
      </header>

      {/* The question card */}
      <div className="rounded-3xl border border-petal-rose-soft bg-gradient-to-b from-white to-petal-cream p-6 md:p-8 shadow-petal">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="inline-flex items-center rounded-full bg-petal-rose-soft/50 px-2.5 py-0.5 font-body text-[10px] font-medium uppercase tracking-[0.14em] text-petal-rose-deep">
            {cfg.tag}
          </div>
          <button
            type="button"
            onClick={nextPrompt}
            data-testid={`appreciation-${theme}-shuffle`}
            className="inline-flex items-center gap-1.5 font-body text-[12px] text-petal-muted hover:text-petal-ink transition-colors"
          >
            <Shuffle className="w-3.5 h-3.5" strokeWidth={1.5} /> 換一題
          </button>
        </div>

        <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight text-petal-ink leading-[1.3] mb-5">
          {personalize(prompt.q)}
        </h2>

        <AutoGrowTextarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (justSent) setJustSent(false); }}
          placeholder={`例如：${personalize(prompt.example)}`}
          data-testid={`appreciation-${theme}-input`}
          className="w-full rounded-2xl border border-petal-rule bg-white px-4 py-3 font-body text-base text-petal-ink placeholder:text-petal-muted focus:border-petal-rose-deep focus:outline-none min-h-[110px]"
          autoFocus
        />

        <p className="mt-3 font-body text-[12px] text-petal-muted leading-relaxed">{cfg.reachNote}</p>

        <button
          type="button"
          onClick={() => submit()}
          disabled={pending || draft.trim().length === 0}
          data-testid={`appreciation-${theme}-submit`}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-full bg-petal-rose-deep px-5 py-3 font-body text-sm font-medium text-white transition-colors hover:bg-petal-rose disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" strokeWidth={1.5} /> {pending ? '送出中…' : cfg.cta}
        </button>
      </div>

      {justSent && (
        <div
          className="mt-5 flex items-center gap-3 rounded-2xl border border-petal-sage/40 bg-petal-sage/10 px-4 py-3.5"
          data-testid={`appreciation-${theme}-sent`}
        >
          <Check className="w-4 h-4 text-petal-sage-deeper shrink-0" strokeWidth={2} />
          <span className="min-w-0 flex-1 font-body text-[13px] text-petal-ink">{cfg.successBody}</span>
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

export default AppreciationPromptView;
