import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Heart, ArrowLeft, RotateCcw, Sparkles, Plus, Trash2 } from 'lucide-react';
import { apiService, type LoveWish } from '../services/api';
import {
  LOVE_LANGUAGES,
  LOVE_LANGUAGE_ORDER,
  LOVE_LANGUAGE_QUIZ,
  LOVE_ACTIONS,
  emptyScores,
  topLanguage,
  type LoveLanguageCode,
  type LoveLanguageScores,
} from '../data/loveLanguage';
import { tr } from '../i18n/tr';

interface AuthState {
  isAuthenticated: boolean;
  user: { id: string; nickname?: string } | null;
  partnerConnected: boolean;
}

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface LoveLanguageViewProps {
  authState: AuthState;
  showNotification: (n: NotificationInput) => void;
  setShowAuthModal: (show: boolean) => void;
}

type Phase = 'loading' | 'intro' | 'quiz' | 'result';

const ASSESSMENT_TYPE = 'love_language';

const LoveLanguageView: React.FC<LoveLanguageViewProps> = ({ authState, showNotification, setShowAuthModal }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [scores, setScores] = useState<LoveLanguageScores>(emptyScores());
  const [result, setResult] = useState<LoveLanguageCode | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<LoveLanguageScores>(emptyScores());
  const [saving, setSaving] = useState(false);
  const [partner, setPartner] = useState<{ nickname: string; result: LoveLanguageCode } | null>(null);

  const isCode = (s: string): s is LoveLanguageCode =>
    (LOVE_LANGUAGE_ORDER as string[]).includes(s);

  useEffect(() => {
    if (!authState.isAuthenticated) {
      setPhase('intro');
      return;
    }
    let cancelled = false;
    (async () => {
      const [mine, partnerData] = await Promise.all([
        apiService.getAssessments(),
        apiService.getPartnerAssessments(),
      ]);
      if (cancelled) return;
      const ll = mine.find((a) => a.type === ASSESSMENT_TYPE);
      if (ll && isCode(ll.result)) {
        setResult(ll.result);
        setScores({ ...emptyScores(), ...(ll.scores as LoveLanguageScores) });
        setPhase('result');
      } else {
        setPhase('intro');
      }
      const pll = partnerData.assessments.find((a) => a.type === ASSESSMENT_TYPE);
      if (partnerData.partner && pll && isCode(pll.result)) {
        setPartner({ nickname: partnerData.partner.nickname, result: pll.result });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.isAuthenticated]);

  const startQuiz = () => {
    setAnswers(emptyScores());
    setStep(0);
    setPhase('quiz');
  };

  const choose = async (code: LoveLanguageCode) => {
    const next = { ...answers, [code]: answers[code] + 1 };
    setAnswers(next);
    if (step + 1 < LOVE_LANGUAGE_QUIZ.length) {
      setStep(step + 1);
      return;
    }
    // Finished — compute, persist, show result.
    const top = topLanguage(next);
    setScores(next);
    setResult(top);
    if (authState.isAuthenticated) {
      setSaving(true);
      try {
        await apiService.saveAssessment(ASSESSMENT_TYPE, top, next);
        showNotification({ type: 'success', title: tr('測驗完成', 'Quiz complete'), message: tr('你的愛之語已記錄在個人檔案。', 'Your love language has been saved to your profile.') });
      } catch (err) {
        const e = err as { message?: string };
        showNotification({ type: 'error', title: tr('儲存失敗', 'Couldn\'t save'), message: e?.message || tr('結果無法儲存，但你仍可查看。', 'Your result couldn\'t be saved, but you can still see it.') });
      } finally {
        setSaving(false);
      }
    }
    setPhase('result');
  };

  if (phase === 'loading') {
    return <div className="max-w-md mx-auto py-16 text-center font-body text-sm text-petal-muted">{tr('載入中…', 'Loading…')}</div>;
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4" data-testid="love-language-view">
      {phase === 'intro' && (
        <Intro
          onStart={startQuiz}
          isAuthenticated={authState.isAuthenticated}
          onLogin={() => setShowAuthModal(true)}
        />
      )}
      {phase === 'quiz' && (
        <Quiz step={step} onChoose={choose} onBack={() => step > 0 && setStep(step - 1)} />
      )}
      {phase === 'result' && result && (
        <>
          <Result
            result={result}
            scores={scores}
            partner={partner}
            saving={saving}
            onRetake={startQuiz}
          />
          <LoveActions
            partner={partner}
            isAuthenticated={authState.isAuthenticated}
            partnerConnected={authState.partnerConnected}
            showNotification={showNotification}
          />
        </>
      )}
    </div>
  );
};

const Intro: React.FC<{ onStart: () => void; isAuthenticated: boolean; onLogin: () => void }> = ({
  onStart,
  isAuthenticated,
  onLogin,
}) => (
  <div className="text-center">
    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-petal-cream-2 text-pink-600 mb-4">
      <Heart className="w-6 h-6" strokeWidth={1.5} />
    </div>
    <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
      {tr('— 愛的語言', '— Love languages')}
    </div>
    <h2 className="font-display text-3xl font-light tracking-tight text-petal-ink mb-3">
      {tr('你最渴望被愛的', 'How you most long to ')}<em className="not-italic font-light italic text-pink-600">{tr('方式', 'be loved')}</em>
    </h2>
    <p className="font-body text-sm text-petal-ink-soft leading-relaxed max-w-sm mx-auto mb-8">
      {tr('每個人渴望被愛的方式不同。花兩分鐘做完這個小測驗，了解你的「愛之語」，也讓另一半知道怎麼愛你最有感。', 'Everyone longs to be loved in a different way. Take this two-minute quiz to discover your love language, and let your partner know how to love you in the way that means the most.')}
    </p>
    <div className="grid grid-cols-5 gap-2 mb-8">
      {LOVE_LANGUAGE_ORDER.map((c) => (
        <div key={c} className="flex flex-col items-center gap-1">
          <span className="text-2xl">{LOVE_LANGUAGES[c].emoji}</span>
          <span className="font-body text-[10px] text-petal-muted leading-tight">{LOVE_LANGUAGES[c].label}</span>
        </div>
      ))}
    </div>
    <button
      onClick={onStart}
      data-testid="love-language-start"
      className="inline-flex items-center gap-2 bg-petal-ink text-petal-cream px-7 py-3 rounded-md hover:bg-pink-700 transition-colors font-display italic text-base"
    >
      <Sparkles className="w-4 h-4" strokeWidth={1.5} />
      {tr('開始測驗（15 題）', 'Start the quiz (15 questions)')}
    </button>
    {!isAuthenticated && (
      <p className="font-body text-xs text-petal-muted mt-3">
        {tr('想把結果存進個人檔案？', 'Want to save your result to your profile?')}
        <button onClick={onLogin} className="text-pink-600 hover:text-pink-700 underline underline-offset-2 ml-1">
          {tr('登入', 'Sign in')}
        </button>
      </p>
    )}
  </div>
);

const Quiz: React.FC<{ step: number; onChoose: (c: LoveLanguageCode) => void; onBack: () => void }> = ({
  step,
  onChoose,
  onBack,
}) => {
  const q = LOVE_LANGUAGE_QUIZ[step];
  const total = LOVE_LANGUAGE_QUIZ.length;
  const pct = Math.round((step / total) * 100);
  return (
    <div data-testid="love-language-quiz">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          disabled={step === 0}
          className="inline-flex items-center gap-1 font-body text-sm text-petal-muted hover:text-petal-ink disabled:opacity-40"
        >
          <ArrowLeft className="w-4 h-4" /> {tr('上一題', 'Previous')}
        </button>
        <span className="font-body text-xs text-petal-muted">
          {step + 1} / {total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-petal-cream-2 mb-8 overflow-hidden">
        <div className="h-full bg-pink-400 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <h3 className="font-display text-xl text-petal-ink text-center mb-6">{q.prompt}</h3>
      <div className="space-y-3">
        {q.options.map((opt) => (
          <button
            key={opt.code}
            onClick={() => onChoose(opt.code)}
            data-testid={`love-language-option-${opt.code}`}
            className="w-full text-left bg-petal-cream border border-petal-rule rounded-md px-5 py-4 hover:border-petal-ink hover:bg-petal-cream-2 transition-colors font-body text-sm text-petal-ink"
          >
            {opt.text}
          </button>
        ))}
      </div>
    </div>
  );
};

const Result: React.FC<{
  result: LoveLanguageCode;
  scores: LoveLanguageScores;
  partner: { nickname: string; result: LoveLanguageCode } | null;
  saving: boolean;
  onRetake: () => void;
}> = ({ result, scores, partner, saving, onRetake }) => {
  const meta = LOVE_LANGUAGES[result];
  const max = useMemo(() => Math.max(1, ...LOVE_LANGUAGE_ORDER.map((c) => scores[c])), [scores]);
  return (
    <div data-testid="love-language-result">
      <div className="text-center mb-6">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          {tr('— 你的愛之語', '— Your love language')}
        </div>
        <div className="text-5xl mb-2">{meta.emoji}</div>
        <h2 className="font-display text-3xl font-light text-petal-ink">{meta.label}</h2>
        <p className="font-display italic text-petal-muted mt-1">{meta.tagline}</p>
      </div>

      <div className="bg-petal-cream border border-petal-rule rounded-md p-5 mb-4">
        <p className="font-body text-sm text-petal-ink leading-relaxed">{meta.description}</p>
      </div>

      {/* Score breakdown */}
      <div className="bg-petal-cream border border-petal-rule rounded-md p-5 mb-4 space-y-2.5">
        <div className="font-body text-xs text-petal-muted mb-1">{tr('完整分布', 'Full breakdown')}</div>
        {LOVE_LANGUAGE_ORDER.map((c) => (
          <div key={c} className="flex items-center gap-2">
            <span className="font-body text-xs text-petal-ink w-20 shrink-0">
              {LOVE_LANGUAGES[c].emoji} {LOVE_LANGUAGES[c].label}
            </span>
            <div className="flex-1 h-2 rounded-full bg-petal-cream-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${c === result ? 'bg-pink-500' : 'bg-petal-rose-soft'}`}
                style={{ width: `${(scores[c] / max) * 100}%` }}
              />
            </div>
            <span className="font-body text-[11px] text-petal-muted w-5 text-right">{scores[c]}</span>
          </div>
        ))}
      </div>

      {/* Partner pairing tip */}
      {partner && (
        <div className="bg-petal-rose-soft/25 border border-petal-rose-soft rounded-md p-5 mb-4">
          <div className="font-body text-xs text-petal-rose-deep mb-1">
            {partner.nickname} {tr('的愛之語是', '— love language:')} {LOVE_LANGUAGES[partner.result].emoji} {LOVE_LANGUAGES[partner.result].label}
          </div>
          <p className="font-body text-sm text-petal-ink leading-relaxed">
            {tr('想讓', 'To help ')} {partner.nickname} {tr('感受到愛：', ' feel loved:')}{LOVE_LANGUAGES[partner.result].partnerTip}
          </p>
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onRetake}
          disabled={saving}
          data-testid="love-language-retake"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-sm disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
          {tr('重新測驗', 'Retake the quiz')}
        </button>
      </div>
    </div>
  );
};

// Suggested actions (5 defaults for the partner's love language) + each person's
// own custom 愛的行動 wishlist — coin-store style: defaults you can do, plus
// custom items either partner proposes for themselves.
const LoveActions: React.FC<{
  partner: { nickname: string; result: LoveLanguageCode } | null;
  isAuthenticated: boolean;
  partnerConnected: boolean;
  showNotification: (n: NotificationInput) => void;
}> = ({ partner, isAuthenticated, partnerConnected, showNotification }) => {
  const [mine, setMine] = useState<LoveWish[]>([]);
  const [partnerWishes, setPartnerWishes] = useState<LoveWish[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!isAuthenticated) return;
    apiService
      .getLoveWishes()
      .then(({ mine, partner }) => {
        setMine(mine);
        setPartnerWishes(partner);
      })
      .catch(() => {});
  }, [isAuthenticated]);
  useEffect(load, [load]);

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      const wish = await apiService.addLoveWish(content);
      setMine((p) => [wish, ...p]);
      setDraft('');
    } catch (err) {
      showNotification({ type: 'error', title: tr('新增失敗', 'Couldn\'t add'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setMine((p) => p.filter((w) => w.id !== id));
    try {
      await apiService.deleteLoveWish(id);
    } catch (err) {
      load();
      showNotification({ type: 'error', title: tr('刪除失敗', 'Couldn\'t delete'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment') });
    }
  };

  if (!isAuthenticated) return null;

  const partnerName = partner?.nickname || 'TA';
  const partnerActions = partner ? LOVE_ACTIONS[partner.result] : [];

  return (
    <div className="space-y-4 mt-4" data-testid="love-actions">
      {/* How to make the partner feel loved */}
      {partnerConnected && (
        <div className="bg-petal-rose-soft/20 border border-petal-rose-soft rounded-md p-5">
          <h3 className="font-display text-base text-petal-ink mb-1">{tr('💞 怎麼讓', '💞 How to help ')} {partnerName} {tr('感受到愛', ' feel loved')}</h3>
          {partner ? (
            <>
              <p className="font-body text-xs text-petal-muted mb-3">
                {partnerName} {tr('的愛之語是', '— love language:')} {LOVE_LANGUAGES[partner.result].emoji}{' '}
                {LOVE_LANGUAGES[partner.result].label}{tr('。做這些，幫你「賺」到 TA 的好感：', '. Doing these earns you their affection:')}
              </p>
              <ul className="space-y-2">
                {partnerActions.map((a) => (
                  <li key={a} className="flex items-start gap-2 font-body text-sm text-petal-ink">
                    <Heart className="w-3.5 h-3.5 text-pink-500 mt-0.5 shrink-0" strokeWidth={1.5} />
                    {a}
                  </li>
                ))}
                {partnerWishes.map((w) => (
                  <li key={w.id} className="flex items-start gap-2 font-body text-sm text-petal-ink">
                    <Sparkles className="w-3.5 h-3.5 text-petal-rose-deep mt-0.5 shrink-0" strokeWidth={1.5} />
                    {w.content}
                    <span className="font-body text-[10px] text-petal-muted border border-petal-rule rounded-full px-1.5 py-0.5 shrink-0">
                      {partnerName} {tr('提出', 'suggested by ')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="font-body text-sm text-petal-ink-soft">
              {tr('邀請', 'Invite ')} {partnerName} {tr('一起做測驗，就能看到專屬 TA 的「愛的行動」建議。', ' to take the quiz too, and you\'ll see "acts of love" suggestions made just for them.')}
            </p>
          )}
        </div>
      )}

      {/* My own wishlist — propose what makes you feel loved */}
      <div className="bg-petal-cream border border-petal-rule rounded-md p-5">
        <h3 className="font-display text-base text-petal-ink mb-1">{tr('🌟 我希望的方式', '🌟 What I\'d love')}</h3>
        <p className="font-body text-xs text-petal-muted mb-3">
          {tr('提出能讓你感受到愛的小事，', 'Suggest little things that make you feel loved. ')}{partnerConnected ? tr('另一半會看到。', 'Your partner will see them.') : tr('配對後另一半會看到。', 'Your partner will see them once you\'re paired.')}
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 200))}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={tr("例如：忙的時候傳一句「我想你」", 'e.g. When I\'m busy, send me a quick "thinking of you"')}
            data-testid="love-wish-input"
            className="flex-1 p-2.5 rounded-md border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep text-sm"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || draft.trim().length === 0}
            data-testid="love-wish-add"
            className="px-3 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors disabled:opacity-50 inline-flex items-center"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        {mine.length === 0 ? (
          <p className="font-body text-xs text-petal-muted">{tr('還沒有項目。新增幾項，讓 TA 知道怎麼愛你最有感。', 'Nothing here yet. Add a few so they know how to love you best.')}</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 bg-white border border-petal-rule rounded-md px-3 py-2">
                <span className="font-body text-sm text-petal-ink">{w.content}</span>
                <button
                  type="button"
                  onClick={() => remove(w.id)}
                  aria-label={tr("刪除", 'Delete')}
                  className="text-petal-muted hover:text-petal-rose-deep shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LoveLanguageView;
