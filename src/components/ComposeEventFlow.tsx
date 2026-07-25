import { useState } from 'react';
import { ShieldCheck, Sparkles, ArrowLeft, ArrowRight, Send, Tag, AlertTriangle, Loader2, Pencil } from 'lucide-react';
import apiService, {
  type IcebreakerPreview,
  type EventVersionKey,
} from '../services/api';
import { useAiQuota } from '../hooks/useAiQuota';
import AiQuotaHint from './AiQuotaHint';

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
    label: '中性版',
    desc: '用你自己的口吻，平靜、就事論事地說出這件事與感受，作為開場訊息。',
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
  const { quota, refresh: refreshQuota } = useAiQuota();
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<IcebreakerPreview | null>(null);
  const [selected, setSelected] = useState<EventVersionKey | null>('neutral');
  // Per-version editable drafts, initialised from the AI originals. Editing one
  // version never clobbers another, so switching radios preserves edits.
  const [drafts, setDrafts] = useState<Record<EventVersionKey, string> | null>(null);
  // Editable copy of the AI summary — fixable right here, before the event
  // exists (previously only editable after creation).
  const [summaryDraft, setSummaryDraft] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
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
      setDrafts({ ...p.versions });
      setSummaryDraft(p.summary);
      setEditingSummary(false);
      setStep('select');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 解析失敗';
      setError(msg);
      setStep('input');
    } finally {
      refreshQuota();
    }
  };

  const submitEvent = async () => {
    if (!preview) return;
    const summary = summaryDraft.trim();
    if (summary.length === 0) {
      setError('對話簡介不可為空');
      return;
    }
    if (summary.length > 1000) {
      setError('對話簡介超過 1000 字，請縮短後再送出');
      return;
    }
    let openingMessage: string | null = null;
    if (!isPrivate && selected) {
      openingMessage = (drafts?.[selected] ?? preview.versions[selected]).trim();
      if (openingMessage.length === 0) {
        setError('開場訊息不可為空，請輸入內容或改存私人對話');
        return;
      }
      if (openingMessage.length > 2000) {
        setError('開場訊息超過 2000 字，請縮短後再送出');
        return;
      }
    }
    setError(null);
    setStep('submitting');
    try {
      const event = await apiService.createEvent({
        title: preview.title,
        summary,
        emotions: preview.emotions,
        tags: preview.tags,
        toxicityFlags: preview.toxicityFlags,
        versions: preview.versions,
        selectedVersion: isPrivate ? null : selected,
        openingMessage,
        isPrivate,
      });
      // First-success nudge (docs/UX_PLAYBOOK.md P1-3): point at the natural
      // next action once, then stay quiet.
      const firstEvent = !localStorage.getItem('nudgeFirstEventDone');
      if (firstEvent) localStorage.setItem('nudgeFirstEventDone', 'true');
      showNotification({
        type: 'success',
        title: '對話已建立',
        message: isPrivate
          ? '已儲存為私人對話'
          : firstEvent
            ? '已送出給對方。等待回覆時，可以打開對話試試「如何接住TA的情緒」，先練習怎麼回應。'
            : '已送出選定版本給對方',
        duration: firstEvent ? 9000 : undefined,
      });
      onCreated(event.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '建立對話失敗';
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
            <br />
            {/* 書寫原則：說者無心、聽者有意；先寫下來，才有機會把話說對。 */}
            <span className="text-petal-muted">用寫的，你有時間把話說對：急切的話留在草稿裡，不會脫口而出變成傷害。</span>
          </p>
        </div>

        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5">
          <label className="block text-sm text-petal-ink mb-2">把你現在的感受寫下來</label>
          <textarea
            data-testid="compose-raw-input"
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
          <div className="mt-1">
            <AiQuotaHint quota={quota} />
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

        <div className="bg-white border border-petal-rule rounded-xl p-3 mb-3" data-testid="compose-event-summary">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] text-petal-muted">
              對話簡介（雙方都會看到的中性紀錄）
              {summaryDraft.trim() !== preview.summary.trim() && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-petal-rose/20 text-petal-ink">已編輯</span>
              )}
            </div>
            {!editingSummary && (
              <button
                type="button"
                data-testid="compose-summary-edit"
                onClick={() => setEditingSummary(true)}
                title="編輯對話簡介"
                className="p-1 rounded text-petal-muted hover:text-petal-ink"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {editingSummary ? (
            <div>
              <textarea
                data-testid="compose-summary-editor"
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full p-2 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink focus:outline-none focus:border-petal-rose-deep resize-y"
              />
              <div className="flex justify-end items-center gap-2 mt-1">
                <span className="text-xs text-petal-muted mr-auto">{summaryDraft.length} / 1000</span>
                <button
                  type="button"
                  onClick={() => setEditingSummary(false)}
                  className="px-3 py-1 rounded-full bg-petal-ink text-petal-cream text-xs font-medium hover:opacity-90"
                >
                  完成
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">{summaryDraft}</p>
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

      <h3 className="text-sm text-petal-ink-soft px-1">選一個版本送出（也可以不送出，存為私人對話）</h3>

      <div className="space-y-3">
        {VERSION_META.map((v) => {
          const text = preview.versions[v.key];
          const active = selected === v.key && !isPrivate;
          const edited = drafts != null && drafts[v.key].trim() !== text.trim();
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
                {edited && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-petal-rose/20 text-petal-ink inline-flex items-center gap-1">
                    <Pencil className="w-2.5 h-2.5" />
                    已編輯
                  </span>
                )}
              </div>
              <p className="text-xs text-petal-ink-soft mb-2">{v.desc}</p>
              <p className="text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">{text}</p>
            </button>
          );
        })}
      </div>

      {!isPrivate && selected && drafts && (
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-4">
          <label className="flex items-center gap-2 text-sm text-petal-ink mb-2">
            <Pencil className="w-4 h-4 text-petal-rose-deep" />
            送出前可以修改這段訊息
          </label>
          <textarea
            data-testid="compose-opening-editor"
            value={drafts[selected]}
            onChange={(e) => setDrafts({ ...drafts, [selected]: e.target.value })}
            rows={4}
            maxLength={2000}
            className="w-full p-3 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="text-right text-xs text-petal-muted mt-1">{drafts[selected].length} / 2000</div>
        </div>
      )}

      <label className="flex items-start gap-2 px-1 cursor-pointer">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-1 accent-petal-ink"
        />
        <span className="text-sm text-petal-ink-soft">
          也可以不送出（儲存為私人對話，對方看不到）
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
          <span>{isPrivate ? '儲存私人對話' : '送出'}</span>
        </button>
      </div>
    </div>
  );
}
