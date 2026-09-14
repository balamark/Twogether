import { useCallback, useEffect, useState } from 'react';
import {
  ChevronRight, Heart, Loader2, MailOpen, Pause, Send, ShieldAlert, Sparkles,
} from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import AutoGrowTextarea from './AutoGrowTextarea';
import { apiService } from '../services/api';
import type {
  ConflictIntervention,
  ConflictSendResult,
  ConflictTranslation,
  SophieCoreOption,
  SophiePauseCopy,
  SophieSafetyCopy,
} from '../services/api';
import type { Notification } from '../App';

interface Props {
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  partnerConnected: boolean;
}

// The steps of the held-message intervention, shown as a full-screen overlay so
// the user is never split between the argument and the pause.
type Phase = 'pause' | 'question' | 'confirm' | 'release' | 'safety';

// Fallbacks so the flow renders even if a server field is momentarily missing.
const DEFAULT_PAUSE: SophiePauseCopy = {
  heading: '我先暫停一下。',
  body: [
    '你的訊息沒有被刪掉，也沒有被改寫，我已經幫你保存下來。',
    '我想先陪你一下，因為如果現在立刻讓TA看到，你們可能會直接進入下一輪爭吵。',
  ],
  reassurance: '你可以生氣。我只想幫你確定：在這股生氣下面，你最希望TA真正聽見的是什麼。',
  cta: '好，先陪我一下',
};

