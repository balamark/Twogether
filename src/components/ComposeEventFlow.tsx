import { useState } from 'react';
import { ShieldCheck, Sparkles, ArrowLeft, ArrowRight, Send, Tag, AlertTriangle, Loader2 } from 'lucide-react';
import apiService, {
  type IcebreakerPreview,
  type EventVersionKey,
} from '../services/api';

type Step = 'input' | 'loading' | 'select' | 'submitting';

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface ComposeEventFlowProps {
  onCreated: (eventId: string | null) => void;
  onCancel: () => void;
  showNotification: (n: NotificationInput) => void;
}

const VERSION_META: { key: EventVersionKey; label: string; desc: string; accent: string }[] = [
  {
    key: 'neutral',
    label: '第三方中性旁白版',
    desc: '完全不示弱、不指責，以第三人稱客觀描述事件與情緒。',
    accent: 'border-petal-sage bg-petal-sage/10',
  },
  {
    key: 'firm',
    label: '堅定不攻擊版',
    desc: '說出自己的感受與影響，不指責、不請求、不討好。',
    accent: 'border-petal-rose bg-petal-rose/10',
  },
  {
    key: 'warm',
    label: '善意版',
    desc: '在堅定的基礎上多一句願意聊聊的善意（可選）。',
    accent: 'border-petal-rose-deep bg-petal-cream-2',
  },
];

export default function ComposeEventFlow({ onCreated, onCancel, showNotification }: ComposeEventFlowProps) {
  const [step, setStep] = useState<Step>('input');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<IcebreakerPreview | null>(null);
  const [selected, setSelected] = useState<EventVersionKey | null>('neutral');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitInput = async () => {
    const trimmed = rawText.trim();
    if (trimmed.length < 1) {
      setError('請先寫下你目前的感受');
      return;
    }
    if (trimmed.length > 4000) {
      setError('內容超過 4000 字');
      return;
    }
    setError(null);
    setStep('loading');
    try {
      const p = await apiService.previewIcebreaker(trimmed);
      setPreview(p);
      setStep('select');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 解析失敗';
      setError(msg);
      setStep('input');
    }
  };

  const submitEvent = async () => {
    if (!preview) return;
    setStep('submitting');
    try {
      const event = await apiService.createEvent({
        title: preview.title,
        summary: preview.summary,
        emotions: preview.emotions,
        tags: preview.tags,
        toxicityFlags: preview.toxicityFlags,
        versions: preview.versions,
        selectedVersion: isPrivate ? null : selected,
        isPrivate,
      });
      showNotification({
        type: 'success',
        title: '事件已建立',
        message: isPrivate ? '已儲存為私人事件' : '已送出選定版本給對方',
      });
      onCreated(event.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '建立事件失敗';
      setError(msg);
      setStep('select');
    }
  };

  if (step === 'loading') {
    return (
      <div className="bg-petal-cream border border-petal-rule rounded-2xl p-10 text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-petal-rose-deep" />
        <p className="text-petal-ink-soft">AI 正在整理你的感受…</p>
      </div>
    );
  }

  if (step === 'input') {
    return (
      <div className="space-y-4">
        <div className="bg-petal-sage/10 border border-petal-sage rounded-2xl p-4 flex gap-3 items-start">
          <ShieldCheck className="w-5 h-5 text-petal-sage-deep flex-shrink-0 mt-0.5" />
          <p className="text-sm text-petal-ink-soft leading-relaxed">
            你輸入的內容<strong>不會直接傳給對方</strong>，會先由 AI 協助整理。可以罵、可以抱怨、可以很火。
          </p>
        </div>

        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5">
          <label className="block text-sm text-petal-ink mb-2">把你現在的感受寫下來</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="例如：今天早上耳鼻喉科那件事讓我覺得他根本沒在聽我的話…"
            rows={8}
            maxLength={4000}
            className="w-full p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="flex justify-between text-xs text-petal-muted mt-1">
            <span>{error && <span className="text-red-500">{error}</span>}</span>
            <span>{rawText.length} / 4000</span>
          </div>
        </div>

        <div className="flex justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>取消</span>
          </button>
          <button
            type="button"
            onClick={submitInput}
            className="px-5 py-2 rounded-full bg-petal-ink text-petal-cream inline-flex items-center gap-2 disabled:opacity-50"
            disabled={rawText.trim().length === 0}
          >
            <Sparkles className="w-4 h-4" />
            <span>讓 AI 整理</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 'select' or 'submitting'
  if (!preview) return null;

  return (
    <div className="space-y-4">
      <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-lg font-serif text-petal-ink">{preview.title}</h2>
          {preview.toxicityFlags.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              偵測到較強烈用語
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          {preview.emotions.map((e) => (
            <span key={e} className="text-xs px-2 py-0.5 rounded-full bg-petal-rose/20 text-petal-ink">
              {e}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {preview.tags.map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink inline-flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {t}
            </span>
          ))}
        </div>
      </div>

      <h3 className="text-sm text-petal-ink-soft px-1">選一個版本送出（也可以不送出，存為私人事件）</h3>

      <div className="space-y-3">
        {VERSION_META.map((v) => {
          const text = preview.versions[v.key];
          const active = selected === v.key && !isPrivate;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                setSelected(v.key);
                setIsPrivate(false);
              }}
              className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                active ? `${v.accent} ring-2 ring-petal-rose-deep/40` : 'border-petal-rule bg-white hover:bg-petal-cream-2'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="radio"
                  readOnly
                  checked={active}
                  className="accent-petal-rose-deep"
                />
                <span className="text-sm font-medium text-petal-ink">{v.label}</span>
              </div>
              <p className="text-xs text-petal-ink-soft mb-2">{v.desc}</p>
              <p className="text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">{text}</p>
            </button>
          );
        })}
      </div>

      <label className="flex items-start gap-2 px-1 cursor-pointer">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-1 accent-petal-ink"
        />
        <span className="text-sm text-petal-ink-soft">
          也可以不送出（儲存為私人事件，對方看不到）
        </span>
      </label>

      {error && <p className="text-sm text-red-500 px-1">{error}</p>}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => setStep('input')}
          className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>回去修改</span>
        </button>
        <button
          type="button"
          onClick={submitEvent}
          disabled={step === 'submitting'}
          className="px-5 py-2 rounded-full bg-petal-ink text-petal-cream inline-flex items-center gap-2 disabled:opacity-50"
        >
          {step === 'submitting' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span>{isPrivate ? '儲存私人事件' : '送出'}</span>
        </button>
      </div>
    </div>
  );
}
