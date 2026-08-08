import { useEffect, useState } from 'react';
import { ArrowLeft, ThumbsUp, HeartHandshake, Wrench, Lightbulb, Send, Loader2, Flag, Eye, Link as LinkIcon } from 'lucide-react';
import { apiService, type StoryDetailData, type StoryVoteType } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatRelativeOrDate } from '../utils/datetime';

// Single story page: labeled template sections, AI insight card, three vote
// pills, cross-couple comments, report. Publicly readable; write actions
// prompt sign-in when logged out.

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

const SECTION_LABELS: { key: keyof StoryDetailData['sections']; label: string }[] = [
  { key: 'context', label: '背景' },
  { key: 'happened', label: '發生了什麼' },
  { key: 'impact', label: '情緒衝擊' },
  { key: 'tried', label: '我們試過什麼' },
  { key: 'repair', label: '轉捩點與修復' },
  { key: 'now', label: '現在的我們' },
];

const VOTE_META: { type: StoryVoteType; label: string; icon: typeof ThumbsUp }[] = [
  { type: 'helpful', label: '有幫助', icon: ThumbsUp },
  { type: 'resonate', label: '有共鳴', icon: HeartHandshake },
  { type: 'repair_worked', label: '修復有效', icon: Wrench },
];

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'inappropriate', label: '不當內容' },
  { value: 'spam', label: '垃圾訊息' },
  { value: 'privacy', label: '洩露隱私' },
  { value: 'other', label: '其他' },
];

