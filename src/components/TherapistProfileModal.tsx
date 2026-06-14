import React, { useCallback, useEffect, useState } from 'react';
import { X, Heart, Award, Languages, Star, ExternalLink, CalendarCheck } from 'lucide-react';
import {
  apiService,
  type Therapist,
  type TherapistReview,
  type TherapistReviewsResult,
  type TherapistLinkItem,
} from '../services/api';
import type { Notification } from './ErrorNotification';
import { useScrollLock } from '../hooks/useScrollLock';
import { focusLabel, formatNtd } from './therapistShared';

const LANGUAGE_LABEL: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어' };
const languageLabel = (c: string) => LANGUAGE_LABEL[c] || c;

// A titled section that renders nothing when empty, so a sparse profile stays clean.
const Section: React.FC<{ title: string; children: React.ReactNode; show?: boolean }> = ({ title, children, show = true }) =>
  show ? (
    <section className="px-5 sm:px-6 py-4 border-t border-petal-rule">
      <h4 className="font-display text-base text-pink-700 mb-2">【{title}】</h4>
      {children}
    </section>
  ) : null;

const TextBlock: React.FC<{ text?: string | null }> = ({ text }) =>
  text ? <p className="font-body text-sm text-petal-ink-soft leading-relaxed whitespace-pre-wrap">{text}</p> : null;

const BulletList: React.FC<{ items?: string[] }> = ({ items }) =>
  items && items.length > 0 ? (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="font-body text-sm text-petal-ink-soft leading-relaxed pl-3 relative">
          <span className="absolute left-0 text-petal-rose">·</span>{it}
        </li>
      ))}
    </ul>
  ) : null;

const LinkList: React.FC<{ items?: TherapistLinkItem[] }> = ({ items }) =>
  items && items.length > 0 ? (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const href = it.url || it.source || '';
        return (
          <li key={i} className="font-body text-sm text-petal-ink-soft leading-relaxed pl-3 relative">
            <span className="absolute left-0 text-petal-rose">·</span>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-petal-ink underline underline-offset-2 hover:text-pink-700 inline-flex items-center gap-1">
                {it.title}<ExternalLink className="w-3 h-3 shrink-0" strokeWidth={1.5} />
              </a>
            ) : (
              it.title
            )}
          </li>
        );
      })}
    </ul>
  ) : null;

const Stars: React.FC<{ value: number; onChange?: (v: number) => void }> = ({ value, onChange }) => (
  <div className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        disabled={!onChange}
        onClick={() => onChange?.(n)}
        className={onChange ? 'cursor-pointer' : 'cursor-default'}
        aria-label={`${n} 星`}
      >
        <Star className={`w-4 h-4 ${n <= value ? 'text-pink-500 fill-pink-500' : 'text-petal-rule'}`} strokeWidth={1.5} />
      </button>
    ))}
  </div>
);

