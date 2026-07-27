import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Send, Loader2, Lightbulb, ShieldCheck, Tag, CheckCircle2, Sparkles } from 'lucide-react';
import { apiService, type StorySections, type StoryInsight } from '../services/api';

// Guided story template (docs/UX_PLAYBOOK — story archive): one template
// section per step so authors are never staring at a blank page. Publishes
// immediately (post-moderation) and shows the instant AI insight on done.

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

const SECTION_STEPS: { key: keyof StorySections; label: string; prompt: string; placeholder: string }[] = [
  {
    key: 'context',
    label: '背景',
    prompt: '你們是什麼樣的關係？這件事發生前的狀態是？',
    placeholder: '例如：我們交往三年，平常都約在車站碰面一起回家⋯',
  },
  {
    key: 'happened',
    label: '發生了什麼',
    prompt: '具體發生了什麼事？當時彼此說了什麼話、做了什麼？',
    placeholder: '例如：那天他遲到四十分鐘，見面第一句話是「你怎麼又在生氣」⋯',
  },
  {
    key: 'impact',
    label: '情緒衝擊',
    prompt: '這件事讓你（們）有什麼感受？',
    placeholder: '例如：我覺得自己被當成無理取鬧的人，非常受傷也很委屈⋯',
  },
  {
    key: 'tried',
    label: '我們試過什麼',
    prompt: '你們嘗試過哪些方法？哪些沒用、哪些有點用？',
    placeholder: '例如：一開始我們冷戰了兩天，誰都不想先開口，越拖越僵⋯',
  },
  {
    key: 'repair',
    label: '轉捩點與修復',
    prompt: '真正有效的那一步是什麼？誰做了什麼讓事情開始好轉？',
    placeholder: '例如：後來他先傳了一句「我知道讓你等很久，你當時一定很難受」⋯',
  },
  {
    key: 'now',
    label: '現在的我們',
    prompt: '現在你們的狀態如何？這件事教會你們什麼？',
    placeholder: '例如：現在我們約好遲到先講、見面先抱。學到先接住情緒再解釋⋯',
  },
];

// 'freeform' = paste-once mode; 'review' = editable preview of AI-split
// sections before the meta (title/tags) step.
type Step = 'intro' | 'freeform' | 'review' | number | 'meta' | 'submitting' | 'done';

