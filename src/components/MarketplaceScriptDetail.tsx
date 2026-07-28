import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Play, Heart, Flag, Send, Trash2, EyeOff } from 'lucide-react';
import StarRating from './StarRating';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiService } from '../services/api';
import type {
  MarketplaceScriptDetail as MarketplaceScriptDetailType,
  ScriptRatingEntry,
  ScriptReportReason,
} from '../services/api';
import type { Notification } from './ErrorNotification';

interface Props {
  scriptId: string;
  onClose: () => void;
  onPlay: (script: MarketplaceScriptDetailType) => void;
  onToggleFavorite: (scriptId: string) => Promise<void> | void;
  // Author-only: stop sharing this script to the marketplace. When omitted, the
  // unpublish action is hidden.
  onUnpublish?: (scriptId: string) => Promise<void> | void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
  // Display-time parsing (placeholder → nickname substitution). When omitted,
  // the raw content is shown.
  parseContent?: (content: string) => string;
}

const REPORT_REASONS: { value: ScriptReportReason; label: string }[] = [
  { value: 'inappropriate', label: '不當內容' },
  { value: 'spam', label: '垃圾訊息' },
  { value: 'copyright', label: '版權侵權' },
  { value: 'other', label: '其他' },
];

export default function MarketplaceScriptDetail({
  scriptId,
  onClose,
  onPlay,
  onToggleFavorite,
  onUnpublish,
  showNotification,
  parseContent,
}: Props) {
  const [script, setScript] = useState<MarketplaceScriptDetailType | null>(null);
  const [ratings, setRatings] = useState<ScriptRatingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [reportReason, setReportReason] = useState<ScriptReportReason>('inappropriate');
  const [reportDetail, setReportDetail] = useState('');
  const [draftStars, setDraftStars] = useState(0);
  const [draftReview, setDraftReview] = useState('');

  useScrollLock(true);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, list] = await Promise.all([
        apiService.getMarketplaceScript(scriptId),
        apiService.getScriptRatings(scriptId),
      ]);
      setScript(detail);
      setRatings(list);
      if (detail.myRating) {
        setDraftStars(detail.myRating.stars);
        setDraftReview(detail.myRating.reviewText || '');
      }
    } catch (err) {
      showNotification({
        type: 'error',
        title: '載入失敗',
        message: (err as Error)?.message || '無法載入劇本詳情',
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  }, [scriptId, showNotification]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleSubmitRating = async () => {
    if (!script || draftStars < 1) return;
    setSubmitting(true);
    try {
      await apiService.rateScript(scriptId, draftStars, draftReview.trim() || undefined);
      showNotification({
        type: 'success',
        title: '評分已送出',
        message: '感謝你的評分！',
        duration: 3000,
      });
      await loadDetail();
    } catch (err) {
      showNotification({
        type: 'error',
        title: '評分失敗',
        message: (err as Error)?.message || '請稍後再試',
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRating = async () => {
    setSubmitting(true);
    try {
      await apiService.deleteScriptRating(scriptId);
      setDraftStars(0);
      setDraftReview('');
      await loadDetail();
    } catch (err) {
      showNotification({
        type: 'error',
        title: '刪除失敗',
        message: (err as Error)?.message || '請稍後再試',
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const favLockRef = useRef(false);
  const handleFavoriteClick = async () => {
    if (!script) return;
    if (favLockRef.current) return; // ignore rapid re-taps mid-toggle
    favLockRef.current = true;
    try {
      await onToggleFavorite(scriptId);
      // Optimistic-ish: flip flag locally, will reconcile when parent refetches.
      setScript({ ...script, isFavorited: !script.isFavorited });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '收藏失敗',
        message: (err as Error)?.message || '請稍後再試',
        duration: 4000,
      });
    } finally {
      favLockRef.current = false;
    }
  };

  const handleUnpublish = async () => {
    if (!onUnpublish) return;
    setUnpublishing(true);
    try {
      await onUnpublish(scriptId);
      setShowUnpublishConfirm(false);
      showNotification({
        type: 'success',
        title: '已取消發布',
        message: '這個劇本已從創作市集下架，仍保留在你的「自訂劇本」中，隨時可以重新分享。',
        duration: 5000,
      });
      onClose();
    } catch (err) {
      showNotification({
        type: 'error',
        title: '取消發布失敗',
        message: (err as Error)?.message || '請稍後再試',
        duration: 4000,
      });
    } finally {
      setUnpublishing(false);
    }
  };

  const reportLockRef = useRef(false);
  const handleReport = async () => {
    if (reportLockRef.current) return; // one report per open
    reportLockRef.current = true;
    try {
      await apiService.reportScript(scriptId, reportReason, reportDetail.trim() || undefined);
      setShowReport(false);
      setReportDetail('');
      showNotification({
        type: 'success',
        title: '檢舉已送出',
        message: '感謝你的回報，我們會盡快審查。',
        duration: 4000,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '檢舉失敗',
        message: (err as Error)?.message || '請稍後再試',
        duration: 4000,
      });
    } finally {
      reportLockRef.current = false;
    }
  };

  return (
    <div
      data-testid="marketplace-detail-modal"
      className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-petal-cream rounded-md shadow-petal max-w-4xl w-full max-h-[min(90vh,calc(100dvh-80px))] border border-petal-rule overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-petal-cream/95 backdrop-blur-sm flex items-center justify-between px-5 sm:px-8 py-3 border-b border-petal-rule">
          <span className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
            — 創作市集 劇本
          </span>
          <button
            type="button"
            onClick={onClose}
            data-testid="marketplace-detail-close"
            aria-label="關閉"
            className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-petal-cream-2 transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {loading || !script ? (
          <div className="p-12 text-center font-display italic font-light text-petal-muted">
            載入中…
          </div>
        ) : (
          <>
            <div className="px-5 sm:px-8 pt-5 pb-4 border-b border-petal-rule">
              <h3 className="font-display text-xl sm:text-2xl font-light tracking-tight text-petal-ink mb-1">
                {script.title}
              </h3>
              <p className="font-display italic font-light text-sm text-petal-muted mb-3">
                {script.scenario}
              </p>
              {script.location && (
                <p className="font-body text-xs text-petal-muted mt-1">📍 {script.location}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-body text-xs text-petal-ink-soft">
                  by {script.authorName}
                </span>
                <StarRating
                  value={script.avgStars}
                  count={script.ratingCount}
                  showCount
                  size={14}
                />
                {script.tags?.map((tag, i) => (
                  <span key={i} className="font-body text-xs bg-petal-cream-2 px-2 py-0.5 rounded-full text-petal-muted">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="px-5 sm:px-8 py-5">
              <div className="bg-petal-cream-2/40 p-4 sm:p-6 rounded-md border border-petal-rule-soft mb-6">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3 flex items-center">
                  <Play className="w-3.5 h-3.5 mr-1.5 text-petal-rose-deep" strokeWidth={1.5} />
                  劇本對話
                </h4>
                <div className="whitespace-pre-line font-body text-petal-ink leading-relaxed text-base">
                  {parseContent ? parseContent(script.script) : script.script}
                </div>
              </div>

              {!script.isAuthor && (
                <div className="mb-6">
                  <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
                    {script.myRating ? '你的評分' : '寫下你的評分'}
                  </h4>
                  <div className="bg-white border border-petal-rule rounded-md p-4">
                    <div className="flex items-center justify-between mb-3">
                      <StarRating
                        value={draftStars}
                        interactive
                        onChange={setDraftStars}
                        size={22}
                      />
                      {script.myRating && (
                        <button
                          type="button"
                          onClick={handleDeleteRating}
                          disabled={submitting}
                          data-testid="rating-delete-button"
                          className="text-xs text-petal-muted hover:text-petal-rose-deep inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                          刪除
                        </button>
                      )}
                    </div>
                    <textarea
                      value={draftReview}
                      onChange={(e) => setDraftReview(e.target.value)}
                      maxLength={500}
                      data-testid="rating-textarea"
                      placeholder="分享一下感想（選填，最多 500 字）"
                      rows={3}
                      className="w-full px-3 py-2 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-body text-[11px] text-petal-muted">
                        {draftReview.length} / 500
                      </span>
                      <button
                        type="button"
                        onClick={handleSubmitRating}
                        disabled={submitting || draftStars < 1}
                        data-testid="rating-submit-button"
                        className="bg-petal-ink text-petal-cream px-4 py-1.5 rounded-md font-body text-sm hover:bg-pink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {script.myRating ? '更新' : '送出'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
                  評論（{ratings.length}）
                </h4>
                {ratings.length === 0 ? (
                  <p className="font-display italic font-light text-sm text-petal-muted text-center py-4">
                    還沒有評論，成為第一個分享感想的人。
                  </p>
                ) : (
                  <ul className="space-y-3" data-testid="rating-list">
                    {ratings.map((r) => (
                      <li
                        key={r.id}
                        className="bg-white border border-petal-rule rounded-md p-3"
                        data-testid={`rating-entry-${r.id}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-body text-sm font-medium text-petal-ink">
                            {r.authorName}
                          </span>
                          <StarRating value={r.stars} size={12} />
                        </div>
                        {r.reviewText && (
                          <p className="font-body text-sm text-petal-ink-soft whitespace-pre-line leading-relaxed">
                            {r.reviewText}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 px-5 sm:px-8 py-4 border-t border-petal-rule bg-petal-cream/95 backdrop-blur-sm flex flex-col sm:flex-row justify-end gap-2 safe-pb">
              {script.isAuthor && onUnpublish && (
                <button
                  type="button"
                  onClick={() => setShowUnpublishConfirm(true)}
                  data-testid="marketplace-detail-unpublish-button"
                  className="px-4 py-2 border border-petal-rule text-petal-muted hover:border-petal-rose-deep hover:text-petal-rose-deep rounded-md font-body text-sm transition-colors inline-flex items-center gap-1.5 sm:mr-auto"
                >
                  <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                  取消發布
                </button>
              )}
              {!script.isAuthor && (
                <button
                  type="button"
                  onClick={() => setShowReport(true)}
                  data-testid="marketplace-detail-report-button"
                  className="px-4 py-2 border border-petal-rule text-petal-muted hover:border-petal-rose-deep hover:text-petal-rose-deep rounded-md font-body text-sm transition-colors inline-flex items-center gap-1.5"
                >
                  <Flag className="w-3.5 h-3.5" strokeWidth={1.5} />
                  檢舉
                </button>
              )}
              <button
                type="button"
                onClick={handleFavoriteClick}
                data-testid="marketplace-detail-favorite-button"
                className={`px-4 py-2 rounded-md font-body text-sm transition-colors inline-flex items-center gap-1.5 border ${
                  script.isFavorited
                    ? 'bg-petal-rose-soft border-petal-rose-deep text-petal-rose-deep'
                    : 'border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink'
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${script.isFavorited ? 'fill-petal-rose-deep' : ''}`}
                  strokeWidth={1.5}
                />
                {script.isFavorited ? '已收藏' : '收藏'}
              </button>
              <button
                type="button"
                onClick={() => onPlay(script)}
                data-testid="marketplace-detail-play-button"
                className="px-5 py-2 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors inline-flex items-center gap-1.5"
              >
                <Play className="w-4 h-4" strokeWidth={1.5} />
                立刻玩
              </button>
            </div>
          </>
        )}

        {showReport && (
          <div className="fixed inset-0 bg-petal-ink/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowReport(false)}>
            <div className="bg-petal-cream rounded-md shadow-petal max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
              <h4 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-3">
                檢舉這個劇本
              </h4>
              <div className="space-y-2 mb-4">
                {REPORT_REASONS.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="report-reason"
                      checked={reportReason === r.value}
                      onChange={() => setReportReason(r.value)}
                      className="accent-petal-rose-deep"
                    />
                    <span className="font-body text-sm text-petal-ink">{r.label}</span>
                  </label>
                ))}
              </div>
              <textarea
                value={reportDetail}
                onChange={(e) => setReportDetail(e.target.value)}
                maxLength={1000}
                placeholder="補充說明（選填）"
                rows={3}
                data-testid="report-detail-textarea"
                className="w-full px-3 py-2 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowReport(false)}
                  className="px-4 py-2 border border-petal-rule text-petal-ink-soft rounded-md font-body text-sm"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleReport}
                  data-testid="report-submit-button"
                  className="px-4 py-2 bg-petal-rose-deep text-petal-cream rounded-md font-body text-sm hover:bg-pink-700 transition-colors"
                >
                  送出檢舉
                </button>
              </div>
            </div>
          </div>
        )}

        {showUnpublishConfirm && (
          <div className="fixed inset-0 bg-petal-ink/50 flex items-center justify-center z-[60] p-4" onClick={() => !unpublishing && setShowUnpublishConfirm(false)}>
            <div className="bg-petal-cream rounded-md shadow-petal max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
              <h4 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-2">
                取消發布這個劇本？
              </h4>
              <p className="font-body text-sm text-petal-ink-soft mb-4 leading-relaxed">
                下架後其他人將無法在創作市集找到或開始這個劇本。已收藏的人也會看到「作者已停止分享」。劇本仍保留在你的「自訂劇本」中，隨時可以重新分享。
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnpublishConfirm(false)}
                  disabled={unpublishing}
                  className="px-4 py-2 border border-petal-rule text-petal-ink-soft rounded-md font-body text-sm disabled:opacity-40"
                >
                  保持發布
                </button>
                <button
                  type="button"
                  onClick={handleUnpublish}
                  disabled={unpublishing}
                  data-testid="marketplace-detail-unpublish-confirm"
                  className="px-4 py-2 bg-petal-rose-deep text-petal-cream rounded-md font-body text-sm hover:bg-pink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {unpublishing ? '處理中…' : '取消發布'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