interface TherapistProfileModalProps {
  therapist: Therapist;
  isAuthenticated: boolean;
  onClose: () => void;
  onBook: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const TherapistProfileModal: React.FC<TherapistProfileModalProps> = ({ therapist: t, isAuthenticated, onClose, onBook, showNotification }) => {
  useScrollLock(true);
  const [reviews, setReviews] = useState<TherapistReviewsResult | null>(null);

  const loadReviews = useCallback(async () => {
    try {
      setReviews(await apiService.getTherapistReviews(t.id));
    } catch {
      /* non-fatal: profile still shows without reviews */
    }
  }, [t.id]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const hasAnyRichSection = Boolean(
    t.introMessage || t.approach || t.about ||
    (t.certifications && t.certifications.length) ||
    (t.currentPositions && t.currentPositions.length) ||
    (t.qualifications && t.qualifications.length) ||
    (t.training && t.training.length) ||
    (t.publications && t.publications.length) ||
    (t.articles && t.articles.length)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-petal-cream w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-lg border border-petal-rule shadow-petal" data-testid="therapist-profile-modal">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-petal-cream flex items-center justify-between px-5 sm:px-6 py-4 border-b border-petal-rule">
          <h3 className="font-display text-xl font-medium text-petal-ink">諮商師檔案</h3>
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label="關閉">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Top card */}
        <div className="px-5 sm:px-6 py-5 flex gap-4">
          <div className="w-24 h-24 shrink-0 rounded-full overflow-hidden bg-petal-cream-2 border border-petal-rule flex items-center justify-center">
            {t.photoUrl ? (
              <img src={t.photoUrl} alt={t.displayName} className="w-full h-full object-contain" />
            ) : (
              <Heart className="w-10 h-10 text-pink-300" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="font-display text-2xl font-light text-petal-ink">{t.displayName}</h2>
              {t.title && <span className="font-body text-sm text-petal-muted">{t.title}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 font-body text-xs text-petal-ink-soft">
              {typeof t.yearsExperience === 'number' && (
                <span className="inline-flex items-center gap-1"><Award className="w-3 h-3" strokeWidth={1.5} /> {t.yearsExperience} 年資歷</span>
              )}
              {t.languages.length > 0 && (
                <span className="inline-flex items-center gap-1"><Languages className="w-3 h-3" strokeWidth={1.5} /> {t.languages.map(languageLabel).join('・')}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {t.focusAreas.map((a) => (
                <span key={a} className="px-2 py-0.5 rounded-full bg-petal-cream-2 border border-petal-rule font-body text-[11px] text-petal-ink-soft">#{focusLabel(a)}</span>
              ))}
              {(t.customSpecialties || []).map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-pink-50 border border-pink-200 font-body text-[11px] text-pink-700">#{s}</span>
              ))}
            </div>
            {reviews && reviews.summary.count > 0 && reviews.summary.avgRating !== null && (
              <div className="mt-2.5 inline-flex items-center gap-1.5">
                <Stars value={Math.round(reviews.summary.avgRating)} />
                <span className="font-body text-xs text-petal-ink-soft">{reviews.summary.avgRating} · {reviews.summary.count} 則評價</span>
              </div>
            )}
          </div>
        </div>

        {/* Booking bar */}
        <div className="px-5 sm:px-6 pb-4 flex items-center justify-between gap-3">
          <div className="font-body text-sm text-petal-ink">
            <span className="font-display text-lg text-pink-600">{formatNtd(t.rateTwd)}</span>
            <span className="text-petal-muted text-xs"> / {t.sessionMinutes} 分鐘</span>
          </div>
          {t.acceptingNewClients === false ? (
            <span className="font-body text-xs text-petal-muted px-3 py-2 rounded-full border border-petal-rule">暫不開放新案預約</span>
          ) : (
            <button
              onClick={onBook}
              data-testid="profile-book-button"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors font-body text-[13px] font-medium"
            >
              <CalendarCheck className="w-3.5 h-3.5" strokeWidth={1.5} /> 預約諮詢
            </button>
          )}
        </div>

        {/* Rich sections */}
        <Section title="給來談者的一段話" show={!!t.introMessage}><TextBlock text={t.introMessage} /></Section>
        <Section title="自我介紹" show={!!t.bio}><TextBlock text={t.bio} /></Section>
        <Section title="心理師證照" show={!!(t.certifications && t.certifications.length)}><BulletList items={t.certifications} /></Section>
        <Section title="治療取向／治療理念" show={!!t.approach}><TextBlock text={t.approach} /></Section>
        <Section title="認識治療師" show={!!t.about}><TextBlock text={t.about} /></Section>
        <Section title="現任" show={!!(t.currentPositions && t.currentPositions.length)}><BulletList items={t.currentPositions} /></Section>
        <Section title="專業資格" show={!!(t.qualifications && t.qualifications.length)}><BulletList items={t.qualifications} /></Section>
        <Section title="專業訓練" show={!!(t.training && t.training.length)}><BulletList items={t.training} /></Section>
        <Section title="心理專業著作" show={!!(t.publications && t.publications.length)}><LinkList items={t.publications} /></Section>
        <Section title="心理專業文章" show={!!(t.articles && t.articles.length)}><LinkList items={t.articles} /></Section>

        {!hasAnyRichSection && !t.bio && (
          <div className="px-5 sm:px-6 py-4 border-t border-petal-rule">
            <p className="font-body text-sm text-petal-muted">這位諮商師尚未填寫詳細介紹。</p>
          </div>
        )}

        {/* Reviews */}
        <ReviewsSection
          therapistId={t.id}
          isAuthenticated={isAuthenticated}
          reviews={reviews}
          onSubmitted={loadReviews}
          showNotification={showNotification}
        />
      </div>
    </div>
  );
};

// --- Reviews section ------------------------------------------------------

const ReviewCard: React.FC<{ review: TherapistReview }> = ({ review }) => (
  <div className="rounded-md border border-petal-rule p-4" data-testid="review-card">
    <div className="flex items-center justify-between gap-2">
      <span className="font-display text-base text-petal-ink">{review.reviewerDisplay}</span>
      {typeof review.rating === 'number' && <Stars value={review.rating} />}
    </div>
    <p className="mt-1.5 font-body text-sm text-petal-ink-soft leading-relaxed whitespace-pre-wrap">{review.body}</p>
  </div>
);

const ReviewsSection: React.FC<{
  therapistId: string;
  isAuthenticated: boolean;
  reviews: TherapistReviewsResult | null;
  onSubmitted: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ therapistId, isAuthenticated, reviews, onSubmitted, showNotification }) => {
  const [body, setBody] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    try {
      setSubmitting(true);
      const res = await apiService.submitTherapistReview(therapistId, {
        body: body.trim(),
        rating: rating || undefined,
      });
      setDone(true);
      setBody('');
      setRating(0);
      showNotification({ type: 'success', title: '已送出評價', message: res.message, duration: 4000 });
      onSubmitted();
    } catch (err) {
      showNotification({ type: 'error', title: '送出失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="px-5 sm:px-6 py-5 border-t border-petal-rule bg-petal-cream-2/40" data-testid="reviews-section">
      <h4 className="font-display text-base text-pink-700 mb-3">客戶評價</h4>

      {reviews && reviews.reviews.length > 0 ? (
        <div className="space-y-3">{reviews.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}</div>
      ) : (
        <p className="font-body text-sm text-petal-muted">還沒有評價。</p>
      )}

      {/* Submission */}
      <div className="mt-4">
        {!isAuthenticated ? (
          <p className="font-body text-xs text-petal-muted">登入並與這位諮商師預約過後，就能留下評價。</p>
        ) : done || (reviews && reviews.alreadyReviewed) ? (
          <p className="font-body text-xs text-petal-sage-deep">你已留下評價，審核通過後會公開顯示。謝謝你！</p>
        ) : reviews && reviews.canReview ? (
          <div className="rounded-md border border-petal-rule bg-petal-cream p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="font-body text-xs text-petal-ink-soft">給個評分（選填）</span>
              <Stars value={rating} onChange={setRating} />
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="分享你的諮商經驗，幫助其他人選擇…"
              data-testid="review-input"
              className="w-full px-3 py-2 rounded-md border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink resize-y"
            />
            <div className="flex items-center justify-between">
              <span className="font-body text-[11px] text-petal-muted">送出後會匿名顯示（例如「林O儀」），並經審核後公開。</span>
              <button
                onClick={submit}
                disabled={submitting || !body.trim()}
                data-testid="review-submit"
                className="px-4 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-40 font-body text-xs font-medium"
              >
                送出評價
              </button>
            </div>
          </div>
        ) : (
          <p className="font-body text-xs text-petal-muted">與這位諮商師預約過後，就能留下評價。</p>
        )}
      </div>
    </section>
  );
};

export default TherapistProfileModal;