export default function StoryComposeFlow({
  showNickname,
  onDone,
  onCancel,
  showNotification,
}: {
  // From the signed-in user's public_share_show_nickname preference.
  showNickname: boolean;
  onDone: (storyId: string) => void;
  onCancel: () => void;
  showNotification: (n: NotificationInput) => void;
}) {
  const [step, setStep] = useState<Step>('intro');
  const submitLockRef = useRef(false);
  const [sections, setSections] = useState<StorySections>({
    context: '', happened: '', impact: '', tried: '', repair: '', now: '',
  });
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; insights: StoryInsight[] | null; aiSkipped: boolean } | null>(null);
  // Freeform mode.
  const [freeText, setFreeText] = useState('');
  const [structuring, setStructuring] = useState(false);
  // Where the meta step's "back" returns to (last guided section vs the
  // freeform review screen).
  const [metaReturn, setMetaReturn] = useState<Step>(SECTION_STEPS.length - 1);

  const stepIndex = typeof step === 'number' ? step : -1;

  const runStructure = async () => {
    const raw = freeText.trim();
    if (raw.length < 30) {
      setError('請先寫下你的故事（至少 30 字），AI 才能幫你分段');
      return;
    }
    setError(null);
    setStructuring(true);
    try {
      const split = await apiService.structureStory(raw);
      setSections(split);
      setStep('review');
    } catch (err) {
      const e = err as { message?: string; error_code?: string };
      if (e.error_code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: '今日 AI 次數已用完',
          message: '明天會自動補上；你也可以改用「跟著步驟寫」自己分段。',
        });
      } else {
        setError(e.message || 'AI 分段失敗，請稍後再試，或改用逐步填寫');
      }
    } finally {
      setStructuring(false);
    }
  };

  const reviewToMeta = () => {
    for (const s of SECTION_STEPS) {
      if (sections[s.key].trim().length < 10) {
        setError(`「${s.label}」至少需要 10 個字，補一點細節再繼續`);
        return;
      }
    }
    setError(null);
    setMetaReturn('review');
    setStep('meta');
  };

  const nextFromSection = () => {
    const s = SECTION_STEPS[stepIndex];
    const val = sections[s.key].trim();
    if (val.length < 10) {
      setError(`「${s.label}」至少需要 10 個字，寫下一點細節能幫助其他伴侶理解`);
      return;
    }
    setError(null);
    if (stepIndex === SECTION_STEPS.length - 1) { setMetaReturn(SECTION_STEPS.length - 1); setStep('meta'); }
    else setStep(stepIndex + 1);
  };

  const submit = async () => {
    const t = title.trim();
    if (t.length < 4) {
      setError('標題至少需要 4 個字');
      return;
    }
    // Synchronous lock closes the double-click window that `step`-based
    // disabling leaves open, so a story can't be published twice.
    if (submitLockRef.current) return;
    setError(null);
    submitLockRef.current = true;
    setStep('submitting');
    const tags = tagsInput
      .split(/[,，\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 5);
    try {
      const res = await apiService.createStory({ title: t, tags, sections });
      setResult({
        id: res.story.id,
        insights: res.aiInsights?.insights || null,
        aiSkipped: res.aiSkipped,
      });
      setStep('done');
      showNotification({ type: 'success', title: '故事已發表', message: '謝謝你把這段經歷變成別人的地圖' });
    } catch (err) {
      const e = err as { message?: string; error_code?: string; section?: string };
      setError(e.message || '發表失敗，請稍後再試');
      // Jump back to the offending section when the server names one.
      const idx = SECTION_STEPS.findIndex((s) => s.key === (e as { section?: string }).section);
      setStep(idx >= 0 ? idx : 'meta');
    } finally {
      submitLockRef.current = false;
    }
  };

  if (step === 'intro') {
    return (
      <div className="space-y-4" data-testid="story-compose-intro">
        <div className="bg-petal-sage/10 border border-petal-sage rounded-2xl p-4 flex gap-3 items-start">
          <ShieldCheck className="w-5 h-5 text-petal-sage-deep flex-shrink-0 mt-0.5" />
          <div className="text-sm text-petal-ink-soft leading-relaxed">
            <p>把你們最難的時刻，變成幫助其他伴侶的智慧。依照 6 個引導步驟寫下這段經歷，發表後所有人都能閱讀。</p>
            <p className="mt-1.5">
              將以<strong className="text-petal-ink">{showNickname ? '你的暱稱' : '匿名'}</strong>發表
              （可在「設定」的公開分享選項調整）。
            </p>
          </div>
        </div>
        {/* Two ways in: guided 6 steps, or paste-once + AI splits it. */}
        <div className="space-y-2.5">
          <button
            type="button"
            data-testid="story-mode-guided"
            onClick={() => setStep(0)}
            className="w-full text-left rounded-2xl border border-petal-rule bg-white hover:border-petal-rose p-4 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-petal-ink">跟著步驟寫</span>
              <ArrowRight className="w-4 h-4 text-petal-muted" />
            </div>
            <p className="text-xs text-petal-ink-soft mt-1">一步一個問題引導你，適合想被帶著寫的人。共 6 段：{SECTION_STEPS.map((s) => s.label).join('、')}。</p>
          </button>
          <button
            type="button"
            data-testid="story-mode-freeform"
            onClick={() => { setError(null); setStep('freeform'); }}
            className="w-full text-left rounded-2xl border border-petal-rose/60 bg-petal-rose/5 hover:border-petal-rose p-4 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-petal-ink inline-flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-petal-rose-deep" />
                一次寫完，AI 幫你分段
              </span>
              <ArrowRight className="w-4 h-4 text-petal-muted" />
            </div>
            <p className="text-xs text-petal-ink-soft mt-1">把整個故事一次打完或貼上，AI 會幫你分成 6 段，你再確認、修改即可。</p>
          </button>
        </div>
        <div className="flex justify-start">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
        </div>
      </div>
    );
  }

  if (step === 'freeform') {
    return (
      <div className="space-y-4" data-testid="story-compose-freeform">
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5">
          <h3 className="text-lg font-serif text-petal-ink mb-1">一次寫完你的故事</h3>
          <p className="text-sm text-petal-ink-soft mb-3">
            不用管順序，把發生的事、當時的感受、你們怎麼走過來，一次寫完或貼上。AI 會幫你分成 6 段，你再確認修改。
          </p>
          <textarea
            data-testid="story-freeform-input"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="例如：我們交往三年，那天他遲到四十分鐘還先怪我生氣，我覺得很受傷，冷戰了兩天，後來他先傳訊息說知道讓我等很久⋯現在我們約好遲到先講、見面先抱。"
            rows={10}
            maxLength={6000}
            className="w-full p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="flex justify-between text-xs text-petal-muted mt-1">
            <span>{error && <span className="text-red-500">{error}</span>}</span>
            <span>{freeText.length} / 6000</span>
          </div>
        </div>
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => { setError(null); setStep('intro'); }}
            disabled={structuring}
            className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <button
            type="button"
            data-testid="story-freeform-structure"
            onClick={runStructure}
            disabled={structuring}
            className="px-5 py-2 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2 disabled:opacity-50"
          >
            {structuring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI 幫我分段
          </button>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="space-y-4" data-testid="story-compose-review">
        <div className="bg-petal-sage/10 border border-petal-sage rounded-2xl p-4 flex gap-3 items-start">
          <Sparkles className="w-5 h-5 text-petal-sage-deep flex-shrink-0 mt-0.5" />
          <p className="text-sm text-petal-ink-soft leading-relaxed">
            AI 幫你分好 6 段了，讀一遍、有需要就直接改。每段至少 10 個字。
          </p>
        </div>
        {SECTION_STEPS.map((s) => (
          <div key={s.key} className="bg-petal-cream border border-petal-rule rounded-2xl p-4" data-testid={`story-review-${s.key}`}>
            <div className="text-[11px] font-medium text-petal-rose-deep mb-1.5">{s.label}</div>
            <textarea
              value={sections[s.key]}
              onChange={(e) => setSections({ ...sections, [s.key]: e.target.value })}
              rows={3}
              maxLength={2000}
              className="w-full p-2.5 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink focus:outline-none focus:border-petal-rose-deep resize-y"
            />
          </div>
        ))}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => { setError(null); setStep('freeform'); }}
            className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            重寫
          </button>
          <button
            type="button"
            data-testid="story-review-next"
            onClick={reviewToMeta}
            className="px-5 py-2 rounded-full bg-petal-ink text-petal-cream font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2"
          >
            下一步
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (typeof step === 'number') {
    const s = SECTION_STEPS[step];
    return (
      <div className="space-y-4" data-testid={`story-compose-section-${s.key}`}>
        <div className="text-xs text-petal-muted">第 {step + 1} / {SECTION_STEPS.length} 步</div>
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5">
          <h3 className="text-lg font-serif text-petal-ink mb-1">{s.label}</h3>
          <p className="text-sm text-petal-ink-soft mb-3">{s.prompt}</p>
          <textarea
            data-testid="story-section-input"
            value={sections[s.key]}
            onChange={(e) => setSections({ ...sections, [s.key]: e.target.value })}
            placeholder={s.placeholder}
            rows={6}
            maxLength={2000}
            className="w-full p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="flex justify-between text-xs text-petal-muted mt-1">
            <span>{error && <span className="text-red-500">{error}</span>}</span>
            <span>{sections[s.key].length} / 2000</span>
          </div>
        </div>
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => { setError(null); setStep(step === 0 ? 'intro' : step - 1); }}
            className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            上一步
          </button>
          <button
            type="button"
            data-testid="story-section-next"
            onClick={nextFromSection}
            className="px-5 py-2 rounded-full bg-petal-ink text-petal-cream font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2"
          >
            下一步
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (step === 'meta' || step === 'submitting') {
    return (
      <div className="space-y-4" data-testid="story-compose-meta">
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5 space-y-4">
          <div>
            <label className="block text-sm text-petal-ink mb-1.5">給這則故事一個標題</label>
            <input
              data-testid="story-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：車站接送吵架後的修復"
              maxLength={120}
              className="w-full p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
            />
          </div>
          <div>
            <label className="text-sm text-petal-ink mb-1.5 inline-flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-petal-muted" />
              標籤（最多 5 個，以空格或逗號分隔，可留空）
            </label>
            <input
              data-testid="story-tags-input"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="例如：溝通 遲到 冷戰"
              className="w-full p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setStep(metaReturn)}
            disabled={step === 'submitting'}
            className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            上一步
          </button>
          <button
            type="button"
            data-testid="story-submit"
            onClick={submit}
            disabled={step === 'submitting'}
            className="px-5 py-2 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2 disabled:opacity-50"
          >
            {step === 'submitting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            發表故事
          </button>
        </div>
      </div>
    );
  }

  // done
  return (
    <div className="space-y-4" data-testid="story-compose-done">
      <div className="bg-petal-sage/15 border border-petal-sage/40 rounded-2xl p-5 text-center">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-petal-sage-deep" />
        <p className="text-petal-ink font-medium">故事已發表，謝謝你</p>
        <p className="text-xs text-petal-ink-soft mt-1">
          它現在會出現在智慧故事庫中，幫助遇到類似狀況的伴侶。
        </p>
      </div>

      {result?.insights && result.insights.length > 0 ? (
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5" data-testid="story-ai-insights">
          <div className="flex items-center gap-2 mb-3 text-petal-rose-deep">
            <Lightbulb className="w-5 h-5" />
            <h3 className="text-base font-serif text-petal-ink">AI 幫你把故事整理成 3 個重點</h3>
          </div>
          <div className="space-y-3">
            {result.insights.map((i) => (
              <div key={i.title} className="bg-white border border-petal-rule-soft rounded-xl p-3">
                <p className="text-sm font-medium text-petal-ink">{i.title}</p>
                <p className="text-sm text-petal-ink-soft mt-0.5 leading-relaxed">{i.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : result?.aiSkipped ? (
        <div className="bg-petal-cream-2 border border-petal-rule rounded-2xl p-4 text-sm text-petal-ink-soft" data-testid="story-ai-skipped">
          今天的 AI 額度已用完，故事已正常發表；AI 洞察未產生（明天會自動補上額度，升級 Premium 可提高每日上限）。
        </div>
      ) : null}

      <div className="flex justify-center">
        <button
          type="button"
          data-testid="story-view-published"
          onClick={() => result && onDone(result.id)}
          className="px-5 py-2 rounded-full bg-petal-ink text-petal-cream font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
        >
          查看發表的故事
        </button>
      </div>
    </div>
  );
}
