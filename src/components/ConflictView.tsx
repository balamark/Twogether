import { useState, useEffect } from 'react';
import { Check, ChevronDown, HandHeart, Pause, Plus, Send } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import InfoHint from './InfoHint';
import { apiService } from '../services/api';
import MarriageCheckup from './MarriageCheckup';
import type { Notification } from '../App';

interface ConflictViewProps {
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  partnerConnected: boolean;
  // Navigate to another top-level view (e.g. the 衝突事件 emotion flow).
  onNavigate?: (view: string) => void;
}

// Conflict / harmony view with the multi-step "pause mode" flow. Defined at
// module scope (not inside App) so its identity is stable across App re-renders
// — a nested definition would remount on every render and reset the pause-mode
// step, timer, and per-phrase send state mid-flow. See issue #41.
const ConflictView = ({ showNotification, partnerConnected, onNavigate }: ConflictViewProps) => {
  // Pause mode — multi-step flow for couples already in a heated argument.
  // Step 1: emotion selection · Step 2: safety phrase · Step 3: enforced
  // turn-taking with 90s timer · Step 4: closing affirmation.
  type EmotionKey = 'angry' | 'hurt' | 'cold' | 'overwhelmed';
  const EMOTION_OPTIONS: { key: EmotionKey; emoji: string; label: string; sub: string; phrase: string }[] = [
    {
      key: 'angry',
      emoji: '😡',
      label: '生氣',
      sub: '想反擊',
      phrase: '我現在有點激動，我怕我會講出傷人的話，我想先停一下，但我不是不在乎你。',
    },
    {
      key: 'hurt',
      emoji: '😞',
      label: '受傷',
      sub: '想被理解',
      phrase: '我現在其實有點難過，我需要你先聽我講完，不然我會更失落。',
    },
    {
      key: 'cold',
      emoji: '😐',
      label: '冷掉',
      sub: '不想講了',
      phrase: '我現在腦袋有點關機，我需要一點時間消化，但我會回來，不是不在乎。',
    },
    {
      key: 'overwhelmed',
      emoji: '😣',
      label: '快爆了',
      sub: '撐不住了',
      phrase: '我快撐不住了，我需要先暫停喘口氣，這不是不想處理，是先讓自己冷靜。',
    },
  ];

  const TURN_SECONDS = 90;
  const [pauseStep, setPauseStep] = useState<1 | 2 | 3 | 4 | null>(null);
  useScrollLock(pauseStep !== null);
  const [pauseEmotion, setPauseEmotion] = useState<EmotionKey | null>(null);
  const [pauseRound, setPauseRound] = useState<1 | 2>(1);
  const [pauseSeconds, setPauseSeconds] = useState(TURN_SECONDS);
  const [listenerNudge, setListenerNudge] = useState<string | null>(null);

  // Article expand/collapse — keep long-read tucked away by default so the page stays scannable.

  // Per-phrase send-to-partner state. Key = `${tier.key}-${phraseIndex}`.
  const [phraseStatus, setPhraseStatus] = useState<Record<string, 'idle' | 'sending' | 'sent'>>({});

  // Toolkit Step 2 accordion — which "need" is currently expanded.
  const [expandedNeed, setExpandedNeed] = useState<string | null>(null);

  // Custom-message composer state — per-step drafts and expanded/collapsed.
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [customExpanded, setCustomExpanded] = useState<Record<string, boolean>>({});

  // Toolkit content — 4-step interactive flow for active conflict.
  const emotionFullMessage = '我聽到你了，但我現在情緒有點滿，需要先停一下。我等一下會回來跟你說。';

  const partnerNeedsItems: {
    key: string;
    icon: string;
    title: string;
    body: string;
    suggestions?: string[];
  }[] = [
    {
      key: 'pause-no-explain',
      icon: '①',
      title: '先停下來，不要解釋，不要辯論',
      body: '我現在聽不進理性內容，你越解釋，我越痛。你只要先停下來，我會比較快冷靜。',
    },
    {
      key: 'affirm-feeling',
      icon: '②',
      title: '用一句肯定我情緒的話（一定要有）',
      body: '我不是要你道歉，是要你讓我覺得「你有看見我」。',
      suggestions: [
        '我知道我剛的話讓你不舒服了。',
        '我看得出來你在生氣。',
        '我先陪你一下。',
      ],
    },
    {
      key: 'give-step-down',
      icon: '③',
      title: '給我一個台階：你願意等我',
      body: '有台階，我就會回頭。沒有台階，我只會越走越遠。',
      suggestions: [
        '你先休息一下，我在這裡等你。',
        '等你準備好了，我們再一起聊。',
      ],
    },
  ];

  const exitOptions: { key: string; numeral: string; label: string; message: string }[] = [
    {
      key: 'pause-10min',
      numeral: '1️⃣',
      label: '暫停 10 分鐘',
      message: '我會離開一下下，十分鐘後我們再回到同一個話題。',
    },
    {
      key: 'pause-until-calm',
      numeral: '2️⃣',
      label: '暫停到情緒穩定',
      message: '我現在想先讓情緒平穩，等我冷靜，我會主動來找你。',
    },
    {
      key: 'switch-to-text',
      numeral: '3️⃣',
      label: '用文字聊代替現場聊',
      message: '我現在用說的會越來越激動，我們改用訊息聊，好讓彼此舒服。',
    },
  ];

  const tenderPhrases: string[] = [
    '我沒有要跟你對立，我想靠近你。',
    '你的感受我放在心上。',
    '我在這裡，你慢慢來。',
  ];

  const soothingEmojis: string[] = ['🤝', '🫶', '🌙', '🤍', '🐻', '✨'];

  const caringQuestion = '現在我能怎麼讓你舒服一點？';

  const caringReplyOptions: string[] = [
    '給我 5 分鐘就好。',
    '說一句讓我安心的話。',
    '先抱一下我。',
  ];

  const handleSendPhrase = async (phrase: string, key: string) => {
    if (!partnerConnected) {
      showNotification({
        type: 'warning',
        title: '尚未配對伴侶',
        message: '需要先配對伴侶才能直接傳訊息給對方。',
        duration: 4000,
      });
      return;
    }
    if (phraseStatus[key] === 'sending' || phraseStatus[key] === 'sent') return;
    const confirmed = window.confirm(`確定要把這句話傳給TA嗎？\n\n「${phrase}」`);
    if (!confirmed) return;
    setPhraseStatus(prev => ({ ...prev, [key]: 'sending' }));
    try {
      await apiService.createIntimacyRequest({
        messageContent: phrase,
        requestType: 'reconciliation',
      });
      setPhraseStatus(prev => ({ ...prev, [key]: 'sent' }));
      showNotification({
        type: 'success',
        title: '已送給TA',
        message: '訊息已送到對方的邀請紀錄。',
        duration: 3000,
      });
    } catch (err) {
      setPhraseStatus(prev => ({ ...prev, [key]: 'idle' }));
      showNotification({
        type: 'error',
        title: '送出失敗',
        message: (err as Error)?.message || '請稍後再試。',
        duration: 4000,
      });
    }
  };

  // Custom-message sender — same reconciliation channel, but uses the per-step textarea draft.
  // Resets composer state on success so users can send multiple custom messages in a row.
  const handleSendCustom = async (key: string) => {
    const draft = (customDrafts[key] || '').trim();
    if (!draft) {
      showNotification({
        type: 'warning',
        title: '訊息不能為空',
        message: '請先寫一些字再送出。',
        duration: 3000,
      });
      return;
    }
    if (!partnerConnected) {
      showNotification({
        type: 'warning',
        title: '尚未配對伴侶',
        message: '需要先配對伴侶才能直接傳訊息給對方。',
        duration: 4000,
      });
      return;
    }
    if (phraseStatus[key] === 'sending') return;
    const confirmed = window.confirm(`確定要把這則自訂訊息傳給TA嗎？\n\n「${draft}」`);
    if (!confirmed) return;
    setPhraseStatus(prev => ({ ...prev, [key]: 'sending' }));
    try {
      await apiService.createIntimacyRequest({
        messageContent: draft,
        requestType: 'reconciliation',
      });
      showNotification({
        type: 'success',
        title: '已送給TA',
        message: '自訂訊息已送到對方的邀請紀錄。',
        duration: 3000,
      });
      setPhraseStatus(prev => ({ ...prev, [key]: 'idle' }));
      setCustomDrafts(prev => ({ ...prev, [key]: '' }));
      setCustomExpanded(prev => ({ ...prev, [key]: false }));
    } catch (err) {
      setPhraseStatus(prev => ({ ...prev, [key]: 'idle' }));
      showNotification({
        type: 'error',
        title: '送出失敗',
        message: (err as Error)?.message || '請稍後再試。',
        duration: 4000,
      });
    }
  };

  // Inline custom-message composer — collapsed button by default, expands to textarea + send.
  const renderCustomComposer = (key: string, placeholder = '寫一句自己想說的話傳給TA…') => {
    const draft = customDrafts[key] || '';
    const expanded = !!customExpanded[key];
    const status = phraseStatus[key] || 'idle';
    const isSending = status === 'sending';

    if (!expanded) {
      return (
        <button
          type="button"
          onClick={() => setCustomExpanded(prev => ({ ...prev, [key]: true }))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border border-dashed border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink hover:bg-white/70 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
          寫自己的訊息
        </button>
      );
    }

    const trimmedLen = draft.trim().length;
    const canSend = !isSending && trimmedLen > 0 && partnerConnected;

    return (
      <div className="bg-white/90 rounded-md border border-petal-rule p-3">
        <textarea
          value={draft}
          onChange={(e) => setCustomDrafts(prev => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={2}
          maxLength={300}
          disabled={isSending}
          className="w-full font-body text-sm text-petal-ink leading-relaxed bg-transparent border-0 resize-none focus:outline-none placeholder:text-petal-muted/70"
        />
        <div className="flex items-center justify-between gap-2 mt-1.5 pt-2 border-t border-petal-rule-soft">
          <span className="font-body text-[11px] text-petal-muted">
            {draft.length}/300
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCustomExpanded(prev => ({ ...prev, [key]: false }));
                setCustomDrafts(prev => ({ ...prev, [key]: '' }));
              }}
              disabled={isSending}
              className="px-3 py-1.5 rounded-full font-body text-xs text-petal-muted hover:text-petal-ink transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => handleSendCustom(key)}
              disabled={!canSend}
              title={!partnerConnected ? '需要先配對伴侶' : ''}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors ${
                isSending
                  ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                  : canSend
                    ? 'border-petal-rose bg-white text-petal-rose-deep hover:bg-petal-rose hover:text-white hover:border-petal-rose'
                    : 'border-petal-rule bg-white text-petal-muted opacity-60 cursor-not-allowed'
              }`}
            >
              {isSending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                  傳送中
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                  傳給TA
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sectionNav: { id: string; label: string }[] = [
    { id: 'conflict-lead', label: '先接住情緒' },
    { id: 'conflict-pause', label: '正在爭吵中' },
    { id: 'conflict-toolkit', label: '應對工具' },
    { id: 'conflict-checkup', label: '婚姻檢查' },
  ];

  // Tick timer while on Step 3
  useEffect(() => {
    if (pauseStep !== 3) return;
    const id = setInterval(() => setPauseSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [pauseStep, pauseRound]);

  // When timer hits 0, advance to next round or to Step 4
  useEffect(() => {
    if (pauseStep !== 3 || pauseSeconds > 0) return;
    if (pauseRound === 1) {
      setPauseRound(2);
      setPauseSeconds(TURN_SECONDS);
      setListenerNudge(null);
    } else {
      setPauseStep(4);
    }
  }, [pauseSeconds, pauseStep, pauseRound]);

  const openPause = () => {
    setPauseEmotion(null);
    setPauseRound(1);
    setPauseSeconds(TURN_SECONDS);
    setListenerNudge(null);
    setPauseStep(1);
  };
  const closePause = () => setPauseStep(null);

  const pickEmotion = (key: EmotionKey) => {
    setPauseEmotion(key);
    setPauseStep(2);
  };

  const enterTurnTaking = () => {
    setPauseRound(1);
    setPauseSeconds(TURN_SECONDS);
    setListenerNudge(null);
    setPauseStep(3);
  };

  const skipTurn = () => {
    if (pauseRound === 1) {
      setPauseRound(2);
      setPauseSeconds(TURN_SECONDS);
      setListenerNudge(null);
    } else {
      setPauseStep(4);
    }
  };

  const handleListenerReact = (label: string) => {
    setListenerNudge(label);
    window.setTimeout(() => {
      setListenerNudge(current => (current === label ? null : current));
    }, 2200);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  const selectedPhrase = pauseEmotion ? EMOTION_OPTIONS.find(o => o.key === pauseEmotion) : null;

  return (
  <div className="space-y-10">
    <div className="border-b border-petal-rule pb-7">
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
        — 和諧
      </div>
      <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
        和諧<em className="not-italic font-light italic text-pink-600">相處</em>
        <span className="align-middle ml-2"><InfoHint viewId="conflict" /></span>
      </h2>
      <p className="font-display italic font-light text-base text-petal-muted">
        化解矛盾，增進理解 — 把急切的話留到明天再說。
      </p>
    </div>

    {/* Sticky section nav — quick jumps within 和諧相處 */}
    <nav
      aria-label="頁面區塊"
      className="sticky top-0 z-30 -mt-6 -mx-4 px-4 py-2.5 bg-petal-cream/95 backdrop-blur-sm border-b border-petal-rule"
    >
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
        {sectionNav.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollToSection(s.id)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full border border-petal-rule bg-white/70 text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink font-body text-xs font-medium tracking-tight transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>

    {/* Acceptance-first lead — the heart of the feature: receive the feeling
        before trying to fix anything. Routes into the 衝突事件 emotion flow. */}
    <div
      id="conflict-lead"
      className="bg-petal-rose/10 border-2 border-petal-rose/30 rounded-md p-5 md:p-6 scroll-mt-20"
    >
      <div className="flex items-start gap-4">
        <div className="hidden sm:flex w-12 h-12 flex-shrink-0 rounded-full bg-white border border-petal-rose/40 items-center justify-center">
          <HandHeart className="w-5 h-5 text-petal-rose-deep" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
            — 先接住情緒，溝通才開始
          </div>
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-2">
            被接住的那一刻，<em className="not-italic font-light italic text-pink-600">修復才開始</em>
          </h3>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-4">
            當情緒沒有被接納，人會覺得自己被否定。所以在講道理、找解法之前，先讓彼此的感受被看見、被接住。
            把心裡的情緒寫下來，AI 幫你說得不傷人；對方收到後，AI 也會教他怎麼接住你的情緒。
            用寫的，比當下用說的更容易把話說對：急切的話留到明天，傷害留在草稿裡。
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('events')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-petal-ink text-petal-cream font-body text-sm font-medium hover:bg-pink-700 transition-colors"
          >
            <HandHeart className="w-4 h-4" strokeWidth={1.75} />
            寫下我的情緒，讓對方接住
          </button>
        </div>
      </div>
    </div>

    {/* Emergency Pause — entry card for couples in active conflict */}
    <div id="conflict-pause" className="bg-amber-50 border-2 border-amber-300 rounded-md p-5 md:p-6 scroll-mt-20">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <h3 className="font-display text-lg font-medium tracking-tight text-amber-900 mb-1 flex items-center">
            <Pause className="w-4 h-4 mr-2 fill-amber-700 text-amber-700" strokeWidth={1.5} />
            正在爭吵中？
          </h3>
          <p className="font-body text-sm text-amber-900/80 leading-relaxed">
            進入<b className="not-italic font-medium">冷靜連結模式</b>：4 步引導你們先降溫、再說話，而不是讓溝通變成武器。
          </p>
        </div>
        <button
          type="button"
          onClick={openPause}
          className="px-5 py-3 bg-amber-600 text-white rounded-md text-base font-medium hover:bg-amber-700 transition-colors whitespace-nowrap flex-shrink-0 flex items-center justify-center gap-2"
        >
          <Pause className="w-4 h-4 fill-white" strokeWidth={1.5} />
          暫停一下
        </button>
      </div>
    </div>

    {/* Both-sides conflict toolkit — 4-step interactive guide with sendable messages per step */}
    <section id="conflict-toolkit" className="scroll-mt-20">
      <header className="mb-6">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 衝突進行中的工具箱
        </div>
        <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-2">
          雙方衝突時的<em className="not-italic font-light italic text-pink-600">應對工具</em>
        </h3>
        <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
          四個小步驟，從「我滿了」走到「我們重新靠近」。每一步都有一鍵就能送到TA那裡的訊息。
          {!partnerConnected && (
            <span className="block mt-1.5 text-petal-muted text-xs">
              配對伴侶後，點任何「傳給TA」按鈕即可直接送出。
            </span>
          )}
        </p>
      </header>

      <div className="space-y-5">
        {/* Step 1 — Notify TA that you're emotionally full */}
        <article className="bg-violet-50/60 border-2 border-violet-200 rounded-md p-5 md:p-7">
          <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800 bg-violet-100/80 px-2.5 py-1 rounded">
              <span aria-hidden>🟣</span>
              Step 1
            </span>
            <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
              我現在情緒滿了
            </h4>
          </header>
          <p className="font-body text-[13px] text-petal-ink-soft mb-4 leading-relaxed">
            用一句話讓TA知道你需要空間 — 不是生氣、不是不想聽，只是情緒太滿了。
          </p>
          <blockquote className="font-display italic text-[15px] text-petal-ink bg-white/70 rounded-md p-4 border border-white mb-4 leading-relaxed">
            「我現在需要一下下的空間，不是生你的氣，也不是不想聽，只是情緒太滿了。」
          </blockquote>

          <div className="bg-white/80 rounded-md p-4 border border-violet-200/50">
            <div className="font-body text-[11px] uppercase tracking-[0.14em] text-violet-800/80 mb-2">
              📩 一鍵傳送（自動訊息）
            </div>
            <p className="font-display italic text-[14px] text-petal-ink mb-3 leading-relaxed">
              「{emotionFullMessage}」
            </p>
            {(() => {
              const key = 'toolkit-step1-notify';
              const status = phraseStatus[key] || 'idle';
              return (
                <button
                  type="button"
                  onClick={() => handleSendPhrase(emotionFullMessage, key)}
                  disabled={status === 'sending' || status === 'sent'}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md font-body text-sm font-medium border transition-colors ${
                    status === 'sent'
                      ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                      : status === 'sending'
                        ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                        : partnerConnected
                          ? 'border-violet-400 bg-violet-600 text-white hover:bg-violet-700 hover:border-violet-700'
                          : 'border-petal-rule bg-white text-petal-muted opacity-60'
                  }`}
                >
                  {status === 'sent' ? (
                    <>
                      <Check className="w-4 h-4" strokeWidth={2} />
                      已傳送：情緒已滿的通知
                    </>
                  ) : status === 'sending' ? (
                    <>
                      <span className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                      傳送中…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" strokeWidth={1.75} />
                      傳送：情緒已滿的通知
                    </>
                  )}
                </button>
              );
            })()}
          </div>

          <div className="mt-4">
            {renderCustomComposer('toolkit-step1-custom', '想用自己的話告訴TA「我滿了」？寫在這…')}
          </div>
        </article>

        {/* Step 2 — 3 things TA most needs to know (accordion) */}
        <article className="bg-sky-50/60 border-2 border-sky-200 rounded-md p-5 md:p-7">
          <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800 bg-sky-100/80 px-2.5 py-1 rounded">
              <span aria-hidden>🔵</span>
              Step 2
            </span>
            <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
              給TA看的：3 件我最需要的事情
            </h4>
          </header>
          <p className="font-body text-[13px] text-petal-ink-soft mb-4 leading-relaxed">
            點開每一項，讓TA了解你最需要什麼。展開後的建議話語可以一鍵傳給TA。
          </p>

          <div className="space-y-2">
            {partnerNeedsItems.map((item) => {
              const isExpanded = expandedNeed === item.key;
              return (
                <div key={item.key} className="bg-white/80 rounded-md border border-sky-200/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedNeed(isExpanded ? null : item.key)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-sky-50/40 transition-colors"
                    aria-expanded={isExpanded}
                  >
                    <span className="font-display text-petal-rose-deep text-base flex-shrink-0">{item.icon}</span>
                    <span className="font-display text-[15px] font-medium text-petal-ink flex-1 leading-snug">
                      {item.title}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-petal-muted flex-shrink-0 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      strokeWidth={1.5}
                    />
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-sky-100">
                      <p className="font-body text-[13px] text-petal-ink-soft mb-3 leading-relaxed">
                        {item.body}
                      </p>
                      {item.suggestions && (
                        <>
                          <div className="font-body text-[11px] uppercase tracking-[0.14em] text-sky-800/80 mb-2">
                            建議話語
                          </div>
                          <ul className="space-y-2">
                            {item.suggestions.map((s, i) => {
                              const key = `toolkit-step2-${item.key}-${i}`;
                              const status = phraseStatus[key] || 'idle';
                              return (
                                <li
                                  key={i}
                                  className="flex flex-col sm:flex-row sm:items-start gap-2 bg-white rounded-md p-3 border border-sky-100"
                                >
                                  <blockquote className="font-display text-[14px] text-petal-ink leading-relaxed flex-1">
                                    「{s}」
                                  </blockquote>
                                  <button
                                    type="button"
                                    onClick={() => handleSendPhrase(s, key)}
                                    disabled={status === 'sending' || status === 'sent'}
                                    title={partnerConnected ? '傳送這句話給TA' : '需要先配對伴侶'}
                                    className={`flex-shrink-0 self-end sm:self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors ${
                                      status === 'sent'
                                        ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                                        : status === 'sending'
                                          ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                                          : partnerConnected
                                            ? 'border-sky-300 bg-white text-sky-800 hover:bg-sky-600 hover:text-white hover:border-sky-600'
                                            : 'border-petal-rule bg-white text-petal-muted opacity-60'
                                    }`}
                                  >
                                    {status === 'sent' ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" strokeWidth={2} />
                                        已送出
                                      </>
                                    ) : status === 'sending' ? (
                                      <>
                                        <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                                        傳送中
                                      </>
                                    ) : (
                                      <>
                                        <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                                        傳給TA
                                      </>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            {renderCustomComposer('toolkit-step2-custom', '想自己跟TA說「我最需要的是…」？寫在這…')}
          </div>
        </article>

        {/* Step 3 — 3 exit options for pausing the conflict */}
        <article className="bg-orange-50/60 border-2 border-orange-200 rounded-md p-5 md:p-7">
          <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-800 bg-orange-100/80 px-2.5 py-1 rounded">
              <span aria-hidden>🟠</span>
              Step 3
            </span>
            <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
              衝突升起時的退場流程
            </h4>
          </header>
          <p className="font-body text-[13px] text-petal-ink-soft mb-4 leading-relaxed">
            選一種暫停方式，一鍵把對應的暫停訊息送給TA。
          </p>

          <div className="space-y-3">
            {exitOptions.map((opt) => {
              const key = `toolkit-step3-${opt.key}`;
              const status = phraseStatus[key] || 'idle';
              return (
                <div key={opt.key} className="bg-white/80 rounded-md p-4 border border-orange-200/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base" aria-hidden>{opt.numeral}</span>
                    <span className="font-display text-[15px] font-medium text-petal-ink">
                      {opt.label}
                    </span>
                  </div>
                  <p className="font-display italic text-[14px] text-petal-ink-soft mb-3 leading-relaxed">
                    「{opt.message}」
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSendPhrase(opt.message, key)}
                    disabled={status === 'sending' || status === 'sent'}
                    title={partnerConnected ? '傳送這個暫停訊息給TA' : '需要先配對伴侶'}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-md font-body text-sm font-medium border transition-colors ${
                      status === 'sent'
                        ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                        : status === 'sending'
                          ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                          : partnerConnected
                            ? 'border-orange-400 bg-white text-orange-800 hover:bg-orange-600 hover:text-white hover:border-orange-600'
                            : 'border-petal-rule bg-white text-petal-muted opacity-60'
                    }`}
                  >
                    {status === 'sent' ? (
                      <>
                        <Check className="w-4 h-4" strokeWidth={2} />
                        已傳送
                      </>
                    ) : status === 'sending' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                        傳送中…
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" strokeWidth={1.75} />
                        選這個 — 傳給TA
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            {renderCustomComposer('toolkit-step3-custom', '想自己寫一個暫停的方式？例如「等我洗完澡再聊」…')}
          </div>
        </article>

        {/* Step 4 — 3 small tasks to bring me back */}
        <article className="bg-amber-50/70 border-2 border-amber-200 rounded-md p-5 md:p-7">
          <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded">
              <span aria-hidden>🟡</span>
              Step 4
            </span>
            <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
              讓我冷靜後願意回來的關鍵
            </h4>
          </header>
          <p className="font-body text-[13px] text-petal-ink-soft mb-5 leading-relaxed">
            當你準備好靠近TA時 — 或想告訴TA「這樣對我最有效」 — 這三件小事最能拉近距離。
          </p>

          {/* Task 1 — tender phrase */}
          <div className="mb-6">
            <div className="font-body text-[12px] font-semibold tracking-tight text-amber-900 mb-2 flex items-center gap-1.5">
              <span aria-hidden>✔</span>
              任務 1 — 傳一句溫柔語氣
            </div>
            <ul className="space-y-2">
              {tenderPhrases.map((p, i) => {
                const key = `toolkit-step4-tender-${i}`;
                const status = phraseStatus[key] || 'idle';
                return (
                  <li
                    key={i}
                    className="flex flex-col sm:flex-row sm:items-start gap-2 bg-white/80 rounded-md p-3 border border-amber-200/50"
                  >
                    <blockquote className="font-display text-[14px] text-petal-ink leading-relaxed flex-1">
                      「{p}」
                    </blockquote>
                    <button
                      type="button"
                      onClick={() => handleSendPhrase(p, key)}
                      disabled={status === 'sending' || status === 'sent'}
                      title={partnerConnected ? '傳送這句話給TA' : '需要先配對伴侶'}
                      className={`flex-shrink-0 self-end sm:self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors ${
                        status === 'sent'
                          ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                          : status === 'sending'
                            ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                            : partnerConnected
                              ? 'border-amber-400 bg-white text-amber-800 hover:bg-amber-600 hover:text-white hover:border-amber-600'
                              : 'border-petal-rule bg-white text-petal-muted opacity-60'
                      }`}
                    >
                      {status === 'sent' ? (
                        <>
                          <Check className="w-3.5 h-3.5" strokeWidth={2} />
                          已送出
                        </>
                      ) : status === 'sending' ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                          傳送中
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                          傳給TA
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Task 2 — soothing emoji */}
          <div className="mb-6">
            <div className="font-body text-[12px] font-semibold tracking-tight text-amber-900 mb-2 flex items-center gap-1.5">
              <span aria-hidden>✔</span>
              任務 2 — 傳一個安撫 emoji
            </div>
            <p className="font-body text-xs text-petal-ink-soft mb-3 leading-relaxed">
              點一個 emoji 就送出，不用任何文字。
            </p>
            <div className="flex flex-wrap gap-2">
              {soothingEmojis.map((emoji, i) => {
                const key = `toolkit-step4-emoji-${i}`;
                const status = phraseStatus[key] || 'idle';
                const isSent = status === 'sent';
                const isSending = status === 'sending';
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendPhrase(emoji, key)}
                    disabled={isSent || isSending}
                    title={
                      isSent ? '已送出' : partnerConnected ? `傳送 ${emoji} 給TA` : '需要先配對伴侶'
                    }
                    className={`w-12 h-12 text-2xl rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSent
                        ? 'border-petal-sage bg-petal-sage/15 cursor-default'
                        : isSending
                          ? 'border-petal-rule bg-white opacity-60 cursor-wait'
                          : partnerConnected
                            ? 'border-amber-300 bg-white hover:bg-amber-100 hover:border-amber-500'
                            : 'border-petal-rule bg-white opacity-60'
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Task 3 — caring question with pre-prepared replies */}
          <div>
            <div className="font-body text-[12px] font-semibold tracking-tight text-amber-900 mb-2 flex items-center gap-1.5">
              <span aria-hidden>✔</span>
              任務 3 — 問一個貼心小問題
            </div>
            <div className="bg-white/80 rounded-md p-4 border border-amber-200/50">
              <blockquote className="font-display italic text-[15px] text-petal-ink mb-3 leading-relaxed">
                「{caringQuestion}」
              </blockquote>
              {(() => {
                const key = 'toolkit-step4-question';
                const status = phraseStatus[key] || 'idle';
                return (
                  <button
                    type="button"
                    onClick={() => handleSendPhrase(caringQuestion, key)}
                    disabled={status === 'sending' || status === 'sent'}
                    title={partnerConnected ? '把這個問題傳給TA' : '需要先配對伴侶'}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-md font-body text-sm font-medium border transition-colors ${
                      status === 'sent'
                        ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                        : status === 'sending'
                          ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                          : partnerConnected
                            ? 'border-amber-400 bg-white text-amber-800 hover:bg-amber-600 hover:text-white hover:border-amber-600'
                            : 'border-petal-rule bg-white text-petal-muted opacity-60'
                    }`}
                  >
                    {status === 'sent' ? (
                      <>
                        <Check className="w-4 h-4" strokeWidth={2} />
                        已傳送
                      </>
                    ) : status === 'sending' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                        傳送中…
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" strokeWidth={1.75} />
                        傳這句話給TA
                      </>
                    )}
                  </button>
                );
              })()}

              <div className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-muted mt-5 mb-2">
                你可以選的回覆（一鍵送出）
              </div>
              <ul className="space-y-2">
                {caringReplyOptions.map((r, i) => {
                  const key = `toolkit-step4-reply-${i}`;
                  const status = phraseStatus[key] || 'idle';
                  return (
                    <li
                      key={i}
                      className="flex flex-col sm:flex-row sm:items-start gap-2 bg-white rounded-md p-3 border border-amber-100"
                    >
                      <blockquote className="font-display text-[14px] text-petal-ink leading-relaxed flex-1">
                        「{r}」
                      </blockquote>
                      <button
                        type="button"
                        onClick={() => handleSendPhrase(r, key)}
                        disabled={status === 'sending' || status === 'sent'}
                        title={partnerConnected ? '把這個回覆送給TA' : '需要先配對伴侶'}
                        className={`flex-shrink-0 self-end sm:self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors ${
                          status === 'sent'
                            ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                            : status === 'sending'
                              ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                              : partnerConnected
                                ? 'border-amber-400 bg-white text-amber-800 hover:bg-amber-600 hover:text-white hover:border-amber-600'
                                : 'border-petal-rule bg-white text-petal-muted opacity-60'
                        }`}
                      >
                        {status === 'sent' ? (
                          <>
                            <Check className="w-3.5 h-3.5" strokeWidth={2} />
                            已送出
                          </>
                        ) : status === 'sending' ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                            傳送中
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                            傳給TA
                          </>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-amber-200/60">
            {renderCustomComposer('toolkit-step4-custom', '想自己寫一句靠近TA的話？寫在這…')}
          </div>
        </article>
      </div>

      <p className="font-display italic text-center text-sm text-petal-muted mt-6 leading-relaxed">
        工具是橋 — 一步步走，回到彼此身邊。
      </p>
    </section>

    {/* 婚姻檢查 — periodic structured relationship review */}
    <MarriageCheckup showNotification={showNotification} partnerConnected={partnerConnected} />

    {/* Pause Mode — full-screen guided flow */}
    {/* Scroll the inner container, not the fixed layer: a `position: fixed`
        element that scrolls its own content is hit-tested against the visual
        viewport while it's painted against the layout viewport on iOS, which
        makes taps land offset from the finger. */}
    {pauseStep !== null && (
      <div className="fixed inset-0 z-50 bg-petal-cream flex flex-col">
        <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 py-8 flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col safe-pb">
          {/* Top bar */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="font-body text-[11px] uppercase tracking-[0.18em] text-amber-700 mb-1">— 暫停模式</div>
              <div className="font-display text-xl text-petal-ink">冷靜連結模式</div>
              <div className="font-body text-xs text-petal-muted mt-0.5">Step {pauseStep} / 4</div>
            </div>
            <button
              type="button"
              onClick={closePause}
              aria-label="關閉"
              className="text-petal-muted hover:text-petal-ink text-3xl leading-none p-2 -m-2"
            >
              ×
            </button>
          </div>

          {/* Step 1 — Emotion selection */}
          {pauseStep === 1 && (
            <div className="flex-1 flex flex-col">
              <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-2">
                你現在比較像哪一種狀態？
              </h2>
              <p className="font-body text-sm text-petal-ink-soft mb-8">
                選一個最接近的。這一步不是分析，是讓情緒被命名。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                {EMOTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => pickEmotion(opt.key)}
                    className="bg-white border-2 border-petal-rule rounded-md p-5 text-left hover:border-amber-400 hover:bg-amber-50/50 transition-colors min-h-[5.5rem]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl leading-none" aria-hidden>{opt.emoji}</span>
                      <div>
                        <div className="font-display text-lg font-medium text-petal-ink">{opt.label}</div>
                        <div className="font-body text-xs text-petal-ink-soft mt-0.5">{opt.sub}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Safety phrase */}
          {pauseStep === 2 && selectedPhrase && (
            <div className="flex-1 flex flex-col">
              <div className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted mb-3">
                你選的狀態：{selectedPhrase.emoji} {selectedPhrase.label}
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-2">
                照念這句話給對方聽
              </h2>
              <p className="font-body text-sm text-petal-ink-soft mb-8">
                不用自己想，直接念。重點是把界線講清楚，又不切斷連結。
              </p>

              <div className="bg-white border-2 border-amber-300 rounded-md p-6 md:p-8 mb-8 flex-1 flex items-center">
                <p className="font-display text-xl md:text-2xl font-light text-petal-ink leading-relaxed text-center w-full">
                  「{selectedPhrase.phrase}」
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setPauseStep(1)}
                  className="px-5 py-3 border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink rounded-md font-body text-sm transition-colors"
                >
                  ← 換一個情緒
                </button>
                <button
                  type="button"
                  onClick={enterTurnTaking}
                  className="flex-1 px-5 py-3 bg-amber-600 text-white rounded-md text-base font-medium hover:bg-amber-700 transition-colors"
                >
                  我念完了，開始輪流說 →
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Enforced turn-taking */}
          {pauseStep === 3 && (
            <div className="flex-1 flex flex-col">
              <div className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted mb-2">
                第 {pauseRound} 輪 / 共 2 輪
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-1">
                現在輪到：<span className="text-amber-700">{pauseRound === 1 ? 'A 方' : 'B 方'}</span> 說話
              </h2>
              <p className="font-body text-sm text-petal-ink-soft mb-6">
                {pauseRound === 1
                  ? 'A 方＝剛剛選擇情緒的那位。另一方只能聽，不能打斷。'
                  : 'B 方＝另一位。同樣只能聽，不能打斷。'}
              </p>

              {/* Timer */}
              <div className="bg-white border-2 border-amber-200 rounded-md p-6 mb-6 text-center">
                <div className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted mb-2">剩餘時間</div>
                <div className="font-display text-5xl md:text-6xl font-light text-amber-700 tabular-nums tracking-wide">
                  {formatTime(pauseSeconds)}
                </div>
                <div className="w-full h-1.5 bg-amber-100 rounded-full mt-4 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${(pauseSeconds / TURN_SECONDS) * 100}%` }}
                  />
                </div>
              </div>

              {/* Listener reactions */}
              <div className="flex-1">
                <p className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted mb-3 text-center">
                  聆聽者只能回應 — 不能打斷
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleListenerReact('我在聽')}
                    className="bg-white border-2 border-petal-rule rounded-md p-4 hover:border-amber-400 hover:bg-amber-50/40 transition-colors text-petal-ink font-body text-base"
                  >
                    <span className="text-2xl mr-2" aria-hidden>👍</span>
                    我在聽
                  </button>
                  <button
                    type="button"
                    onClick={() => handleListenerReact('我理解你在努力說')}
                    className="bg-white border-2 border-petal-rule rounded-md p-4 hover:border-amber-400 hover:bg-amber-50/40 transition-colors text-petal-ink font-body text-base"
                  >
                    <span className="text-2xl mr-2" aria-hidden>💛</span>
                    我理解你在努力說
                  </button>
                </div>
                {listenerNudge && (
                  <p className="mt-4 font-display italic text-center text-amber-700 text-sm" role="status">
                    ✓ {listenerNudge}
                  </p>
                )}
              </div>

              {/* Skip turn */}
              <div className="mt-6 pt-4 border-t border-petal-rule-soft text-center">
                <button
                  type="button"
                  onClick={skipTurn}
                  className="font-body text-xs text-petal-muted hover:text-petal-ink transition-colors"
                >
                  {pauseRound === 1 ? '已經講完，換對方 →' : '已經講完，進入收尾 →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Closing */}
          {pauseStep === 4 && (
            <div className="flex-1 flex flex-col justify-center">
              <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-2 text-center">
                你們做到了。
              </h2>
              <p className="font-body text-sm text-petal-ink-soft text-center mb-10 leading-relaxed">
                不一定要現在解決所有事，<br />
                能夠暫停、聽到彼此，已經是進展。
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={closePause}
                  className="w-full px-5 py-4 bg-amber-600 text-white rounded-md text-base font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="text-xl" aria-hidden>🤝</span>
                  我理解你現在的感覺
                </button>
                <button
                  type="button"
                  onClick={closePause}
                  className="w-full px-5 py-4 bg-white border-2 border-amber-300 text-amber-900 rounded-md text-base font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Pause className="w-4 h-4 fill-amber-700 text-amber-700" strokeWidth={1.5} />
                  我們先暫停 10 分鐘
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
  );
};

export default ConflictView;

