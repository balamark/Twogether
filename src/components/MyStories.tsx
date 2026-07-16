import { useEffect, useState } from 'react';
import { Eye, ThumbsUp, MessageCircle, Trash2, Loader2, PenLine, BookOpen, FileText } from 'lucide-react';
import { apiService, type MyStoriesResult } from '../services/api';

// 我的故事: the author's impact dashboard. Visible-impact stats are the core
// contributor incentive (「你的故事已被閱讀 X 次」).

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

export default function MyStories({
  onOpenStory,
  onCompose,
  showNotification,
}: {
  onOpenStory: (id: string) => void;
  onCompose: () => void;
  showNotification: (n: NotificationInput) => void;
}) {
  const [data, setData] = useState<MyStoriesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    apiService
      .getMyStories()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (id: string) => {
    setDeleting(true);
    try {
      await apiService.deleteStory(id);
      showNotification({ type: 'success', title: '已刪除', message: '已從「好文 · 故事」移除' });
      setConfirmDeleteId(null);
      load();
    } catch (err) {
      showNotification({ type: 'error', title: '刪除失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="py-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-petal-rose-deep" /></div>;
  }

  const stories = data?.stories || [];
  const totals = data?.totals || { reads: 0, votes: 0, comments: 0 };

  if (stories.length === 0) {
    return (
      <div className="bg-white border border-petal-rule-soft rounded-2xl p-8 text-center" data-testid="my-stories-empty">
        <PenLine className="w-8 h-8 mx-auto mb-3 text-petal-rose-deep" />
        <p className="text-petal-ink font-medium">你還沒有發表過故事</p>
        <p className="text-xs text-petal-ink-soft mt-1.5 leading-relaxed max-w-sm mx-auto">
          寫下一段你們走過的難關：它會匿名幫助遇到同樣狀況的伴侶，你也會看到它被閱讀、被肯定的次數。
        </p>
        <button
          type="button"
          data-testid="my-stories-compose"
          onClick={onCompose}
          className="mt-4 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
        >
          分享第一則故事
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Impact stats */}
      <div className="bg-petal-cream border border-petal-rule rounded-2xl p-4" data-testid="my-stories-impact">
        <p className="text-sm text-petal-ink">
          你的故事已被閱讀 <strong>{totals.reads}</strong> 次、獲得 <strong>{totals.votes}</strong> 個投票、
          <strong>{totals.comments}</strong> 則留言
        </p>
        <p className="text-[11px] text-petal-muted mt-1">每一次閱讀，都是一對伴侶在你們的經歷裡找方向。</p>
      </div>

      <div className="space-y-2">
        {stories.map((s) => (
          <div key={s.id} className="bg-white border border-petal-rule-soft rounded-2xl p-4" data-testid="my-story-row">
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => onOpenStory(s.id)} className="text-left flex-1">
                <span className="font-medium text-petal-ink hover:text-petal-rose-deep transition">{s.title}</span>
              </button>
              <span
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                  s.kind === 'article' ? 'bg-petal-rose/15 text-petal-rose-deep' : 'bg-petal-sage/20 text-petal-ink'
                }`}
              >
                {s.kind === 'article' ? <FileText className="w-3 h-3" strokeWidth={1.5} /> : <BookOpen className="w-3 h-3" strokeWidth={1.5} />}
                {s.kind === 'article' ? '好文' : '故事'}
              </span>
              {s.status === 'hidden' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">已隱藏</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-petal-muted">
              <span className="inline-flex items-center gap-0.5"><Eye className="w-3 h-3" />{s.viewCount}</span>
              <span className="inline-flex items-center gap-0.5">
                <ThumbsUp className="w-3 h-3" />{s.votes.helpful + s.votes.resonate + s.votes.repair_worked}
              </span>
              <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" />{s.commentCount}</span>
              <span className="ml-auto">
                {confirmDeleteId === s.id ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-petal-ink">確定刪除？</span>
                    <button
                      type="button"
                      data-testid="my-story-delete-confirm"
                      disabled={deleting}
                      onClick={() => remove(s.id)}
                      className="px-2 py-0.5 rounded-full bg-red-600 text-white disabled:opacity-50"
                    >
                      刪除
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-2 py-0.5 text-petal-muted hover:text-petal-ink">
                      取消
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid="my-story-delete"
                    onClick={() => setConfirmDeleteId(s.id)}
                    title="刪除故事"
                    className="p-1 rounded text-petal-muted hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
