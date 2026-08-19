import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, Compass, Loader2, Sparkles, Heart, Lock, Check, PauseCircle,
} from 'lucide-react';
import { apiService } from '../../services/api';
import type { DeepDiveJourney, DeepDiveStep, DeepDiveState, DeepDiveValidation } from '../../services/api';
import { useScrollLock } from '../../hooks/useScrollLock';
import { detectDraftTone } from '../../utils/conflictState';
import SafetyExitScreen from './SafetyExitScreen';

// 情緒深潛 — the full-screen focus layer for the guided journey.
//
// Modeled on GuideSessionView (portal to <body>, useScrollLock, a "回到對話"-style
// escape rather than an X). The user's core ask is honored structurally: every
// step persists to the server as you go, so 「暫停，稍後再走」 just closes the
// layer, and re-opening resumes at current_step with the drafts intact. Every
// step that can be skipped shows 「跳過這一步」. This is NOT a blocking modal
// (playbook §R4): the escape is always there and the state lives on the server.

type NotifyKind = 'success' | 'error' | 'info' | 'warning';
export type DeepDiveIntent = { type: 'start'; eventId?: string } | { type: 'open'; journeyId: string };

interface Props {
  open: boolean;
  onClose: () => void;
  intent: DeepDiveIntent | null;
  onNotify: (n: { type: NotifyKind; title: string; message: string }) => void;
  // Called whenever the journey advances/finishes so App can refresh its
  // resume banner state.
  onChanged?: () => void;
  companionShortName?: string;
}

const EMOTION_CHIPS = ['不被重視', '被忽略', '不安全', '孤單', '被拒絕', '無助', '失望', '不被理解', '害怕', '委屈'];
const FAMILIARITY_OPTIONS: { value: string; hint: string }[] = [
  { value: '很熟悉', hint: '我以前常有這種感覺。' },
  { value: '好像有一點', hint: '但我說不出來是什麼。' },
  { value: '不太熟悉', hint: '我覺得這次就是現在的事情。' },
  { value: '我不知道', hint: '' },
];
const PAST_PERSON_OPTIONS = ['爸爸', '媽媽', '以前的自己', '其他人', '我不知道'];
const NEED_CHIPS = ['聽我說完', '安慰我', '告訴我他理解了', '給我一個擁抱', '不要急著解釋', '向我道歉', '給我安全感'];
const PAST_STARTERS = ['我那時候最難過的是……', '我其實很希望你……', '我當時以為……', '我最想問你的是……', '我從來沒有機會告訴你……'];

const FAMILIAR = new Set(['很熟悉', '好像有一點']);
function isFamiliar(state: DeepDiveState | undefined): boolean {
  return !!state && FAMILIAR.has(state.familiarity || '');
}

function nextOwnerStep(step: DeepDiveStep, state: DeepDiveState): DeepDiveStep {
  switch (step) {
    case 'CURRENT_EMOTION': return 'DEEPER_EMOTION';
    case 'DEEPER_EMOTION': return 'FAMILIARITY_CHECK';
    case 'FAMILIARITY_CHECK': return isFamiliar(state) ? 'MEMORY_EXPLORATION' : 'CURRENT_NEED';
    case 'MEMORY_EXPLORATION': return 'PAST_PERSON';
    case 'PAST_PERSON': return 'PAST_LETTER';
    case 'PAST_LETTER': return 'COMPASSION_LETTER';
    case 'COMPASSION_LETTER': return 'CURRENT_NEED';
    case 'CURRENT_NEED': return 'PARTNER_LETTER';
    case 'PARTNER_LETTER': return 'SHARED';
    default: return step;
  }
}
function prevOwnerStep(step: DeepDiveStep, state: DeepDiveState): DeepDiveStep {
  switch (step) {
    case 'DEEPER_EMOTION': return 'CURRENT_EMOTION';
    case 'FAMILIARITY_CHECK': return 'DEEPER_EMOTION';
    case 'MEMORY_EXPLORATION': return 'FAMILIARITY_CHECK';
    case 'PAST_PERSON': return 'MEMORY_EXPLORATION';
    case 'PAST_LETTER': return 'PAST_PERSON';
    case 'COMPASSION_LETTER': return 'PAST_LETTER';
    case 'CURRENT_NEED': return isFamiliar(state) ? 'COMPASSION_LETTER' : 'FAMILIARITY_CHECK';
    case 'PARTNER_LETTER': return 'CURRENT_NEED';
    case 'SHARED': return 'PARTNER_LETTER';
    default: return step;
  }
}
// Which steps allow 「跳過這一步」 (the exploration steps; the entry emotion and
// the final share are not "skips").
const SKIPPABLE: Set<DeepDiveStep> = new Set([
  'DEEPER_EMOTION', 'MEMORY_EXPLORATION', 'PAST_PERSON', 'PAST_LETTER', 'COMPASSION_LETTER', 'CURRENT_NEED',
]);

const SELF_PATH: DeepDiveStep[] = [
  'CURRENT_EMOTION', 'DEEPER_EMOTION', 'FAMILIARITY_CHECK', 'MEMORY_EXPLORATION',
  'PAST_PERSON', 'PAST_LETTER', 'COMPASSION_LETTER', 'CURRENT_NEED', 'PARTNER_LETTER',
];