const SophieMediator = ({ showNotification, partnerConnected }: Props) => {
  // Composer
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // Active intervention (sender side)
  const [active, setActive] = useState<ConflictIntervention | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [pauseCopy, setPauseCopy] = useState<SophiePauseCopy>(DEFAULT_PAUSE);
  const [coreQuestion, setCoreQuestion] = useState('');
  const [coreOptions, setCoreOptions] = useState<SophieCoreOption[]>([]);
  const [safetyCopy, setSafetyCopy] = useState<SophieSafetyCopy | null>(null);
  const [ownText, setOwnText] = useState('');
  const [showOwnText, setShowOwnText] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<ConflictTranslation | null>(null);
  const [editedTranslation, setEditedTranslation] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Inbox (recipient side)
  const [inbox, setInbox] = useState<ConflictIntervention[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [understoodBusy, setUnderstoodBusy] = useState<string | null>(null);

  useScrollLock(phase !== null);

  const refreshInbox = useCallback(async () => {
    if (!partnerConnected) return;
    setInboxLoading(true);
    try {
      const items = await apiService.getConflictInbox();
      setInbox(items);
    } catch {
      // A failed inbox load is not worth a red toast — it silently retries on
      // the next open. The composer (the primary action) still works.
    } finally {
      setInboxLoading(false);
    }
  }, [partnerConnected]);

  // Resume a held message left in-flight, and load received messages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!partnerConnected) return;
      try {
        const res = await apiService.getActiveConflictIntervention();
        if (cancelled || !res.intervention) return;
        setActive(res.intervention);
        if (res.pause) setPauseCopy(res.pause);
        if (res.core_question) setCoreQuestion(res.core_question);
        if (res.core_options) setCoreOptions(res.core_options);
        if (res.safety && res.safety_copy) {
          setSafetyCopy(res.safety_copy);
          setPhase('safety');
        } else {
          setPhase('pause');
        }
      } catch {
        /* no active intervention is the common case */
      }
    })();
    refreshInbox();
    return () => { cancelled = true; };
  }, [partnerConnected, refreshInbox]);

  const resetFlow = () => {
    setActive(null);
    setPhase(null);
    setTranslation(null);
    setOwnText('');
    setShowOwnText(false);
    setEditedTranslation('');
    setEditing(false);
    setSafetyCopy(null);
  };

  const applySendResult = (res: ConflictSendResult) => {
    setActive(res.intervention);
    if (res.pause) setPauseCopy(res.pause);
    if (res.core_question) setCoreQuestion(res.core_question);
    if (res.core_options) setCoreOptions(res.core_options);
    if (res.safety && res.safety_copy) {
      setSafetyCopy(res.safety_copy);
      setPhase('safety');
      return;
    }
    if (res.held) {
      setPhase('pause');
      return;
    }
    // Delivered immediately (Level 0/1).
    showNotification({
      type: 'success',
      title: '已送到TA那裡',
      message: res.gentle_nudge
        ? '訊息已送出。' + res.gentle_nudge
        : '訊息已直接送到TA的收件匣。',
      duration: 4500,
    });
    setDraft('');
    resetFlow();
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    if (!partnerConnected) {
      showNotification({
        type: 'warning',
        title: '尚未配對伴侶',
        message: 'Sophie 的即時介入需要有人可以收訊息。先到「說開一件事」把情緒寫成草稿，配對後再送出。',
        duration: 5000,
      });
      return;
    }
    setSending(true);
    try {
      const res = await apiService.sendConflictMessage(text);
      applySendResult(res);
    } catch (err) {
      const e = err as Error & { error_code?: string };
      showNotification({
        type: e.error_code === 'CONFLICT_NOT_PAIRED' ? 'warning' : 'error',
        title: e.error_code === 'CONFLICT_NOT_PAIRED' ? '需要先配對伴侶' : '送出失敗',
        message: e.message || 'Sophie 暫時無法處理，請稍後再試。',
        duration: 5000,
      });
    } finally {
      setSending(false);
    }
  };

  const handlePickOption = async (option: SophieCoreOption) => {
    if (!active) return;
    if (option.key === 'own_words') {
      setShowOwnText(true);
      return;
    }
    await runAnswer(option.key, undefined);
  };

  const runAnswer = async (emotionKey: string, own?: string) => {
    if (!active) return;
    setTranslating(true);
    try {
      const res = await apiService.answerConflictIntervention(active.id, emotionKey, own);
      setActive(res.intervention);
      setTranslation(res.translation);
      setEditedTranslation(res.translation.rewrite || '');
      setPhase('confirm');
    } catch (err) {
      const e = err as Error & { error_code?: string };
      showNotification({
        type: 'warning',
        title: 'Sophie 這次沒能整理好',
        message: e.message || '可以再試一次，或直接讓TA看到原話。',
        duration: 5000,
      });
    } finally {
      setTranslating(false);
    }
  };

  const handleConfirmYes = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const updated = await apiService.confirmConflictTranslation(
        active.id,
        true,
        editing ? editedTranslation.trim() : undefined,
      );
      setActive(updated);
      setPhase('release');
    } catch (err) {
      showNotification({ type: 'error', title: '無法儲存', message: (err as Error).message, duration: 4000 });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await apiService.confirmConflictTranslation(active.id, false);
      setTranslation(null);
      setShowOwnText(false);
      setOwnText('');
      setPhase('question');
    } catch {
      // Non-fatal: fall back to re-asking locally.
      setPhase('question');
    } finally {
      setBusy(false);
    }
  };

  // Release the original (+ translation). `raw` = the never-silence path: skip
  // straight to delivery without finishing the intervention.
  const doRelease = async (raw: boolean) => {
    if (!active) return;
    if (raw) {
      const ok = window.confirm(
        '可以。我不會阻止你。\n\n我只是想讓你知道，這句話現在可能比較容易讓TA進入防禦。\n\n要現在就讓TA看到原話嗎？',
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await apiService.releaseConflictIntervention(active.id);
      showNotification({
        type: 'success',
        title: '已讓TA看到',
        message: raw
          ? '你的原話已經送到TA那裡。'
          : '你的原話送出了，Sophie 也把你真正想被理解的地方放在旁邊。',
        duration: 5000,
      });
      setDraft('');
      resetFlow();
    } catch (err) {
      showNotification({ type: 'error', title: '送出失敗', message: (err as Error).message, duration: 4000 });
    } finally {
      setBusy(false);
    }
  };

  const handleUnderstood = async (item: ConflictIntervention, understood: boolean) => {
    setUnderstoodBusy(item.id);
    // Optimistic (§R7): reversible, low-stakes ack — update first, roll back on failure.
    setInbox((prev) => prev.map((i) => (i.id === item.id ? { ...i, partner_understood: understood } : i)));
    try {
      await apiService.respondConflictUnderstood(item.id, understood);
    } catch (err) {
      setInbox((prev) => prev.map((i) => (i.id === item.id ? { ...i, partner_understood: null } : i)));
      showNotification({ type: 'error', title: '沒有送出', message: (err as Error).message, duration: 4000 });
    } finally {
      setUnderstoodBusy(null);
    }
  };

  const received = inbox.filter((i) => !i.is_sender);

  return (
    <section className="bg-petal-rose/10 border-2 border-petal-rose/30 rounded-md p-5 md:p-6" data-testid="sophie-mediator">
      <div className="flex items-start gap-4">
        <div className="hidden sm:flex w-12 h-12 flex-shrink-0 rounded-full bg-white border border-petal-rose/40 items-center justify-center">
          <Sparkles className="w-5 h-5 text-petal-rose-deep" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
            — Sophie 即時介入
          </div>
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-2">
            在氣頭上想說的話，<em className="not-italic font-light italic text-pink-600">先交給 Sophie</em>
          </h3>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-4">
            你可以照實說，不用先冷靜。按下送出後，Sophie 會保存你的原話，
            在情緒最高的那一刻先陪你停一下、找出你真正想讓TA聽見的，再把原話交給TA。
            <span className="block mt-1 text-petal-muted text-xs">
              Sophie 不會刪掉或改寫你的話，只會決定「什麼時候、用什麼方式」讓TA收到。
            </span>
          </p>

          {/* Composer */}
          <div className="bg-white/90 rounded-md border border-petal-rule p-3">
            <AutoGrowTextarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={partnerConnected ? '現在就想對TA說的話…照實寫，Sophie 會接住。' : '配對伴侶後，這裡可以直接送出給TA。'}
              maxLength={2000}
              disabled={sending}
              className="w-full font-body text-sm text-petal-ink leading-relaxed bg-transparent border-0 resize-none focus:outline-none placeholder:text-petal-muted/70 min-h-[6rem] max-h-[40vh] overflow-y-auto"
            />
            <div className="flex items-center justify-between gap-2 mt-1.5 pt-2 border-t border-petal-rule-soft">
              <span className="font-body text-[11px] text-petal-muted">{draft.length}/2000</span>
              <button
                type="button"
                data-testid="sophie-send"
                onClick={handleSend}
                disabled={sending || draft.trim().length === 0}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-body text-sm font-medium border transition-colors ${
                  sending || draft.trim().length === 0
                    ? 'border-petal-rule bg-white text-petal-muted opacity-60 cursor-not-allowed'
                    : 'border-petal-rose bg-petal-rose-deep text-white hover:opacity-90'
                }`}
              >
                {sending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />送出中…</>
                ) : (
                  <><Send className="w-4 h-4" strokeWidth={1.75} />送出給TA</>
                )}
              </button>
            </div>
          </div>

          {/* Received messages (recipient side) */}
          {received.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-1.5 font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
                <MailOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                TA想讓你聽見的（{received.length}）
              </div>
              <ul className="space-y-3">
                {received.map((item) => (
                  <ReceivedCard
                    key={item.id}
                    item={item}
                    busy={understoodBusy === item.id}
                    onUnderstood={handleUnderstood}
                  />
                ))}
              </ul>
            </div>
          )}
          {inboxLoading && received.length === 0 && (
            <p className="mt-4 font-body text-xs text-petal-muted">正在載入TA的訊息…</p>
          )}
        </div>
      </div>

      {/* Full-screen intervention overlay */}
      {phase && active && (
        <div className="fixed inset-0 z-50 bg-petal-cream flex flex-col">
          <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 py-8 flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col safe-pb">
            {/* Top bar */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-petal-rose-deep" strokeWidth={1.5} />
                <div>
                  <div className="font-body text-[11px] uppercase tracking-[0.18em] text-petal-rose-deep">— Sophie</div>
                  <div className="font-display text-lg text-petal-ink">即時介入</div>
                </div>
              </div>
              <button
                type="button"
                onClick={resetFlow}
                aria-label="稍後再說"
                className="text-petal-muted hover:text-petal-ink text-3xl leading-none p-2 -m-2"
              >
                ×
              </button>
            </div>

            {/* Saved-status reassurance — the user must never wonder if the words vanished (AC3). */}
            {phase !== 'safety' && (
              <div className="flex flex-wrap items-center gap-2 mb-5 font-body text-[11px] text-petal-ink-soft">
                <span className="inline-flex items-center gap-1 rounded-full bg-white border border-petal-sage/50 text-petal-sage-deep px-2 py-0.5">✓ 已送出</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white border border-petal-sage/50 text-petal-sage-deep px-2 py-0.5">✓ 已保存原話</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white border border-petal-rose/50 text-petal-rose-deep px-2 py-0.5">
                  <Pause className="w-3 h-3" strokeWidth={2} /> Sophie 正在陪這段對話
                </span>
              </div>
            )}

            {/* SAFETY */}
            {phase === 'safety' && safetyCopy && (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 text-amber-700 mb-3">
                  <ShieldAlert className="w-5 h-5" strokeWidth={1.75} />
                  <h2 className="font-display text-2xl font-light text-petal-ink leading-snug">{safetyCopy.heading}</h2>
                </div>
                {safetyCopy.body.map((p, i) => (
                  <p key={i} className="font-body text-sm text-petal-ink-soft leading-relaxed mb-2">{p}</p>
                ))}
                <div className="bg-white border border-amber-200 rounded-md p-4 my-4 space-y-2">
                  {safetyCopy.resources.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3">
                      <span className="font-body text-sm text-petal-ink">{r.label}</span>
                      <span className="font-display text-base text-amber-800">{r.value}</span>
                    </div>
                  ))}
                </div>
                <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{safetyCopy.note}</p>
                <div className="mt-auto pt-6 space-y-3">
                  <button
                    type="button"
                    onClick={() => doRelease(true)}
                    disabled={busy}
                    className="w-full px-5 py-3 border border-petal-rule text-petal-ink-soft hover:text-petal-ink hover:border-petal-ink rounded-md font-body text-sm transition-colors"
                  >
                    我了解，仍要讓TA看到我的原話
                  </button>
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="w-full px-5 py-3 bg-petal-ink text-petal-cream rounded-md font-body text-sm font-medium hover:bg-pink-700 transition-colors"
                  >
                    先不送出，我需要一點時間
                  </button>
                </div>
              </div>
            )}

            {/* PAUSE (§8-9) */}
            {phase === 'pause' && (
              <div className="flex-1 flex flex-col">
                <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-4">{pauseCopy.heading}</h2>
                {pauseCopy.body.map((p, i) => (
                  <p key={i} className="font-body text-base text-petal-ink-soft leading-relaxed mb-2">{p}</p>
                ))}
                <div className="bg-white border border-petal-rose/30 rounded-md p-4 my-5">
                  <p className="font-display italic text-[15px] text-petal-ink leading-relaxed">{pauseCopy.reassurance}</p>
                </div>
                <div className="mt-auto pt-6 space-y-3">
                  <button
                    type="button"
                    data-testid="sophie-pause-continue"
                    onClick={() => setPhase('question')}
                    className="w-full px-5 py-4 bg-petal-rose-deep text-white rounded-md text-base font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2"
                  >
                    {pauseCopy.cta}
                    <ChevronRight className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <ReleaseRawLink busy={busy} onClick={() => doRelease(true)} />
                </div>
              </div>
            )}

            {/* CORE QUESTION (§10) */}
            {phase === 'question' && (
              <div className="flex-1 flex flex-col">
                <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-6">
                  {coreQuestion || '如果TA現在只能真正理解你一件事，你最希望TA理解什麼？'}
                </h2>
                {translating ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-petal-muted gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-petal-rose-deep" strokeWidth={1.5} />
                    <p className="font-body text-sm">Sophie 正在聽你話裡的情緒…</p>
                  </div>
                ) : showOwnText ? (
                  <div className="space-y-3">
                    <div className="bg-white rounded-md border border-petal-rule p-3">
                      <AutoGrowTextarea
                        value={ownText}
                        onChange={(e) => setOwnText(e.target.value)}
                        placeholder="用你自己的話說：我最希望TA理解的是…"
                        maxLength={500}
                        className="w-full font-body text-sm text-petal-ink leading-relaxed bg-transparent border-0 resize-none focus:outline-none placeholder:text-petal-muted/70 min-h-[5rem]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowOwnText(false); setOwnText(''); }}
                        className="px-4 py-2.5 border border-petal-rule text-petal-ink-soft rounded-md font-body text-sm hover:border-petal-ink transition-colors"
                      >
                        ← 選項
                      </button>
                      <button
                        type="button"
                        onClick={() => runAnswer('own_words', ownText.trim())}
                        disabled={ownText.trim().length === 0}
                        className={`flex-1 px-4 py-2.5 rounded-md font-body text-sm font-medium transition-colors ${
                          ownText.trim().length === 0
                            ? 'bg-white border border-petal-rule text-petal-muted opacity-60'
                            : 'bg-petal-rose-deep text-white hover:opacity-90'
                        }`}
                      >
                        讓 Sophie 幫我整理
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {(coreOptions.length > 0 ? coreOptions : DEFAULT_OPTIONS).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        data-testid={`sophie-option-${opt.key}`}
                        onClick={() => handlePickOption(opt)}
                        className="bg-white border-2 border-petal-rule rounded-md p-4 text-left hover:border-petal-rose hover:bg-petal-rose/5 transition-colors flex items-center gap-3"
                      >
                        <span className="text-2xl leading-none" aria-hidden>{opt.emoji}</span>
                        <span className="font-body text-[15px] text-petal-ink flex-1">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!translating && (
                  <div className="mt-auto pt-6">
                    <ReleaseRawLink busy={busy} onClick={() => doRelease(true)} />
                  </div>
                )}
              </div>
            )}

            {/* CONFIRM (§11-12) */}
            {phase === 'confirm' && translation && (
              <div className="flex-1 flex flex-col">
                <p className="font-body text-base text-petal-ink-soft leading-relaxed mb-1">我懂了。</p>
                <p className="font-body text-base text-petal-ink-soft leading-relaxed mb-4">
                  所以剛才那句話底下，可能有一個更重要的訊息：
                </p>

                {/* The original words stay visible and unchanged — a translation, never a replacement (AC5). */}
                {active.original_text && (
                  <div className="mb-3">
                    <div className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-muted mb-1">你原本說的</div>
                    <p className="font-body text-sm text-petal-ink/70 leading-relaxed bg-white/60 rounded-md border border-petal-rule p-3">
                      「{active.original_text}」
                    </p>
                  </div>
                )}

                <div className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-rose-deep mb-1">Sophie 幫你翻成</div>
                {editing ? (
                  <div className="bg-white rounded-md border border-petal-rose/40 p-3 mb-2">
                    <AutoGrowTextarea
                      value={editedTranslation}
                      onChange={(e) => setEditedTranslation(e.target.value)}
                      maxLength={2000}
                      className="w-full font-body text-[15px] text-petal-ink leading-relaxed bg-transparent border-0 resize-none focus:outline-none min-h-[4.5rem]"
                    />
                  </div>
                ) : (
                  <div className="bg-white border-2 border-petal-rose/30 rounded-md p-4 mb-2">
                    <p className="font-display text-lg text-petal-ink leading-relaxed">
                      「{editedTranslation || translation.rewrite || active.original_text}」
                    </p>
                  </div>
                )}
                {translation.need && (
                  <span className="self-start inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-[12px] px-2.5 py-0.5 mb-4">
                    你其實需要{translation.need}
                  </span>
                )}
                <p className="font-body text-sm text-petal-muted mb-4">這有接近你真正想讓TA知道的事嗎？</p>

                <div className="mt-auto pt-4 space-y-2.5">
                  <button
                    type="button"
                    data-testid="sophie-confirm-yes"
                    onClick={handleConfirmYes}
                    disabled={busy}
                    className="w-full px-5 py-4 bg-petal-rose-deep text-white rounded-md text-base font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Heart className="w-4 h-4" strokeWidth={2} /> 對，就是這個
                  </button>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => { setEditing((v) => !v); }}
                      disabled={busy}
                      className="flex-1 px-4 py-3 bg-white border border-petal-rule text-petal-ink rounded-md font-body text-sm hover:border-petal-ink transition-colors"
                    >
                      ✏️ {editing ? '完成修改' : '我想修改'}
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={busy}
                      className="flex-1 px-4 py-3 bg-white border border-petal-rule text-petal-ink rounded-md font-body text-sm hover:border-petal-ink transition-colors"
                    >
                      ❌ 不是這個意思
                    </button>
                  </div>
                  <ReleaseRawLink busy={busy} onClick={() => doRelease(true)} />
                </div>
              </div>
            )}

            {/* RELEASE (§13) */}
            {phase === 'release' && (
              <div className="flex-1 flex flex-col justify-center">
                <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-3 text-center">
                  好，我更懂你剛才真正想說的了。
                </h2>
                <p className="font-body text-sm text-petal-ink-soft text-center leading-relaxed mb-8">
                  現在我可以讓TA看到你原本說的話，<br />
                  也會把你真正想被理解的地方放在旁邊。
                </p>
                <div className="space-y-3">
                  <button
                    type="button"
                    data-testid="sophie-release"
                    onClick={() => doRelease(false)}
                    disabled={busy}
                    className="w-full px-5 py-4 bg-petal-rose-deep text-white rounded-md text-base font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : <Send className="w-4 h-4" strokeWidth={1.75} />}
                    讓TA看到
                  </button>
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="w-full px-5 py-3 bg-white border border-petal-rule text-petal-ink-soft rounded-md font-body text-sm hover:border-petal-ink transition-colors"
                  >
                    稍後再送
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

// The always-available never-silence exit (§24).
const ReleaseRawLink = ({ busy, onClick }: { busy: boolean; onClick: () => void }) => (
  <button
    type="button"
    data-testid="sophie-release-raw"
    onClick={onClick}
    disabled={busy}
    className="w-full text-center font-body text-xs text-petal-muted hover:text-petal-ink underline underline-offset-2 transition-colors py-2"
  >
    直接讓TA看到原話
  </button>
);

// Client fallback for the core options if the server list is momentarily absent.
const DEFAULT_OPTIONS: SophieCoreOption[] = [
  { key: 'not_cared', emoji: '❤️', label: '我覺得自己不被在乎', need: '被在乎' },
  { key: 'boundary', emoji: '🧱', label: '我覺得我的界線沒有被尊重', need: '被尊重' },
  { key: 'misunderstood', emoji: '😞', label: '我覺得自己被誤解了', need: '被理解' },
  { key: 'overloaded', emoji: '🥀', label: '我覺得很多事情都落在我身上', need: '被分擔' },
  { key: 'hurt', emoji: '💔', label: '我其實很受傷', need: '被安慰' },
  { key: 'own_words', emoji: '✏️', label: '都不是，我想自己說', need: null },
];

// One received (released) message: the partner's original words + Sophie's lens,
// then a single "did you hear it?" acknowledgement (§14).
const ReceivedCard = ({
  item,
  busy,
  onUnderstood,
}: {
  item: ConflictIntervention;
  busy: boolean;
  onUnderstood: (item: ConflictIntervention, understood: boolean) => void;
}) => {
  const [readMarked, setReadMarked] = useState(item.message_status === 'DELIVERED');
  useEffect(() => {
    if (!readMarked && item.message_status === 'RELEASED') {
      apiService.markConflictRead(item.id).catch(() => {});
      setReadMarked(true);
    }
  }, [item.id, item.message_status, readMarked]);

  return (
    <li className="bg-white rounded-md border border-petal-rule p-4" data-testid="sophie-received">
      <div className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-muted mb-1">💬 TA原本說</div>
      <p className="font-body text-sm text-petal-ink leading-relaxed mb-3">「{item.original_text}」</p>

      {item.emotional_translation && (
        <div className="border-l-2 border-dashed border-petal-rose-deep/35 pl-3 py-0.5 mb-3">
          <div className="font-body text-[11px] font-medium text-petal-rose-deep mb-1">❤️ Sophie 幫你理解</div>
          <p className="font-body text-sm text-petal-ink leading-relaxed">
            TA現在可能真正想讓你知道的是：「{item.emotional_translation}」
          </p>
          {item.underlying_need && (
            <span className="mt-1.5 inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-[11px] px-2 py-0.5">
              TA需要{item.underlying_need}
            </span>
          )}
        </div>
      )}

      {/* The "did you hear it?" acknowledgement is meaningful only for a message
          Sophie actually mediated (§14). A plain delivered note skips it. */}
      {!item.emotional_translation ? (
        <p className="font-body text-xs text-petal-muted">TA直接傳給你的訊息。</p>
      ) : item.partner_understood === null ? (
        <div>
          <p className="font-body text-xs text-petal-muted mb-2">你現在先不用回答對不對，只想確認一件事：你有理解TA想讓你知道的嗎？</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="sophie-understood-yes"
              onClick={() => onUnderstood(item, true)}
              disabled={busy}
              className="flex-1 px-3 py-2 rounded-full bg-petal-rose-deep text-white font-body text-sm font-medium hover:opacity-90 transition-colors"
            >
              我理解了
            </button>
            <button
              type="button"
              onClick={() => onUnderstood(item, false)}
              disabled={busy}
              className="flex-1 px-3 py-2 rounded-full bg-white border border-petal-rule text-petal-ink font-body text-sm hover:border-petal-ink transition-colors"
            >
              我還不理解
            </button>
          </div>
        </div>
      ) : (
        <p className="font-body text-xs text-petal-sage-deep">
          {item.partner_understood ? '✓ 你已回覆：我理解了' : '你已回覆：還想再多聽一點'}
        </p>
      )}
    </li>
  );
};

export default SophieMediator;
