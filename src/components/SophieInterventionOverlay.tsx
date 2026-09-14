import { useState } from 'react';
import { ChevronRight, Flame, Heart, Loader2, Pause, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import AutoGrowTextarea from './AutoGrowTextarea';
import { apiService } from '../services/api';
import type {
  ConflictIntervention,
  ConflictTranslation,
  SophieAgencyCopy,
  SophieCoreOption,
  SophiePauseCopy,
  SophieSafetyCopy,
} from '../services/api';
import type { Notification } from '../App';

// The full-screen held-message intervention (pause → core question → agency
// branches → translation confirm → release), shown when Sophie holds a reply.
// Controlled: the parent mounts it with a held intervention + Sophie's copy, and
// is told when it closes (the reply was released into the thread, or the user
// stepped away with the words still held & resumable).
type Phase =
  | 'pause' | 'question' | 'confirm' | 'release' | 'safety'
  | 'agency' | 'agency-goal' | 'agency-hurt';

interface Props {
  intervention: ConflictIntervention;
  pauseCopy: SophiePauseCopy;
  coreQuestion: string;
  coreOptions: SophieCoreOption[];
  agencyCopy: SophieAgencyCopy | null;
  safety: boolean;
  safetyCopy: SophieSafetyCopy | null;
  // The viewer's (sender's) chosen AI 諮商師 name — this overlay is their own
  // intervention, so it speaks in their companion's name.
  companionName: string;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  // 'released' → the original was posted to the thread; 'exited' → stepped away,
  // the words stay held and resumable.
  onClose: (result: 'released' | 'exited') => void;
}

const DEFAULT_OPTIONS: SophieCoreOption[] = [
  { key: 'not_cared', emoji: '❤️', label: '我覺得自己不被在乎', need: '被在乎' },
  { key: 'boundary', emoji: '🧱', label: '我覺得我的界線沒有被尊重', need: '被尊重' },
  { key: 'misunderstood', emoji: '😞', label: '我覺得自己被誤解了', need: '被理解' },
  { key: 'overloaded', emoji: '🥀', label: '我覺得很多事情都落在我身上', need: '被分擔' },
  { key: 'hurt', emoji: '💔', label: '我其實很受傷', need: '被安慰' },
  { key: 'own_words', emoji: '✏️', label: '都不是，我想自己說', need: null },
];

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

const SophieInterventionOverlay = ({
  intervention,
  pauseCopy,
  coreQuestion,
  coreOptions,
  agencyCopy,
  safety,
  safetyCopy,
  companionName,
  showNotification,
  onClose,
}: Props) => {
  const [active, setActive] = useState<ConflictIntervention>(intervention);
  const [phase, setPhase] = useState<Phase>(safety ? 'safety' : 'pause');
  const [ownText, setOwnText] = useState('');
  const [showOwnText, setShowOwnText] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<ConflictTranslation | null>(null);
  const [editedTranslation, setEditedTranslation] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useScrollLock(true);

  const runAnswer = async (emotionKey: string, own?: string) => {
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
        title: `${companionName} 這次沒能整理好`,
        message: e.message || '可以再試一次，或直接讓TA看到原話。',
        duration: 5000,
      });
    } finally {
      setTranslating(false);
    }
  };

  const handlePickOption = async (option: SophieCoreOption) => {
    if (option.key === 'own_words') {
      setShowOwnText(true);
      return;
    }
    await runAnswer(option.key, undefined);
  };

  const handleConfirmYes = async () => {
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
    setBusy(true);
    try {
      await apiService.confirmConflictTranslation(active.id, false);
    } catch {
      /* non-fatal — fall back to re-asking locally */
    } finally {
      setTranslation(null);
      setShowOwnText(false);
      setOwnText('');
      setPhase('question');
      setBusy(false);
    }
  };

  // raw = never-silence path (skip translation); skipConfirm = the user already
  // made the choice explicitly (agency "繼續這一輪").
  const doRelease = async (raw: boolean, skipConfirm = false) => {
    if (raw && !skipConfirm) {
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
        title: '已送進對話',
        message: raw
          ? '你的原話已經送到對話裡。'
          : `你的原話送出了，${companionName} 也把你真正想被理解的地方放在旁邊。`,
        duration: 5000,
      });
      onClose('released');
    } catch (err) {
      showNotification({ type: 'error', title: '送出失敗', message: (err as Error).message, duration: 4000 });
    } finally {
      setBusy(false);
    }
  };

  // --- Agency / retaliation branch -----------------------------------------
  const recordAgency = async (intent: 'fight' | 'stop' | 'be_understood', goal?: 'hurt' | 'understand') => {
    try {
      const updated = await apiService.recordConflictAgency(active.id, intent, goal);
      setActive(updated);
    } catch {
      /* best-effort analytics — never block the user */
    }
  };

  const handleAgencyIntent = async (intent: 'fight' | 'stop' | 'be_understood') => {
    setBusy(true);
    try {
      await recordAgency(intent);
      if (intent === 'fight') setPhase('agency-goal');
      else if (intent === 'stop') setPhase('question');
      else await runAnswer('hurt');
    } finally {
      setBusy(false);
    }
  };

  const handleAgencyGoal = async (goal: 'hurt' | 'understand') => {
    setBusy(true);
    try {
      await recordAgency('fight', goal);
      setPhase(goal === 'understand' ? 'question' : 'agency-hurt');
    } finally {
      setBusy(false);
    }
  };

  const handleAgencyHurtChoice = async (choice: 'send_now' | 'hold') => {
    if (choice === 'send_now') {
      await doRelease(true, true);
      return;
    }
    showNotification({
      type: 'info',
      title: '好，我幫你把這一輪停下來',
      message: agencyCopy?.afterHurt.holdNote || '原話我幫你留著，等你準備好隨時回來。',
      duration: 5000,
    });
    onClose('exited');
  };

  return (
    <div className="fixed inset-0 z-50 bg-petal-cream flex flex-col">
      <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 py-8 flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col safe-pb">
        {/* Top bar */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-petal-rose-deep" strokeWidth={1.5} />
            <div>
              <div className="font-body text-[11px] uppercase tracking-[0.18em] text-petal-rose-deep">— {companionName}</div>
              <div className="font-display text-lg text-petal-ink">即時介入</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose('exited')}
            aria-label="稍後再說"
            className="text-petal-muted hover:text-petal-ink text-3xl leading-none p-2 -m-2"
          >
            ×
          </button>
        </div>

        {/* Saved-status reassurance — the words never vanish. */}
        {phase !== 'safety' && (
          <div className="flex flex-wrap items-center gap-2 mb-5 font-body text-[11px] text-petal-ink-soft">
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-petal-sage/50 text-petal-sage-deep px-2 py-0.5">✓ 已保存原話</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white border border-petal-rose/50 text-petal-rose-deep px-2 py-0.5">
              <Pause className="w-3 h-3" strokeWidth={2} /> 還沒送到TA那裡
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
                onClick={() => onClose('exited')}
                className="w-full px-5 py-3 bg-petal-ink text-petal-cream rounded-md font-body text-sm font-medium hover:bg-pink-700 transition-colors"
              >
                先不送出，我需要一點時間
              </button>
            </div>
          </div>
        )}

        {/* PAUSE */}
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
              {agencyCopy && (
                <button
                  type="button"
                  data-testid="sophie-agency-entry"
                  onClick={() => setPhase('agency')}
                  className="w-full px-5 py-3 bg-white border-2 border-amber-300 text-amber-800 rounded-md font-body text-sm font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Flame className="w-4 h-4" strokeWidth={1.75} />
                  其實我很想回擊
                </button>
              )}
              <ReleaseRawLink busy={busy} onClick={() => doRelease(true)} />
            </div>
          </div>
        )}

        {/* AGENCY — intent */}
        {phase === 'agency' && agencyCopy && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-5 h-5 text-amber-600" strokeWidth={1.75} />
              <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug">{agencyCopy.intent.heading}</h2>
            </div>
            {agencyCopy.intent.body.map((p, i) => (
              <p key={i} className="font-body text-base text-petal-ink-soft leading-relaxed mb-2">{p}</p>
            ))}
            <div className="grid grid-cols-1 gap-2.5 mt-4">
              {agencyCopy.intent.options.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  data-testid={`sophie-agency-${opt.key}`}
                  onClick={() => handleAgencyIntent(opt.key as 'fight' | 'stop' | 'be_understood')}
                  disabled={busy}
                  className="bg-white border-2 border-petal-rule rounded-md p-4 text-left hover:border-amber-400 hover:bg-amber-50/40 transition-colors flex items-center gap-3"
                >
                  <span className="text-2xl leading-none" aria-hidden>{opt.emoji}</span>
                  <span className="flex-1">
                    <span className="block font-body text-[15px] text-petal-ink">{opt.label}</span>
                    {opt.hint && <span className="block font-body text-xs text-petal-muted mt-0.5">{opt.hint}</span>}
                  </span>
                </button>
              ))}
            </div>
            {busy && (
              <p className="mt-4 font-body text-xs text-petal-muted flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} /> {companionName} 正在陪你…
              </p>
            )}
          </div>
        )}

        {/* AGENCY — the pivotal question */}
        {phase === 'agency-goal' && agencyCopy && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-4">{agencyCopy.goal.heading}</h2>
            {agencyCopy.goal.body.map((p, i) => (
              <p key={i} className="font-body text-base text-petal-ink-soft leading-relaxed mb-2">{p}</p>
            ))}
            <div className="grid grid-cols-1 gap-2.5 mt-4">
              {agencyCopy.goal.options.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  data-testid={`sophie-agency-goal-${opt.key}`}
                  onClick={() => handleAgencyGoal(opt.key as 'hurt' | 'understand')}
                  disabled={busy}
                  className="bg-white border-2 border-petal-rule rounded-md p-4 text-left hover:border-petal-rose hover:bg-petal-rose/5 transition-colors flex items-center gap-3"
                >
                  <span className="text-2xl leading-none" aria-hidden>{opt.emoji}</span>
                  <span className="flex-1">
                    <span className="block font-body text-[15px] text-petal-ink">{opt.label}</span>
                    {opt.hint && <span className="block font-body text-xs text-petal-muted mt-0.5">{opt.hint}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AGENCY — want to hurt: no moralizing */}
        {phase === 'agency-hurt' && agencyCopy && (
          <div className="flex-1 flex flex-col">
            <p className="font-body text-base text-petal-ink-soft leading-relaxed mb-4">{agencyCopy.afterHurt.body}</p>
            <div className="grid grid-cols-1 gap-2.5">
              {agencyCopy.afterHurt.options.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  data-testid={`sophie-agency-hurt-${opt.key}`}
                  onClick={() => handleAgencyHurtChoice(opt.key as 'send_now' | 'hold')}
                  disabled={busy}
                  className="bg-white border-2 border-petal-rule rounded-md p-4 text-left hover:border-petal-ink transition-colors font-body text-[15px] text-petal-ink"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-4 font-body text-xs text-petal-muted leading-relaxed">
              你可以生氣，但你不用把行為的控制權交給這股情緒。
            </p>
          </div>
        )}

        {/* CORE QUESTION */}
        {phase === 'question' && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-6">
              {coreQuestion || '如果TA現在只能真正理解你一件事，你最希望TA理解什麼？'}
            </h2>
            {translating ? (
              <div className="flex-1 flex flex-col items-center justify-center text-petal-muted gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-petal-rose-deep" strokeWidth={1.5} />
                <p className="font-body text-sm">{companionName} 正在聽你話裡的情緒…</p>
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
                    讓 {companionName} 幫我整理
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
              <div className="mt-auto pt-6 space-y-2">
                {agencyCopy && !showOwnText && (
                  <button
                    type="button"
                    onClick={() => setPhase('agency')}
                    className="w-full text-center font-body text-xs text-amber-700 hover:text-amber-800 underline underline-offset-2 transition-colors py-1"
                  >
                    其實我現在很想回擊
                  </button>
                )}
                <ReleaseRawLink busy={busy} onClick={() => doRelease(true)} />
              </div>
            )}
          </div>
        )}

        {/* CONFIRM */}
        {phase === 'confirm' && translation && (
          <div className="flex-1 flex flex-col">
            <p className="font-body text-base text-petal-ink-soft leading-relaxed mb-1">我懂了。</p>
            <p className="font-body text-base text-petal-ink-soft leading-relaxed mb-4">
              所以剛才那句話底下，可能有一個更重要的訊息：
            </p>
            <div className="mb-3">
              <div className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-muted mb-1">你原本說的</div>
              <p className="font-body text-sm text-petal-ink/70 leading-relaxed bg-white/60 rounded-md border border-petal-rule p-3">
                「{active.original_text}」
              </p>
            </div>
            <div className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-rose-deep mb-1">{companionName} 幫你翻成</div>
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
                  onClick={() => setEditing((v) => !v)}
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

        {/* RELEASE */}
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
                送進對話
              </button>
              <button
                type="button"
                onClick={() => onClose('exited')}
                className="w-full px-5 py-3 bg-white border border-petal-rule text-petal-ink-soft rounded-md font-body text-sm hover:border-petal-ink transition-colors"
              >
                稍後再送
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SophieInterventionOverlay;
