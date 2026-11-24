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
import { tr } from '../i18n/tr';

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
  // Turns on users.show_adult_scripts, then this view reloads the script.
  onEnableAdultScripts?: () => Promise<void> | void;
}

const REPORT_REASONS: { value: ScriptReportReason; label: string }[] = [
  { value: 'inappropriate', label: tr('不當內容', 'Inappropriate content') },
  { value: 'spam', label: tr('垃圾訊息', 'Spam') },
  { value: 'copyright', label: tr('版權侵權', 'Copyright infringement') },
  { value: 'other', label: tr('其他', 'Other') },
];

export default function MarketplaceScriptDetail({
  scriptId,
  onClose,
  onPlay,
  onToggleFavorite,
  onUnpublish,
  showNotification,
  parseContent,
  onEnableAdultScripts,
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
  const [adultHidden, setAdultHidden] = useState(false);
  const [enablingAdult, setEnablingAdult] = useState(false);

  useScrollLock(true);

  // Reading mode: the script text is the point of this view, so the header
  // and the action bar slide away while the reader scrolls down and come
  // back on any scroll up (or at the very end, where the actions belong).
  const [chromeHidden, setChromeHidden] = useState(false);
  const lastScrollRef = useRef(0);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const y = el.scrollTop;
    const delta = y - lastScrollRef.current;
    const nearEnd = el.scrollHeight - el.clientHeight - y < 48;
    if (nearEnd || y < 48) setChromeHidden(false);
    else if (delta > 6) setChromeHidden(true);
    else if (delta < -6) setChromeHidden(false);
    lastScrollRef.current = y;
  };

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setAdultHidden(false);
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
      const code = (err as { error_code?: string }).error_code;
      if (code === 'ADULT_SCRIPTS_HIDDEN') {
        setScript(null);
        setAdultHidden(true);
        return;
      }
      showNotification({
        type: 'error',
        title: tr('載入失敗', 'Couldn\'t load'),
        message: (err as Error)?.message || tr('無法載入劇本詳情', 'Couldn\'t load the script details'),
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
        title: tr('評分已送出', 'Rating submitted'),
        message: tr('感謝你的評分！', 'Thanks for your rating!'),
        duration: 3000,
      });
      await loadDetail();
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('評分失敗', 'Couldn\'t rate'),
        message: (err as Error)?.message || tr('請稍後再試', 'Please try again in a moment'),
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRating = async () => {
    if (!window.confirm(tr('確定要刪除你的評分與評論嗎？刪除後無法復原。', 'Delete your rating and review? This can\'t be undone.'))) return;
    // Optimistic (playbook §R7): clear the draft right after the confirm; the
    // refetch of averages runs in the background instead of holding the button.
    const prevStars = draftStars;
    const prevReview = draftReview;
    setDraftStars(0);
    setDraftReview('');
    setSubmitting(true);
    try {
      await apiService.deleteScriptRating(scriptId);
      void loadDetail();
    } catch (err) {
      setDraftStars(prevStars);
      setDraftReview(prevReview);
      showNotification({
        type: 'error',
        title: tr('刪除失敗', 'Couldn\'t delete'),
        message: (err as Error)?.message || tr('請稍後再試', 'Please try again in a moment'),
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
        title: tr('收藏失敗', 'Couldn\'t save'),
        message: (err as Error)?.message || tr('請稍後再試', 'Please try again in a moment'),
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
        title: tr('已取消發布', 'Unpublished'),
        message: tr('這個劇本已從創作市集下架，仍保留在你的「自訂劇本」中，隨時可以重新分享。', 'This script was removed from the creator marketplace. It\'s still in your "Custom scripts" and you can share it again any time.'),
        duration: 5000,
      });
      onClose();
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('取消發布失敗', 'Couldn\'t unpublish'),
        message: (err as Error)?.message || tr('請稍後再試', 'Please try again in a moment'),
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
        title: tr('檢舉已送出', 'Report sent'),
        message: tr('感謝你的回報，我們會盡快審查。', 'Thanks for letting us know. We\'ll review it as soon as possible.'),
        duration: 4000,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('檢舉失敗', 'Couldn\'t report'),
        message: (err as Error)?.message || tr('請稍後再試', 'Please try again in a moment'),
        duration: 4000,
      });
    } finally {
      reportLockRef.current = false;
    }
  };

  return (
    <div
      data-testid="marketplace-detail-modal"
      className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-stretch sm:items-center justify-center z-50 sm:p-4"
      onClick={onClose}
    >
      {/* Full-screen sheet on phones (every pixel goes to the script text);
          a centred card from sm up. */}
      <div
        className="relative bg-petal-cream sm:rounded-md shadow-petal max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[min(90vh,calc(100dvh-80px))] sm:border border-petal-rule overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
        onScroll={handleScroll}
        data-testid="marketplace-detail-scroller"
      >
        <div
          data-testid="marketplace-detail-header"
          className={`sticky top-0 z-10 bg-petal-cream/95 backdrop-blur-sm border-b border-petal-rule transition-transform duration-200 ${
            chromeHidden ? '-translate-y-full' : 'translate-y-0'
          }`}
        >
          <div className="safe-pt sm:hidden" />
          <div className="flex items-center gap-1 pl-4 pr-2 sm:px-8 py-1.5 sm:py-2">
            <span className="flex-1 min-w-0 truncate font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted">
              {tr('— 創作市集 劇本', '— Creator marketplace script')}
            </span>
            {/* Secondary actions live up here as compact icon buttons so they
                don't eat reading space at the bottom. */}
            {script && !script.isAuthor && (
              <button
                type="button"
                onClick={() => setShowReport(true)}
                data-testid="marketplace-detail-report-button"
                aria-label={tr('檢舉', 'Report')}
                title={tr('檢舉', 'Report')}
                className="h-9 min-w-9 px-2 inline-flex items-center justify-center gap-1.5 rounded-full text-petal-muted hover:bg-petal-cream-2 hover:text-petal-rose-deep font-body text-sm transition-colors"
              >
                <Flag className="w-4 h-4" strokeWidth={1.5} />
                <span className="sr-only sm:not-sr-only">{tr('檢舉', 'Report')}</span>
              </button>
            )}
            {script && (
              <button
                type="button"
                onClick={handleFavoriteClick}
                data-testid="marketplace-detail-favorite-button"
                aria-pressed={script.isFavorited}
                title={script.isFavorited ? tr('已收藏', 'Saved') : tr('收藏', 'Save')}
                className={`h-9 min-w-9 px-2 inline-flex items-center justify-center gap-1.5 rounded-full font-body text-sm transition-colors hover:bg-petal-cream-2 ${
                  script.isFavorited ? 'text-petal-rose-deep' : 'text-petal-ink-soft hover:text-petal-ink'
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${script.isFavorited ? 'fill-petal-rose-deep' : ''}`}
                  strokeWidth={1.5}
                />
                <span className="sr-only sm:not-sr-only">
                  {script.isFavorited ? tr('已收藏', 'Saved') : tr('收藏', 'Save')}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              data-testid="marketplace-detail-close"
              aria-label={tr("關閉", 'Close')}
              className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-petal-cream-2 transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {adultHidden && !loading ? (
          <div className="px-6 sm:px-8 py-16 text-center" data-testid="adult-scripts-hidden">
            <p className="font-display text-xl font-light text-petal-ink">
              {tr('這是 18+ 劇本', 'This is an 18+ script')}
            </p>
            <p className="mt-3 font-body text-sm text-petal-ink-soft leading-relaxed max-w-sm mx-auto">
              {tr(
                '創作市集預設不顯示 18+ 劇本。到右上角的個人選單打開「顯示 18+ 劇本」，或按下面的按鈕，就能看這份劇本。',
                'The creator marketplace hides 18+ scripts unless you opt in. Turn on “Show 18+ scripts” in the profile menu at the top right, or use the button below, to open this one.'
              )}
            </p>
            {onEnableAdultScripts && (
              <button
                type="button"
                data-testid="adult-scripts-enable"
                disabled={enablingAdult}
                onClick={async () => {
                  setEnablingAdult(true);
                  try {
                    await onEnableAdultScripts();
                    await loadDetail();
                  } catch (err) {
                    showNotification({
                      type: 'error',
                      title: tr('無法更新設定', 'Couldn\'t update the setting'),
                      message: (err as Error)?.message || tr('請稍後再試', 'Please try again in a moment'),
                      duration: 5000,
                    });
                  } finally {
                    setEnablingAdult(false);
                  }
                }}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-petal-ink text-white px-5 py-2.5 font-body text-sm hover:bg-pink-700 disabled:opacity-60"
              >
                {enablingAdult ? tr('開啟中…', 'Turning on…') : tr('顯示 18+ 劇本', 'Show 18+ scripts')}
              </button>
            )}
          </div>
        ) : loading || !script ? (
          <div className="p-12 text-center font-display italic font-light text-petal-muted">
            {tr('載入中…', 'Loading…')}
          </div>
        ) : (
          <>
            <div className="px-4 sm:px-8 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-petal-rule">
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

            <div className="px-2 sm:px-8 py-3 sm:py-5">
              <div className="bg-petal-cream-2/40 px-3 py-3 sm:p-6 rounded-md border border-petal-rule-soft mb-6">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2 sm:mb-3 flex items-center">
                  <Play className="w-3.5 h-3.5 mr-1.5 text-petal-rose-deep" strokeWidth={1.5} />
                  {tr('劇本對話', 'Script dialogue')}
                </h4>
                <div className="whitespace-pre-line font-body text-petal-ink leading-relaxed text-base">
                  {parseContent ? parseContent(script.script) : script.script}
                </div>
              </div>

              {!script.isAuthor && (
                <div className="mb-6 px-2 sm:px-0">
                  <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
                    {script.myRating ? tr('你的評分', 'Your rating') : tr('寫下你的評分', 'Write your rating')}
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
                          {tr('刪除', 'Delete')}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={draftReview}
                      onChange={(e) => setDraftReview(e.target.value)}
                      maxLength={500}
                      data-testid="rating-textarea"
                      placeholder={tr("分享一下感想（選填，最多 500 字）", 'Share your thoughts (optional, up to 500 characters)')}
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
                        {script.myRating ? tr('更新', 'Update') : tr('送出', 'Send')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6 px-2 sm:px-0">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
                  {tr('評論（', 'Reviews (')}{ratings.length}{tr('）', ')')}
                </h4>
                {ratings.length === 0 ? (
                  <p className="font-display italic font-light text-sm text-petal-muted text-center py-4">
                    {tr('還沒有評論，成為第一個分享感想的人。', 'No reviews yet. Be the first to share your thoughts.')}
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

            <div
              data-testid="marketplace-detail-actions"
              className={`sticky bottom-0 z-10 px-4 sm:px-8 py-2 sm:py-3 border-t border-petal-rule bg-petal-cream/95 backdrop-blur-sm flex items-center justify-end gap-2 safe-pb transition-transform duration-200 ${
                chromeHidden ? 'translate-y-full' : 'translate-y-0'
              }`}
            >
              {script.isAuthor && onUnpublish && (
                <button
                  type="button"
                  onClick={() => setShowUnpublishConfirm(true)}
                  data-testid="marketplace-detail-unpublish-button"
                  className="px-3 py-2 border border-petal-rule text-petal-muted hover:border-petal-rose-deep hover:text-petal-rose-deep rounded-md font-body text-sm transition-colors inline-flex items-center gap-1.5 mr-auto"
                >
                  <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {tr('取消發布', 'Unpublish')}
                </button>
              )}
              <button
                type="button"
                onClick={() => onPlay(script)}
                data-testid="marketplace-detail-play-button"
                className="flex-1 sm:flex-none justify-center px-5 py-2 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors inline-flex items-center gap-1.5"
              >
                <Play className="w-4 h-4" strokeWidth={1.5} />
                {tr('立刻玩', 'Play now')}
              </button>
            </div>
          </>
        )}

        {showReport && (
          <div className="fixed inset-0 bg-petal-ink/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowReport(false)}>
            <div className="bg-petal-cream rounded-md shadow-petal max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
              <h4 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-3">
                {tr('檢舉這個劇本', 'Report this script')}
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
                placeholder={tr("補充說明（選填）", 'Additional details (optional)')}
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
                  {tr('取消', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleReport}
                  data-testid="report-submit-button"
                  className="px-4 py-2 bg-petal-rose-deep text-petal-cream rounded-md font-body text-sm hover:bg-pink-700 transition-colors"
                >
                  {tr('送出檢舉', 'Send report')}
                </button>
              </div>
            </div>
          </div>
        )}

        {showUnpublishConfirm && (
          <div className="fixed inset-0 bg-petal-ink/50 flex items-center justify-center z-[60] p-4" onClick={() => !unpublishing && setShowUnpublishConfirm(false)}>
            <div className="bg-petal-cream rounded-md shadow-petal max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
              <h4 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-2">
                {tr('取消發布這個劇本？', 'Unpublish this script?')}
              </h4>
              <p className="font-body text-sm text-petal-ink-soft mb-4 leading-relaxed">
                {tr('下架後其他人將無法在創作市集找到或開始這個劇本。已收藏的人也會看到「作者已停止分享」。劇本仍保留在你的「自訂劇本」中，隨時可以重新分享。', 'Once removed, others can\'t find or start this script in the creator marketplace. People who saved it will see "The author stopped sharing". The script stays in your "Custom scripts" and you can share it again any time.')}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnpublishConfirm(false)}
                  disabled={unpublishing}
                  className="px-4 py-2 border border-petal-rule text-petal-ink-soft rounded-md font-body text-sm disabled:opacity-40"
                >
                  {tr('保持發布', 'Keep it published')}
                </button>
                <button
                  type="button"
                  onClick={handleUnpublish}
                  disabled={unpublishing}
                  data-testid="marketplace-detail-unpublish-confirm"
                  className="px-4 py-2 bg-petal-rose-deep text-petal-cream rounded-md font-body text-sm hover:bg-pink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {unpublishing ? tr('處理中…', 'Processing…') : tr('取消發布', 'Unpublish')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
