import React, { useEffect, useState } from 'react';
import { Star, Send, CheckCircle2, Clock, EyeOff } from 'lucide-react';
import { apiService } from '../services/api';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../content/supportContact';
import { tr } from '../i18n/tr';

interface AuthState {
  isAuthenticated: boolean;
  user: { id: string; nickname?: string; email?: string } | null;
  partnerConnected: boolean;
}

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface FeedbackViewProps {
  authState: AuthState;
  showNotification: (notification: NotificationInput) => void;
  setShowAuthModal: (show: boolean) => void;
}

interface MyFeedback {
  id: string;
  name: string;
  rating: number;
  content: string;
  status: string;
}

const STATUS_META: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
  pending: { label: tr('審核中', 'Under review'), cls: 'text-petal-rose-deep', Icon: Clock },
  approved: { label: tr('已顯示在首頁', 'Shown on the home page'), cls: 'text-petal-sage-deep', Icon: CheckCircle2 },
  hidden: { label: tr('未公開', 'Not public'), cls: 'text-petal-muted', Icon: EyeOff },
};

const MAX_LEN = 2000;

const FeedbackView: React.FC<FeedbackViewProps> = ({ authState, showNotification, setShowAuthModal }) => {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState('');
  const [displayName, setDisplayName] = useState(authState.user?.nickname || '');
  const [mine, setMine] = useState<MyFeedback[]>([]);

  const loadMine = async () => {
    if (!authState.isAuthenticated) return;
    const items = await apiService.getMyFeedback();
    setMine(items);
  };

  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.isAuthenticated]);

  // Declared before the early return below so the Hook runs on every render.
  const { run: handleSubmit, pending: submitting } = useAsyncAction(async () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      showNotification({ type: 'warning', title: tr('還沒寫內容', 'Nothing written yet'), message: tr('請寫下你的使用心得再送出。', 'Please write about your experience before sending.') });
      return;
    }
    try {
      const res = await apiService.submitFeedback({
        rating,
        body: trimmed,
        displayName: displayName.trim() || undefined,
      });
      showNotification({
        type: 'success',
        title: tr('已送出', 'Sent'),
        message: res.message || tr('感謝你的回饋！審核通過後就會顯示在首頁。', 'Thanks for your feedback! It\'ll appear on the home page once approved.'),
      });
      setBody('');
      setRating(5);
      await loadMine();
    } catch (error: unknown) {
      const err = error as { message?: string };
      showNotification({
        type: 'error',
        title: tr('送出失敗', 'Couldn\'t send'),
        message: err?.message || tr('送出評價失敗，請稍後再試。', 'Couldn\'t send your review. Please try again in a moment.'),
      });
    }
  });

  if (!authState.isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <h2 className="font-display text-2xl text-petal-ink mb-3">{tr('意見回饋', 'Feedback')}</h2>
        <p className="font-body text-sm text-petal-ink-soft mb-6">{tr('登入後即可分享你的使用心得。', 'Sign in to share your experience.')}</p>
        <button
          onClick={() => setShowAuthModal(true)}
          className="bg-petal-ink text-petal-cream px-7 py-3 rounded-md hover:bg-pink-700 transition-colors font-display italic"
        >
          {tr('立即登入 →', 'Sign in now →')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4" data-testid="feedback-view">
      <div className="text-center mb-8">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          {tr('— 意見回饋', '— Feedback')}
        </div>
        <h2 className="font-display text-3xl font-light tracking-tight text-petal-ink mb-2">
          {tr('分享你的', 'Share your ')}<em className="not-italic font-light italic text-pink-600">{tr('使用心得', 'experience')}</em>
        </h2>
        <p className="font-body text-sm text-petal-ink-soft">
          {tr('你的回饋會經過審核，通過後會顯示在首頁「聽聽其他用戶怎麼說」。', 'Your feedback is reviewed, and once approved it appears on the home page under "What users say".')}
        </p>
        <p className="font-body text-sm text-petal-ink-soft mt-1.5" data-testid="feedback-support-email">
          {tr('這裡是公開的使用心得。付款、退費或帳號等私人問題，請來信客服', 'This is for public reviews. For private questions about payments, refunds or your account, email support at ')}{' '}
          <a href={SUPPORT_MAILTO} className="text-pink-600 underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>
          {tr('。', '.')}
        </p>
      </div>

      <div className="bg-petal-cream border border-petal-rule rounded-md p-5 space-y-5">
        {/* Rating */}
        <div>
          <label className="block font-body text-sm text-petal-ink mb-2">{tr('評分', 'Rating')}</label>
          <div className="flex items-center gap-1.5" onMouseLeave={() => setHoverRating(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i)}
                onMouseEnter={() => setHoverRating(i)}
                data-testid={`feedback-star-${i}`}
                aria-label={tr(`${i} 星`, `${i} star${i === 1 ? '' : 's'}`)}
                className="p-0.5"
              >
                <Star
                  className={`w-7 h-7 transition-colors ${
                    i <= (hoverRating || rating) ? 'text-pink-500 fill-pink-500' : 'text-petal-rule'
                  }`}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Display name */}
        <div>
          <label className="block font-body text-sm text-petal-ink mb-2">
            {tr('顯示名稱', 'Display name')} <span className="text-petal-muted text-xs">{tr('(公開顯示，可留暱稱)', ' (shown publicly; a nickname is fine)')}</span>
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            placeholder={authState.user?.nickname || tr('你的名字', 'Your name')}
            data-testid="feedback-name-input"
            className="w-full p-3 rounded-md border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
          />
        </div>

        {/* Body */}
        <div>
          <label className="block font-body text-sm text-petal-ink mb-2">{tr('使用心得', 'Your experience')}</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
            rows={5}
            placeholder={tr("例如：吵架後用 AI 開場白先把話說開，和好快多了…", 'e.g. After a fight, we used the AI opener to talk first and made up so much faster…')}
            data-testid="feedback-body-input"
            className="w-full p-3 rounded-md border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="text-right font-body text-xs text-petal-muted mt-1">
            {body.length} / {MAX_LEN}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          data-testid="feedback-submit-button"
          className="w-full flex items-center justify-center gap-2 bg-petal-ink text-petal-cream py-3 rounded-md hover:bg-pink-700 transition-colors font-display italic disabled:opacity-60"
        >
          <Send className="w-4 h-4" strokeWidth={1.5} />
          {submitting ? tr('送出中…', 'Sending…') : tr('送出回饋', 'Send feedback')}
        </button>
      </div>

      {/* My submissions */}
      {mine.length > 0 && (
        <div className="mt-8">
          <h3 className="font-body text-sm font-medium text-petal-ink mb-3">{tr('我送出的回饋', 'Feedback I\'ve sent')}</h3>
          <div className="space-y-3">
            {mine.map((f) => {
              const meta = STATUS_META[f.status] || STATUS_META.pending;
              const StatusIcon = meta.Icon;
              return (
                <div key={f.id} className="bg-petal-cream border border-petal-rule rounded-md p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${i <= f.rating ? 'text-pink-500 fill-pink-500' : 'text-petal-rule'}`}
                          strokeWidth={1.5}
                        />
                      ))}
                    </div>
                    <span className={`flex items-center gap-1 font-body text-xs ${meta.cls}`}>
                      <StatusIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {meta.label}
                    </span>
                  </div>
                  <p className="font-body text-sm text-petal-ink leading-relaxed">{f.content}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackView;
