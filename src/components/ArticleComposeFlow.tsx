import { useRef, useState } from 'react';
import { ArrowLeft, Send, Loader2, ShieldCheck, Link2, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/api';

// 好文分享: share a good article you found — plain text only. No template, no
// AI split; the body is stored verbatim and joins the same 好文 · 故事 list as
// guided stories. Kept deliberately simple: title + body + optional source.

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

const BODY_MIN = 50;
const BODY_MAX = 8000;

export default function ArticleComposeFlow({
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
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceAuthor, setSourceAuthor] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyLen = body.trim().length;

  const submit = async () => {
    if (submitLockRef.current) return; // drop a same-tick second click
    const t = title.trim();
    if (t.length < 4) {
      setError('標題至少需要 4 個字，讓別人一眼看懂這篇在講什麼');
      return;
    }
    if (bodyLen < BODY_MIN) {
      setError(`文章內容至少需要 ${BODY_MIN} 個字（目前 ${bodyLen} 字）`);
      return;
    }
    if (bodyLen > BODY_MAX) {
      setError(`文章內容超過 ${BODY_MAX} 字上限，請精簡或分次分享`);
      return;
    }
    const url = sourceUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setError('原文連結請貼上完整網址（以 http:// 或 https:// 開頭）');
      return;
    }
    setError(null);
    submitLockRef.current = true;
    setSubmitting(true);
    const tags = tagsInput
      .split(/[,，\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 5);
    try {
      const res = await apiService.createArticle({
        title: t,
        body: body.trim(),
        tags,
        sourceUrl: url || undefined,
        sourceAuthor: sourceAuthor.trim() || undefined,
      });
      setDone(true);
      showNotification({ type: 'success', title: '好文已分享', message: '謝謝你把這篇好文分享給其他伴侶' });
      onDone(res.story.id);
    } catch (err) {
      const e = err as { message?: string; error_code?: string };
      if (e.error_code === 'ARTICLE_DAILY_LIMIT') {
        showNotification({
          type: 'warning',
          title: '今天分享的好文已達上限',
          message: e.message || '明天再回來分享吧',
        });
        setError(e.message || null);
      } else {
        setError(e.message || '分享失敗，請稍後再試');
      }
      setSubmitting(false);
    } finally {
      submitLockRef.current = false;
    }
  };

  if (done) {
    return (
      <div className="py-10 text-center" data-testid="article-compose-done">
        <CheckCircle2 className="w-10 h-10 mx-auto text-petal-sage-deep mb-3" />
        <p className="text-petal-ink font-medium">好文已分享，謝謝你</p>
        <p className="text-xs text-petal-ink-soft mt-1">它現在會出現在「好文 · 故事」中，幫助其他伴侶。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="article-compose">
      <div className="bg-petal-sage/10 border border-petal-sage rounded-2xl p-4 flex gap-3 items-start">
        <ShieldCheck className="w-5 h-5 text-petal-sage-deep flex-shrink-0 mt-0.5" />
        <div className="text-sm text-petal-ink-soft leading-relaxed">
          <p>看到一篇對關係有幫助的好文章？把它分享出來，讓其他伴侶也能讀到。純文字貼上即可。</p>
          <p className="mt-1.5">
            將以<strong className="text-petal-ink">{showNickname ? '你的暱稱' : '匿名'}</strong>分享
            （可在「設定」的公開分享選項調整）。
          </p>
          <p className="mt-1.5 text-xs text-petal-muted">
            請尊重原作者：分享時附上出處，若為轉載請確認你有權分享。
          </p>
        </div>
      </div>

      <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-petal-rose-deep mb-1.5">標題</label>
          <input
            data-testid="article-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="這篇文章在講什麼？"
            maxLength={120}
            className="w-full p-2.5 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-petal-rose-deep mb-1.5">文章內容（純文字）</label>
          <textarea
            data-testid="article-body-input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="把文章內容貼上或打在這裡。段落之間空一行會更好讀。"
            rows={12}
            maxLength={BODY_MAX}
            className="w-full p-3 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y leading-relaxed"
          />
          <div className="flex justify-end text-xs text-petal-muted mt-1">
            <span>{bodyLen} / {BODY_MAX}</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-petal-muted mb-1.5 inline-flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" /> 原文連結（選填）
            </label>
            <input
              data-testid="article-source-url-input"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              maxLength={500}
              className="w-full p-2.5 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-petal-muted mb-1.5">原作者／出處（選填）</label>
            <input
              data-testid="article-source-author-input"
              value={sourceAuthor}
              onChange={(e) => setSourceAuthor(e.target.value)}
              placeholder="例如：某某心理師"
              maxLength={120}
              className="w-full p-2.5 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-petal-muted mb-1.5">標籤（選填，最多 5 個，用逗號分隔）</label>
          <input
            data-testid="article-tags-input"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例如：溝通, 界線, 修復"
            className="w-full p-2.5 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
          />
        </div>

        {error && <p className="text-sm text-red-500" data-testid="article-error">{error}</p>}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <button
          type="button"
          data-testid="article-submit"
          onClick={submit}
          disabled={submitting}
          className="px-5 py-2 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          分享好文
        </button>
      </div>
    </div>
  );
}