// --- small presentational helpers ----------------------------------------
const Chip: React.FC<{ label: string; active: boolean; onClick: () => void; testid?: string }> = ({ label, active, onClick, testid }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testid}
    className={`rounded-full px-4 py-2 text-sm font-body border transition ${
      active
        ? 'bg-petal-ink text-petal-cream border-petal-ink'
        : 'bg-white text-petal-ink border-petal-rule hover:border-petal-rose-deep'
    }`}
  >
    {label}
  </button>
);

const Card: React.FC<{ children: React.ReactNode; testid?: string }> = ({ children, testid }) => (
  <div className="rounded-2xl border border-petal-rule bg-white p-5 sm:p-6" data-testid={testid}>{children}</div>
);

const DeepDiveJourneyView: React.FC<Props> = ({ open, onClose, intent, onNotify, onChanged, companionShortName = 'Luma' }) => {
  useScrollLock(open);
  const [journey, setJourney] = useState<DeepDiveJourney | null>(null);
  const [step, setStep] = useState<DeepDiveStep>('CURRENT_EMOTION');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [reflection, setReflection] = useState<{ reflection: string; question: string } | null>(null);
  const [crisis, setCrisis] = useState(false);

  // Local editable form mirror of the journey state + letters. Kept in one
  // object so drafts survive step navigation without extra fetches.
  const [form, setForm] = useState<{
    situation: string;
    current_emotions: string[];
    deeper_emotions: string[];
    familiarity: string;
    memory_text: string;
    past_person: string;
    pastLetter: string;
    compassionLetter: string;
    partnerLetter: string;
    need_type: string;
    need_custom: string;
    repair_understanding: string;
    repair_action: string;
  }>({
    situation: '', current_emotions: [], deeper_emotions: [], familiarity: '', memory_text: '',
    past_person: '', pastLetter: '', compassionLetter: '', partnerLetter: '', need_type: '', need_custom: '',
    repair_understanding: '', repair_action: '',
  });
  // Partner side + submit guard.
  const [partnerStep, setPartnerStep] = useState<'read' | 'mirror' | 'validation' | 'response' | 'done'>('read');
  const [mirror, setMirror] = useState('');
  const [validation, setValidation] = useState<DeepDiveValidation>({ knew_now: '', didnt_know: '', want_you_to_know: '' });
  const [response, setResponse] = useState('');
  const lockRef = useRef(false);

  const hydrate = useCallback((j: DeepDiveJourney) => {
    setJourney(j);
    setStep(j.current_step);
    if (j.role === 'owner') {
      const s = j.state || {};
      setForm((f) => ({
        ...f,
        situation: s.situation || '',
        current_emotions: s.current_emotions || [],
        deeper_emotions: s.deeper_emotions || [],
        familiarity: s.familiarity || '',
        memory_text: s.memory_text || '',
        past_person: s.past_person || '',
        pastLetter: j.letters?.past?.content || '',
        compassionLetter: j.letters?.compassion?.content || '',
        partnerLetter: j.letters?.partner?.content || '',
        need_type: s.current_need?.type || '',
        need_custom: s.current_need?.custom || '',
        repair_understanding: s.repair?.shared_understanding || '',
        repair_action: s.repair?.agreed_action || '',
      }));
    } else {
      const pr = j.partner_response;
      setMirror(pr?.mirror || '');
      setValidation(pr?.validation || { knew_now: '', didnt_know: '', want_you_to_know: '' });
      setResponse(pr?.response || '');
      setPartnerStep(pr?.status === 'responded' ? 'done' : pr?.status === 'validated' ? 'response' : pr?.status === 'mirrored' ? 'validation' : 'read');
    }
  }, []);

  // Load / start when opened.
  useEffect(() => {
    if (!open || !intent) return;
    let cancelled = false;
    setLoading(true);
    setReflection(null);
    setCrisis(false);
    (async () => {
      try {
        const j = intent.type === 'open'
          ? await apiService.getDeepDive(intent.journeyId)
          : await apiService.startDeepDive(intent.eventId);
        if (!cancelled) hydrate(j);
      } catch (err) {
        if (!cancelled) {
          onNotify({ type: 'error', title: '打不開情緒深潛', message: (err as Error)?.message || '請稍後再試一次。' });
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, intent, hydrate, onNotify, onClose]);

  const patchFor = useCallback((s: DeepDiveStep): Partial<DeepDiveState> => {
    switch (s) {
      case 'CURRENT_EMOTION': return { situation: form.situation.trim(), current_emotions: form.current_emotions };
      case 'DEEPER_EMOTION': return { deeper_emotions: form.deeper_emotions };
      case 'FAMILIARITY_CHECK': return { familiarity: form.familiarity };
      case 'MEMORY_EXPLORATION': return { memory_text: form.memory_text.trim() };
      case 'PAST_PERSON': return { past_person: form.past_person };
      case 'CURRENT_NEED': return { current_need: { type: form.need_type, custom: form.need_custom.trim() } };
      default: return {};
    }
  }, [form]);

  const persistLetter = useCallback(async (id: string, s: DeepDiveStep) => {
    if (s === 'PAST_LETTER') await apiService.saveDeepDiveLetter(id, 'past', form.pastLetter);
    else if (s === 'COMPASSION_LETTER') await apiService.saveDeepDiveLetter(id, 'compassion', form.compassionLetter);
    else if (s === 'PARTNER_LETTER') await apiService.saveDeepDiveLetter(id, 'partner', form.partnerLetter);
  }, [form.pastLetter, form.compassionLetter, form.partnerLetter]);

  const goNext = useCallback(async (opts?: { skip?: boolean }) => {
    if (!journey || lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    try {
      const target = nextOwnerStep(step, { ...journey.state, familiarity: form.familiarity } as DeepDiveState);
      await persistLetter(journey.id, step);
      const updated = await apiService.saveDeepDiveStep(journey.id, target, patchFor(step), opts?.skip);
      setJourney(updated);
      setStep(target);
      setReflection(null);
      onChanged?.();
    } catch (err) {
      onNotify({ type: 'error', title: '這一步存不起來', message: (err as Error)?.message || '你寫的內容還在，請再試一次。' });
    } finally {
      setBusy(false);
      lockRef.current = false;
    }
  }, [journey, step, form.familiarity, patchFor, persistLetter, onNotify, onChanged]);

  const goPrev = useCallback(async () => {
    if (!journey) return;
    // Going back is local — nothing to persist, drafts are already in form.
    const target = prevOwnerStep(step, { ...journey.state, familiarity: form.familiarity } as DeepDiveState);
    setReflection(null);
    setStep(target);
  }, [journey, step, form.familiarity]);

  // Save the current step silently, then close (= pause). Failures don't block
  // leaving — the last saved step is the resume point.
  const pauseAndClose = useCallback(async () => {
    if (journey && journey.role === 'owner' && journey.status === 'in_progress') {
      try {
        await persistLetter(journey.id, step);
        await apiService.saveDeepDiveStep(journey.id, step, patchFor(step));
        onChanged?.();
      } catch { /* leaving anyway; server has the last committed step */ }
    }
    onClose();
  }, [journey, step, patchFor, persistLetter, onChanged, onClose]);

  const runReflect = useCallback(async (kind: 'emotion' | 'memory' | 'past' | 'partner_mirror', draft?: string) => {
    if (!journey) return;
    setAiLoading(true);
    try {
      const r = await apiService.deepDiveReflect(journey.id, kind, draft);
      setReflection(r);
    } catch (err) {
      const msg = (err as Error & { error_code?: string })?.error_code === 'DEEP_DIVE_AI_QUOTA'
        ? '今天的 AI 次數用完了，你還是可以自己寫，你寫的內容都在。'
        : (err as Error)?.message || 'AI 暫時想不出來。';
      onNotify({ type: 'info', title: 'AI 先休息一下', message: msg });
    } finally {
      setAiLoading(false);
    }
  }, [journey, onNotify]);

  const runLetterAi = useCallback(async (kind: 'compassion' | 'partner') => {
    if (!journey) return;
    setAiLoading(true);
    try {
      const draft = kind === 'compassion' ? form.compassionLetter : form.partnerLetter;
      const r = await apiService.deepDiveLetterAi(journey.id, kind, draft);
      setForm((f) => ({ ...f, [kind === 'compassion' ? 'compassionLetter' : 'partnerLetter']: r.letter }));
    } catch (err) {
      const msg = (err as Error & { error_code?: string })?.error_code === 'DEEP_DIVE_AI_QUOTA'
        ? '今天的 AI 次數用完了，你可以自己寫，你寫的內容都在。'
        : (err as Error)?.message || 'AI 暫時想不出來。';
      onNotify({ type: 'info', title: 'AI 先休息一下', message: msg });
    } finally {
      setAiLoading(false);
    }
  }, [journey, form.compassionLetter, form.partnerLetter, onNotify]);

  // Crisis guard: any free-text change is screened locally (no LLM, no quota).
  const guard = useCallback((text: string) => {
    if (detectDraftTone(text) === 'crisis') setCrisis(true);
  }, []);

  const doShare = useCallback(async () => {
    if (!journey || lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    try {
      await apiService.saveDeepDiveLetter(journey.id, 'partner', form.partnerLetter);
      const updated = await apiService.shareDeepDive(journey.id);
      setJourney(updated);
      setStep(updated.current_step);
      onChanged?.();
      onNotify({ type: 'success', title: '已經分享給另一半', message: '接下來 TA 會先讀完，再用自己的話回應你。' });
    } catch (err) {
      const e = err as Error & { error_code?: string };
      if (e?.error_code === 'NOT_PAIRED') {
        onNotify({ type: 'warning', title: '先和另一半配對', message: e.message });
      } else {
        onNotify({ type: 'error', title: '暫時沒辦法分享', message: e?.message || '你的信已經存好了，請稍後再試。' });
      }
    } finally {
      setBusy(false);
      lockRef.current = false;
    }
  }, [journey, form.partnerLetter, onChanged, onNotify]);

  const saveOnly = useCallback(async () => {
    if (!journey) return;
    try {
      await apiService.saveDeepDiveLetter(journey.id, 'partner', form.partnerLetter);
      onNotify({ type: 'success', title: '已保存', message: '這封信先留給你自己，之後想分享隨時可以回來。' });
      onChanged?.();
      onClose();
    } catch (err) {
      onNotify({ type: 'error', title: '存不起來', message: (err as Error)?.message || '請再試一次。' });
    }
  }, [journey, form.partnerLetter, onNotify, onChanged, onClose]);

  // --- partner-side actions ---
  const partnerAdvance = useCallback(async (fn: () => Promise<void>, next: typeof partnerStep) => {
    if (!journey || lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    try {
      await fn();
      setPartnerStep(next);
      onChanged?.();
    } catch (err) {
      onNotify({ type: 'error', title: '暫時存不起來', message: (err as Error)?.message || '你寫的內容還在，請再試一次。' });
    } finally {
      setBusy(false);
      lockRef.current = false;
    }
  }, [journey, onNotify, onChanged]);

  const doRepair = useCallback(async () => {
    if (!journey) return;
    setBusy(true);
    try {
      const updated = await apiService.deepDiveRepair(journey.id, {
        shared_understanding: form.repair_understanding,
        agreed_action: form.repair_action,
      });
      setJourney(updated);
      onChanged?.();
      onNotify({ type: 'success', title: '完成這次對話', message: '你們一起走完了這一段，先為彼此的努力停一下。' });
      onClose();
    } catch (err) {
      onNotify({ type: 'error', title: '存不起來', message: (err as Error)?.message || '請再試一次。' });
    } finally {
      setBusy(false);
    }
  }, [journey, form.repair_understanding, form.repair_action, onChanged, onNotify, onClose]);

  if (!open) return null;

  const stepIndex = SELF_PATH.indexOf(step);
  const progress = stepIndex >= 0 ? `第 ${stepIndex + 1} 步` : '';

  const toggle = (arr: string[], v: string): string[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const Frame: React.FC<{ children: React.ReactNode; footer?: React.ReactNode }> = ({ children, footer }) => (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <div className="pt-4 mt-4 border-t border-petal-rule">{footer}</div>}
    </>
  );

  // Standard owner footer: 上一步 / 跳過 / 下一步.
  const ownerFooter = (opts?: { nextLabel?: string; nextDisabled?: boolean; hidePrev?: boolean }) => (
    <div className="flex items-center justify-between gap-2">
      {!opts?.hidePrev && step !== 'CURRENT_EMOTION' ? (
        <button type="button" onClick={goPrev} disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm font-body text-petal-ink-soft hover:text-petal-ink disabled:opacity-40" data-testid="deep-dive-prev">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />上一步
        </button>
      ) : <span />}
      <div className="flex items-center gap-3">
        {SKIPPABLE.has(step) && (
          <button type="button" onClick={() => goNext({ skip: true })} disabled={busy}
            className="text-sm font-body text-petal-muted hover:text-petal-ink disabled:opacity-40" data-testid="deep-dive-skip">
            跳過這一步
          </button>
        )}
        <button type="button" onClick={() => goNext()} disabled={busy || opts?.nextDisabled}
          className="inline-flex items-center gap-2 rounded-full bg-petal-ink text-petal-cream px-5 py-2.5 font-medium disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition" data-testid="deep-dive-next">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" strokeWidth={1.5} />}
          {opts?.nextLabel || '下一步'}
        </button>
      </div>
    </div>
  );

  const aiReflectButton = (kind: 'emotion' | 'memory' | 'past', draft?: string) => (
    <button type="button" onClick={() => runReflect(kind, draft)} disabled={aiLoading}
      className="inline-flex items-center gap-1.5 text-sm font-body text-petal-rose-deep hover:opacity-80 disabled:opacity-40" data-testid="deep-dive-ai-reflect">
      {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" strokeWidth={1.5} />}
      請 {companionShortName} 陪我看看
    </button>
  );

  const reflectionCard = reflection && (
    <div className="mt-4 rounded-2xl bg-petal-rose-soft/25 border border-petal-rule p-4" data-testid="deep-dive-reflection">
      <p className="font-body text-sm text-petal-ink leading-relaxed">{reflection.reflection}</p>
      {reflection.question && <p className="font-body text-sm text-petal-rose-deep mt-2">{reflection.question}</p>}
    </div>
  );

  const letterEditor = (value: string, onChange: (v: string) => void, placeholder: string, testid: string) => (
    <textarea
      value={value}
      onChange={(e) => { onChange(e.target.value); guard(e.target.value); }}
      placeholder={placeholder}
      rows={7}
      maxLength={4000}
      data-testid={testid}
      className="w-full mt-3 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y font-body text-sm leading-relaxed"
    />
  );

  // ---- render the active screen ----
  function renderScreen(): React.ReactNode {
    if (loading || !journey) {
      return <div className="flex items-center justify-center h-40 text-petal-muted"><Loader2 className="w-6 h-6 animate-spin" /></div>;
    }
    if (crisis) return <SafetyExitScreen onLeave={onClose} />;

    // ===== PARTNER SIDE =====
    if (journey.role === 'partner') {
      const letter = journey.partner_letter?.content || '';
      if (partnerStep === 'read') {
        return (
          <Frame footer={
            <button type="button" onClick={() => partnerAdvance(() => apiService.deepDivePartnerRead(journey.id), 'mirror')} disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-petal-ink text-petal-cream px-5 py-3 font-medium disabled:opacity-40" data-testid="deep-dive-partner-read-done">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={1.5} />}我讀完了
            </button>
          }>
            <div className="inline-flex items-center gap-2 text-petal-rose-deep mb-2"><Heart className="w-5 h-5" strokeWidth={1.5} /><span className="font-display italic text-lg">TA 想讓你更了解 TA</span></div>
            <p className="font-body text-sm text-petal-muted mb-4">這不是一封要求你解決問題的信。先花一點時間讀完，現在不需要解釋，也不需要辯護。</p>
            <Card testid="deep-dive-partner-letter">
              <p className="font-body text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">{letter}</p>
            </Card>
          </Frame>
        );
      }
      if (partnerStep === 'mirror') {
        return (
          <Frame footer={
            <button type="button" onClick={() => partnerAdvance(() => apiService.deepDivePartnerMirror(journey.id, mirror), 'validation')} disabled={busy || mirror.trim().length === 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-petal-ink text-petal-cream px-5 py-3 font-medium disabled:opacity-40" data-testid="deep-dive-partner-mirror-next">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" strokeWidth={1.5} />}下一步
            </button>
          }>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">你聽見了什麼？</h3>
            <p className="font-body text-sm text-petal-muted mb-2">不需要判斷誰對誰錯。先用自己的話說說看，你覺得 TA 真正想讓你知道的是什麼。</p>
            <button type="button" onClick={() => runReflect('partner_mirror')} disabled={aiLoading}
              className="inline-flex items-center gap-1.5 text-sm text-petal-rose-deep hover:opacity-80 disabled:opacity-40" data-testid="deep-dive-ai-reflect">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" strokeWidth={1.5} />}需要一點提示
            </button>
            {reflectionCard}
            <textarea value={mirror} onChange={(e) => setMirror(e.target.value)} placeholder="我聽見你其實……" rows={5} maxLength={2000}
              data-testid="deep-dive-partner-mirror-input"
              className="w-full mt-3 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y font-body text-sm" />
          </Frame>
        );
      }
      if (partnerStep === 'validation') {
        const set = (k: keyof DeepDiveValidation, v: string) => setValidation((s) => ({ ...s, [k]: v }));
        const fields: { k: keyof DeepDiveValidation; label: string }[] = [
          { k: 'knew_now', label: '我現在知道……' },
          { k: 'didnt_know', label: '我以前不知道……' },
          { k: 'want_you_to_know', label: '我想讓你知道……' },
        ];
        return (
          <Frame footer={
            <button type="button" onClick={() => partnerAdvance(() => apiService.deepDivePartnerValidation(journey.id, validation), 'response')} disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-petal-ink text-petal-cream px-5 py-3 font-medium disabled:opacity-40" data-testid="deep-dive-partner-validation-next">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" strokeWidth={1.5} />}下一步
            </button>
          }>
            <div className="inline-flex items-center gap-2 text-petal-rose-deep mb-1"><Heart className="w-5 h-5" strokeWidth={1.5} /><span className="font-display italic text-lg">告訴 TA：你理解了什麼</span></div>
            <div className="space-y-3 mt-3">
              {fields.map((f) => (
                <div key={f.k}>
                  <label className="font-body text-sm text-petal-ink-soft">{f.label}</label>
                  <textarea value={validation[f.k] || ''} onChange={(e) => set(f.k, e.target.value)} rows={2} maxLength={2000}
                    data-testid={`deep-dive-validation-${f.k}`}
                    className="w-full mt-1 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink focus:outline-none focus:border-petal-rose-deep resize-y font-body text-sm" />
                </div>
              ))}
            </div>
          </Frame>
        );
      }
      if (partnerStep === 'response') {
        return (
          <Frame footer={
            <button type="button" onClick={() => partnerAdvance(() => apiService.deepDivePartnerResponse(journey.id, response), 'done')} disabled={busy || response.trim().length === 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-petal-ink text-petal-cream px-5 py-3 font-medium disabled:opacity-40" data-testid="deep-dive-partner-response-send">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" strokeWidth={1.5} />}回應這封信
            </button>
          }>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">回應這封信</h3>
            <p className="font-body text-sm text-petal-muted mb-2">可以分享你的感受。但先不要急著證明自己沒有錯。可以試試：我現在更了解你…／我以前沒有意識到…／我很抱歉讓你感受到…／下次我可以試著…</p>
            <textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="我現在更了解你……" rows={6} maxLength={4000}
              data-testid="deep-dive-partner-response-input"
              className="w-full mt-1 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y font-body text-sm" />
          </Frame>
        );
      }
      // done
      return (
        <Frame footer={
          <button type="button" onClick={onClose} className="w-full rounded-full bg-petal-ink text-petal-cream px-5 py-3 font-medium" data-testid="deep-dive-partner-done">完成</button>
        }>
          <div className="text-center py-8">
            <Heart className="w-10 h-10 text-petal-rose-deep mx-auto mb-3" strokeWidth={1.5} />
            <p className="font-display italic text-lg text-petal-ink">你回應了 TA</p>
            <p className="font-body text-sm text-petal-muted mt-2">你願意先聽、再回應，這對你們很重要。</p>
          </div>
        </Frame>
      );
    }

    // ===== OWNER: post-share (waiting / repair) =====
    if (journey.status !== 'in_progress') {
      if (journey.status === 'partner_responded' || journey.status === 'completed') {
        const pr = journey.partner_response;
        return (
          <Frame footer={
            <button type="button" onClick={doRepair} disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-petal-ink text-petal-cream px-5 py-3 font-medium disabled:opacity-40" data-testid="deep-dive-repair-done">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={1.5} />}完成這次對話
            </button>
          }>
            <div className="inline-flex items-center gap-2 text-petal-sage mb-2"><Heart className="w-5 h-5" strokeWidth={1.5} /><span className="font-display italic text-lg">回到現在</span></div>
            {pr?.response && (
              <Card testid="deep-dive-owner-partner-response">
                <p className="font-body text-[11px] uppercase tracking-wider text-petal-muted mb-1">另一半的回應</p>
                <p className="font-body text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">{pr.response}</p>
              </Card>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="font-body text-sm text-petal-ink-soft">我們現在都知道了……</label>
                <textarea value={form.repair_understanding} onChange={(e) => setForm((f) => ({ ...f, repair_understanding: e.target.value }))} rows={2} maxLength={2000}
                  data-testid="deep-dive-repair-understanding"
                  className="w-full mt-1 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink focus:outline-none focus:border-petal-rose-deep resize-y font-body text-sm" />
              </div>
              <div>
                <label className="font-body text-sm text-petal-ink-soft">下次我們可以試著……</label>
                <textarea value={form.repair_action} onChange={(e) => setForm((f) => ({ ...f, repair_action: e.target.value }))} rows={2} maxLength={2000}
                  data-testid="deep-dive-repair-action"
                  className="w-full mt-1 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink focus:outline-none focus:border-petal-rose-deep resize-y font-body text-sm" />
              </div>
            </div>
          </Frame>
        );
      }
      // shared / partner_reading — waiting for the partner.
      return (
        <Frame footer={<button type="button" onClick={onClose} className="w-full rounded-full border border-petal-rule text-petal-ink px-5 py-3 font-body" data-testid="deep-dive-owner-waiting-close">先離開，等 TA 讀完</button>}>
          <div className="text-center py-8">
            <Compass className="w-10 h-10 text-petal-rose-deep mx-auto mb-3" strokeWidth={1.5} />
            <p className="font-display italic text-lg text-petal-ink">已經分享給另一半</p>
            <p className="font-body text-sm text-petal-muted mt-2">TA 會先好好讀完，再用自己的話回應你。回應之後你會收到通知。</p>
          </div>
        </Frame>
      );
    }

    // ===== OWNER: the self-exploration steps =====
    switch (step) {
      case 'CURRENT_EMOTION':
        return (
          <Frame footer={ownerFooter({ nextDisabled: form.current_emotions.length === 0 && form.situation.trim().length === 0, nextLabel: '開始探索' })}>
            <div className="inline-flex items-center gap-2 text-petal-rose-deep mb-2"><Compass className="w-5 h-5" strokeWidth={1.5} /><span className="font-display italic text-lg">深入這個感覺</span></div>
            <p className="font-body text-sm text-petal-muted mb-4">有時候，現在的事情之所以特別痛，是因為它碰到了我們過去曾經有過的感受。我們不用急著找答案，只要一起看看，這個感覺對你來說是不是很熟悉。</p>
            <label className="font-body text-sm text-petal-ink-soft">現在發生了什麼事？</label>
            <textarea value={form.situation} onChange={(e) => { setForm((f) => ({ ...f, situation: e.target.value })); guard(e.target.value); }}
              placeholder="簡單描述這次讓你有感覺的事……" rows={3} maxLength={2000} data-testid="deep-dive-situation"
              className="w-full mt-1 mb-4 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y font-body text-sm" />
            <label className="font-body text-sm text-petal-ink">如果不只看生氣，現在的你還感覺到什麼？<span className="text-petal-muted">（可以多選）</span></label>
            <div className="flex flex-wrap gap-2 mt-3">
              {EMOTION_CHIPS.map((c) => (
                <Chip key={c} label={c} active={form.current_emotions.includes(c)} onClick={() => setForm((f) => ({ ...f, current_emotions: toggle(f.current_emotions, c) }))} testid={`deep-dive-emotion-${c}`} />
              ))}
            </div>
          </Frame>
        );
      case 'DEEPER_EMOTION':
        return (
          <Frame footer={ownerFooter()}>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">再往下看一點</h3>
            <p className="font-body text-sm text-petal-muted mb-3">生氣底下，常常還有一個更安靜的感受。{aiReflectButton('emotion')}</p>
            {reflectionCard}
            <p className="font-body text-sm text-petal-ink mt-4">哪一個更靠近你心裡的感覺？</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {EMOTION_CHIPS.map((c) => (
                <Chip key={c} label={c} active={form.deeper_emotions.includes(c)} onClick={() => setForm((f) => ({ ...f, deeper_emotions: toggle(f.deeper_emotions, c) }))} testid={`deep-dive-deeper-${c}`} />
              ))}
            </div>
          </Frame>
        );
      case 'FAMILIARITY_CHECK':
        return (
          <Frame footer={ownerFooter({ nextDisabled: !form.familiarity })}>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">這個感覺熟悉嗎？</h3>
            <p className="font-body text-sm text-petal-muted mb-4">「沒有過去的連結」也是完全可以的答案，不用勉強去找。</p>
            <div className="space-y-2">
              {FAMILIARITY_OPTIONS.map((o) => (
                <button key={o.value} type="button" onClick={() => setForm((f) => ({ ...f, familiarity: o.value }))}
                  data-testid={`deep-dive-familiarity-${o.value}`}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition ${form.familiarity === o.value ? 'border-petal-rose-deep bg-petal-rose-soft/25' : 'border-petal-rule bg-white hover:border-petal-rose-deep'}`}>
                  <span className="font-body text-sm text-petal-ink">{o.value}</span>
                  {o.hint && <span className="block font-body text-xs text-petal-muted mt-0.5">{o.hint}</span>}
                </button>
              ))}
            </div>
          </Frame>
        );
      case 'MEMORY_EXPLORATION':
        return (
          <Frame footer={ownerFooter()}>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">第一個浮現的畫面是什麼？</h3>
            <p className="font-body text-sm text-petal-muted mb-2">不需要想得很完整。一個人、一個地方、一句話，甚至一個很模糊的畫面都可以。</p>
            {aiReflectButton('memory')}
            {reflectionCard}
            <textarea value={form.memory_text} onChange={(e) => { setForm((f) => ({ ...f, memory_text: e.target.value })); guard(e.target.value); }}
              placeholder="寫下你想到的事情……" rows={5} maxLength={2000} data-testid="deep-dive-memory"
              className="w-full mt-3 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y font-body text-sm" />
          </Frame>
        );
      case 'PAST_PERSON':
        return (
          <Frame footer={ownerFooter()}>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">這段記憶裡，你最想對誰說？</h3>
            <p className="font-body text-sm text-petal-muted mb-4">選了誰，都不代表這一切是那個人造成的。只是你想起了一種熟悉的感覺。</p>
            <div className="flex flex-wrap gap-2">
              {PAST_PERSON_OPTIONS.map((p) => (
                <Chip key={p} label={p} active={form.past_person === p} onClick={() => setForm((f) => ({ ...f, past_person: p }))} testid={`deep-dive-person-${p}`} />
              ))}
            </div>
          </Frame>
        );
      case 'PAST_LETTER':
        return (
          <Frame footer={ownerFooter()}>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">寫一封給過去的信</h3>
            <p className="font-body text-sm text-petal-muted mb-1">把當時沒有說出口的話，寫下來。這封信只有你看得到。</p>
            <div className="inline-flex items-center gap-1 text-[11px] text-petal-muted"><Lock className="w-3 h-3" strokeWidth={1.5} />私人，不會分享給任何人</div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {PAST_STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => setForm((f) => ({ ...f, pastLetter: f.pastLetter ? f.pastLetter : s }))}
                  className="rounded-full border border-petal-rule bg-petal-cream-2 px-3 py-1 text-xs font-body text-petal-ink-soft hover:border-petal-rose-deep">{s}</button>
              ))}
            </div>
            {aiReflectButton('past', form.pastLetter)}
            {reflectionCard}
            {letterEditor(form.pastLetter, (v) => setForm((f) => ({ ...f, pastLetter: v })), '「那時候的我，其實很想讓你知道……」', 'deep-dive-past-letter')}
          </Frame>
        );
      case 'COMPASSION_LETTER':
        return (
          <Frame footer={ownerFooter()}>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">寫一封你當時很需要收到的信</h3>
            <p className="font-body text-sm text-petal-muted mb-2">不代表那個人真的會這樣說。這是一封寫給當時的你的理解與愛。如果當時有一個真正理解你的大人陪在你身邊，你希望 TA 怎麼回應你？</p>
            <div className="inline-flex items-center gap-1 text-[11px] text-petal-muted mb-2"><Lock className="w-3 h-3" strokeWidth={1.5} />私人，不會分享給任何人</div>
            <div>
              <button type="button" onClick={() => runLetterAi('compassion')} disabled={aiLoading}
                className="inline-flex items-center gap-1.5 text-sm text-petal-rose-deep hover:opacity-80 disabled:opacity-40" data-testid="deep-dive-ai-letter">
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" strokeWidth={1.5} />}請 {companionShortName} 幫我起個頭
              </button>
            </div>
            {letterEditor(form.compassionLetter, (v) => setForm((f) => ({ ...f, compassionLetter: v })), '親愛的那時候的我，你的感受沒有錯……', 'deep-dive-compassion-letter')}
          </Frame>
        );
      case 'CURRENT_NEED':
        return (
          <Frame footer={ownerFooter({ nextDisabled: !form.need_type && form.need_custom.trim().length === 0 })}>
            <div className="inline-flex items-center gap-2 text-petal-rose-deep mb-2"><Compass className="w-5 h-5" strokeWidth={1.5} /><span className="font-display italic text-lg">回到現在</span></div>
            <p className="font-body text-sm text-petal-muted mb-4">今天伴侶的行為不一定和過去一樣，但它似乎碰到了相似的感受。現在的你，最需要伴侶做什麼？</p>
            <div className="flex flex-wrap gap-2">
              {NEED_CHIPS.map((n) => (
                <Chip key={n} label={n} active={form.need_type === n} onClick={() => setForm((f) => ({ ...f, need_type: n }))} testid={`deep-dive-need-${n}`} />
              ))}
            </div>
            <input value={form.need_custom} onChange={(e) => setForm((f) => ({ ...f, need_custom: e.target.value }))} placeholder="或用自己的話說……" maxLength={200}
              data-testid="deep-dive-need-custom"
              className="w-full mt-3 p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep font-body text-sm" />
          </Frame>
        );
      case 'PARTNER_LETTER':
        return (
          <Frame footer={ownerFooter({ nextLabel: '預覽並分享' })}>
            <div className="inline-flex items-center gap-2 text-petal-rose-deep mb-1"><Heart className="w-5 h-5" strokeWidth={1.5} /><span className="font-display italic text-lg">寫給伴侶的一封信</span></div>
            <p className="font-body text-sm text-petal-muted mb-2">不是告訴 TA「你做錯了什麼」，而是讓 TA 知道：這件事情碰到了你心裡什麼地方。</p>
            <div>
              <button type="button" onClick={() => runLetterAi('partner')} disabled={aiLoading}
                className="inline-flex items-center gap-1.5 text-sm text-petal-rose-deep hover:opacity-80 disabled:opacity-40" data-testid="deep-dive-ai-letter">
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" strokeWidth={1.5} />}請 {companionShortName} 幫我整理成一封信
              </button>
            </div>
            {letterEditor(form.partnerLetter, (v) => setForm((f) => ({ ...f, partnerLetter: v })), '當你 ______ 的時候，我表面上感覺到的是 ______。但我後來發現，這件事情也讓我想起 ______。', 'deep-dive-partner-letter-edit')}
          </Frame>
        );
      case 'SHARED':
      default:
        return (
          <Frame footer={
            <div className="flex flex-col gap-2">
              <button type="button" onClick={doShare} disabled={busy || form.partnerLetter.trim().length === 0}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-petal-ink text-petal-cream px-5 py-3 font-medium disabled:opacity-40" data-testid="deep-dive-share">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" strokeWidth={1.5} />}分享給伴侶
              </button>
              <button type="button" onClick={saveOnly} disabled={busy}
                className="w-full rounded-full border border-petal-rule text-petal-ink px-5 py-3 font-body disabled:opacity-40" data-testid="deep-dive-save-only">只保存，不分享</button>
              <button type="button" onClick={goPrev} className="text-sm text-petal-ink-soft hover:text-petal-ink mt-1" data-testid="deep-dive-prev">回去修改</button>
            </div>
          }>
            <h3 className="font-display italic text-lg text-petal-ink mb-1">準備好讓 TA 看見真正的你了嗎？</h3>
            <p className="font-body text-sm text-petal-muted mb-3">這是 TA 會讀到的信。前面寫給過去的信，只留給你自己。</p>
            <Card testid="deep-dive-share-preview">
              <p className="font-body text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">{form.partnerLetter || '（還沒有內容，回去補上幾句話吧）'}</p>
            </Card>
          </Frame>
        );
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-petal-cream flex flex-col" data-testid="deep-dive-journey-view">
      <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 py-6 flex-1 min-h-0 flex flex-col safe-pb">
        <div className="flex items-start justify-between gap-3 mb-5">
          <button type="button" onClick={pauseAndClose} data-testid="deep-dive-pause"
            className="inline-flex items-center gap-1.5 font-body text-sm text-petal-ink-soft hover:text-petal-ink p-2 -m-2">
            <PauseCircle className="w-4 h-4" strokeWidth={1.5} />暫停，稍後再走
          </button>
          <div className="text-right">
            <div className="font-body text-[11px] uppercase tracking-[0.18em] text-petal-rose-deep mb-0.5 inline-flex items-center gap-1">
              <Compass className="w-3.5 h-3.5" strokeWidth={1.5} />情緒深潛
            </div>
            {journey?.role === 'owner' && journey.status === 'in_progress' && progress && (
              <div className="font-body text-xs text-petal-muted" data-testid="deep-dive-progress">{progress}</div>
            )}
          </div>
        </div>
        {renderScreen()}
      </div>
    </div>,
    document.body
  );
};

export default DeepDiveJourneyView;