export default function StoryDetail({
  storyId,
  isAuthenticated,
  onBack,
  onRequireLogin,
  showNotification,
}: {
  storyId: string;
  isAuthenticated: boolean;
  onBack: () => void;
  onRequireLogin: () => void;
  showNotification: (n: NotificationInput) => void;
}) {
  const [story, setStory] = useState<StoryDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [voting, setVoting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const tz = useTimezone();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiService
      .getStory(storyId)
      .then((s) => { if (!cancelled) setStory(s); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : '無法載入故事'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storyId]);

  const requireLogin = () => {
    showNotification({ type: 'info', title: '請先登入', message: '登入後就能投票、留言，讓作者知道這則故事幫到了你' });
    onRequireLogin();
  };

  const vote = async (type: StoryVoteType) => {
    if (!isAuthenticated) return requireLogin();
    if (!story || voting) return;
    if (story.isMine) {
      showNotification({ type: 'info', title: '這是你的故事', message: '不能為自己的故事投票，把機會留給被你幫助的人' });
      return;
    }
    // Optimistic (playbook §R7): flip the vote and its count instantly, then
    // reconcile with the server's authoritative counts; roll back on failure.
    const prev = story;
    const alreadyVoted = story.myVotes.includes(type);
    setStory({
      ...story,
      votes: { ...story.votes, [type]: Math.max(0, (story.votes[type] ?? 0) + (alreadyVoted ? -1 : 1)) },
      myVotes: alreadyVoted ? story.myVotes.filter((v) => v !== type) : [...story.myVotes, type],
    });
    setVoting(true);
    try {
      const res = await apiService.voteStory(story.id, type);
      setStory((cur) => {
        if (!cur) return cur;
        const base = cur.myVotes.filter((v) => v !== type);
        return {
          ...cur,
          votes: res.counts,
          myVotes: res.voted ? [...base, type] : base,
        };
      });
    } catch (err) {
      setStory(prev);
      showNotification({ type: 'error', title: '投票失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setVoting(false);
    }
  };

  const sendComment = async () => {
    if (!isAuthenticated) return requireLogin();
    const body = comment.trim();
    if (!body || !story) return;
    setSending(true);
    try {
      const c = await apiService.commentStory(story.id, body);
      setStory({ ...story, comments: [...story.comments, c] });
      setComment('');
    } catch (err) {
      showNotification({ type: 'error', title: '留言失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSending(false);
    }
  };

  const report = async (reason: string) => {
    if (!isAuthenticated) return requireLogin();
    if (!story) return;
    setReporting(true);
    try {
      await apiService.reportStory(story.id, reason);
      showNotification({ type: 'success', title: '已收到你的檢舉', message: '我們會盡快處理，謝謝你維護這個空間' });
      setReportOpen(false);
    } catch (err) {
      showNotification({ type: 'error', title: '檢舉失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-petal-rose-deep" /></div>;
  }
  if (error || !story) {
    return (
      <div className="py-10 text-center text-petal-ink-soft">
        <p className="text-sm">{error || '找不到這則故事'}</p>
        <button type="button" onClick={onBack} className="mt-3 px-4 py-2 rounded-full border border-petal-rule text-sm text-petal-ink hover:bg-petal-sage/20">
          回到故事列表
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="story-detail">
      <button
        type="button"
        data-testid="story-back"
        onClick={onBack}
        className="text-sm text-petal-ink-soft hover:text-petal-ink inline-flex items-center gap-1.5"
      >
        <ArrowLeft className="w-4 h-4" />
        回到故事列表
      </button>

      <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5">
        <h2 className="text-xl font-serif text-petal-ink leading-snug">{story.title}</h2>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-petal-muted">
          <span>{story.authorName}</span>
          <span>{formatRelativeOrDate(story.createdAt, tz, { month: 'short', day: 'numeric' })}</span>
          <span className="inline-flex items-center gap-0.5"><Eye className="w-3 h-3" />已被閱讀 {story.viewCount} 次</span>
          {story.tags.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink">{t}</span>
          ))}
        </div>
      </div>

      {/* Article body (kind='article') vs guided template sections (kind='story') */}
      {story.kind === 'article' ? (
        <div className="bg-white border border-petal-rule-soft rounded-2xl p-5" data-testid="article-body">
          {(story.sourceUrl || story.sourceAuthor) && (
            <div className="mb-3 pb-3 border-b border-petal-rule-soft text-xs text-petal-muted flex flex-wrap items-center gap-x-3 gap-y-1">
              {story.sourceAuthor && <span>原作者／出處：{story.sourceAuthor}</span>}
              {story.sourceUrl && (
                <a
                  href={story.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-petal-rose-deep hover:underline"
                >
                  <LinkIcon className="w-3 h-3" /> 原文連結
                </a>
              )}
            </div>
          )}
          <p className="text-[15px] text-petal-ink leading-loose whitespace-pre-wrap">{story.body}</p>
          <p className="mt-4 pt-3 border-t border-petal-rule-soft text-[11px] text-petal-muted">
            由 {story.authorName} 分享。內容版權屬原作者所有。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {SECTION_LABELS.map((s) => (
            <div key={s.key} className="bg-white border border-petal-rule-soft rounded-2xl p-4">
              <div className="text-[11px] font-medium text-petal-rose-deep mb-1.5">{s.label}</div>
              <p className="text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">{story.sections[s.key]}</p>
            </div>
          ))}
        </div>
      )}

      {/* AI insights */}
      {story.aiInsights && story.aiInsights.insights.length > 0 && (
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-5" data-testid="story-detail-insights">
          <div className="flex items-center gap-2 mb-3 text-petal-rose-deep">
            <Lightbulb className="w-5 h-5" />
            <h3 className="text-base font-serif text-petal-ink">AI 重點整理</h3>
          </div>
          <div className="space-y-3">
            {story.aiInsights.insights.map((i) => (
              <div key={i.title} className="bg-white border border-petal-rule-soft rounded-xl p-3">
                <p className="text-sm font-medium text-petal-ink">{i.title}</p>
                <p className="text-sm text-petal-ink-soft mt-0.5 leading-relaxed">{i.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Votes */}
      <div className="flex flex-wrap gap-2" data-testid="story-votes">
        {VOTE_META.map((v) => {
          const active = story.myVotes.includes(v.type);
          const Icon = v.icon;
          return (
            <button
              key={v.type}
              type="button"
              data-testid={`story-vote-${v.type}`}
              onClick={() => vote(v.type)}
              disabled={voting}
              className={`px-4 py-2 rounded-full text-sm font-medium inline-flex items-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50 ${
                active
                  ? 'bg-petal-rose-deep text-white shadow-sm'
                  : 'border border-petal-rule text-petal-ink hover:border-petal-rose-deep'
              }`}
            >
              <Icon className="w-4 h-4" />
              {v.label} {story.votes[v.type]}
            </button>
          );
        })}
      </div>

      {/* Comments */}
      <div className="bg-petal-cream border border-petal-rule rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-petal-ink">留言（{story.comments.length}）</h3>
        {story.comments.length === 0 && (
          <p className="text-xs text-petal-ink-soft">還沒有留言。說說這則故事哪裡幫到了你，作者會收到通知。</p>
        )}
        {story.comments.map((c) => (
          <div key={c.id} className="bg-white border border-petal-rule-soft rounded-xl p-3">
            <div className="flex items-center gap-2 text-[11px] text-petal-muted">
              <span className="font-medium text-petal-ink-soft">{c.authorName}</span>
              <span>{formatRelativeOrDate(c.createdAt, tz, { month: 'short', day: 'numeric' })}</span>
            </div>
            <p className="text-sm text-petal-ink mt-1 leading-relaxed whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            data-testid="story-comment-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="這則故事哪裡幫到了你？"
            maxLength={1000}
            className="flex-1 p-2.5 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
          />
          <button
            type="button"
            data-testid="story-comment-send"
            onClick={sendComment}
            disabled={sending || comment.trim().length === 0}
            className="px-4 py-2 rounded-full bg-petal-ink text-petal-cream text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-1.5 disabled:opacity-40 disabled:shadow-none"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            送出
          </button>
        </div>
      </div>

      {/* Report */}
      <div className="text-right">
        {reportOpen ? (
          <div className="inline-flex flex-wrap items-center gap-1.5 text-xs" data-testid="story-report-reasons">
            <span className="text-petal-muted">檢舉原因：</span>
            {REPORT_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                disabled={reporting}
                onClick={() => report(r.value)}
                className="px-2.5 py-1 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-rose/10 disabled:opacity-50"
              >
                {r.label}
              </button>
            ))}
            <button type="button" onClick={() => setReportOpen(false)} className="px-2 py-1 text-petal-muted hover:text-petal-ink">
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="story-report"
            onClick={() => setReportOpen(true)}
            className="text-[11px] text-petal-muted hover:text-petal-ink inline-flex items-center gap-1"
          >
            <Flag className="w-3 h-3" />
            檢舉這則故事
          </button>
        )}
      </div>
    </div>
  );
}
