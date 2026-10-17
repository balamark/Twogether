import React, { useCallback, useEffect, useState } from 'react';
import { X, Heart, Award, Languages, Star, ExternalLink, CalendarCheck, ShieldCheck } from 'lucide-react';
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
import { tr } from '../i18n/tr';

const LANGUAGE_LABEL: Record<string, string> = { zh: tr('中文', 'Chinese'), en: 'English', ja: tr('日本語', 'Japanese'), ko: '한국어' };
const languageLabel = (c: string) => LANGUAGE_LABEL[c] || c;

// A titled section that renders nothing when empty, so a sparse profile stays clean.
const Section: React.FC<{ title: string; children: React.ReactNode; show?: boolean }> = ({ title, children, show = true }) =>
  show ? (
    <section className="px-5 sm:px-6 py-4 border-t border-petal-rule">
      <h4 className="font-display text-base text-pink-700 mb-2">{tr('【', '')}{title}{tr('】', '')}</h4>
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
        aria-label={tr(`${n} 星`, `${n} star${n === 1 ? '' : 's'}`)}
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
  // Called after this therapist is set as the couple's dedicated therapist, so
  // the parent can refresh its 專屬心理師 panel.
  onDedicated?: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const TherapistProfileModal: React.FC<TherapistProfileModalProps> = ({ therapist: t, isAuthenticated, onClose, onBook, onDedicated, showNotification }) => {
  useScrollLock(true);
  const [reviews, setReviews] = useState<TherapistReviewsResult | null>(null);
  const [canComment, setCanComment] = useState(false);
  const [settingDedicated, setSettingDedicated] = useState(false);

  const setAsDedicated = async () => {
    try {
      setSettingDedicated(true);
      await apiService.setDedicatedTherapist(t.id, canComment);
      showNotification({
        type: 'success',
        title: tr('已設為專屬心理師', 'Set as your dedicated therapist'),
        message: tr(`${t.displayName} 現在可以檢視你們的牆與好好說話${canComment ? '，並可留言' : ''}`, `${t.displayName} can now view your wall and conversations${canComment ? ', and can comment' : ''}`),
        duration: 3800,
      });
      onDedicated?.();
      onClose();
    } catch (err) {
      const e = err as { error_code?: string; message?: string };
      const isNoCouple = e?.error_code === 'NO_COUPLE';
      const message = isNoCouple
        ? tr('請先和另一半配對，才能指定專屬心理師', 'Please pair with your partner before choosing a dedicated therapist')
        : e?.error_code === 'THERAPIST_NOT_AVAILABLE'
          ? tr('這位心理師目前無法被指定為專屬', 'This therapist can\'t be chosen as a dedicated therapist right now')
          : (e?.message || tr('請稍後再試', 'Please try again in a moment'));
      showNotification({ type: isNoCouple ? 'warning' : 'error', title: tr('無法設定', 'Couldn\'t set'), message, duration: 4000 });
    } finally {
      setSettingDedicated(false);
    }
  };

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
          <h3 className="font-display text-xl font-medium text-petal-ink">{tr('諮商師檔案', 'Counselor profile')}</h3>
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label={tr("關閉", 'Close')}>
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
                <span className="inline-flex items-center gap-1"><Award className="w-3 h-3" strokeWidth={1.5} /> {t.yearsExperience} {tr('年資歷', ' years of experience')}</span>
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
                <span className="font-body text-xs text-petal-ink-soft">{reviews.summary.avgRating} · {reviews.summary.count} {tr('則評價', ' reviews')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Booking bar */}
        <div className="px-5 sm:px-6 pb-4 flex items-center justify-between gap-3">
          <div className="font-body text-sm text-petal-ink">
            <span className="font-display text-lg text-pink-600">{formatNtd(t.rateTwd)}</span>
            <span className="text-petal-muted text-xs"> / {t.sessionMinutes} {tr('分鐘', ' min')}</span>
          </div>
          {t.acceptingNewClients === false ? (
            <span className="font-body text-xs text-petal-muted px-3 py-2 rounded-full border border-petal-rule">{tr('暫不開放新案預約', 'Not taking new clients right now')}</span>
          ) : (
            <button
              onClick={onBook}
              data-testid="profile-book-button"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors font-body text-[13px] font-medium"
            >
              <CalendarCheck className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('預約諮詢', 'Book a session')}
            </button>
          )}
        </div>

        {/* 設為專屬心理師 — grant this therapist read (and optionally comment)
            access to the couple's wall + 好好說話. Takes effect immediately and
            can be revoked any time from the 心理諮商 tab. */}
        {isAuthenticated && (
          <div className="mx-5 sm:mx-6 mb-4 rounded-lg border border-pink-200 bg-pink-50/60 p-4" data-testid="set-dedicated-section">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-pink-500 shrink-0 mt-0.5" strokeWidth={1.5} />
              <div className="min-w-0">
                <div className="font-body text-sm font-medium text-petal-ink">{tr('設為我們的專屬心理師', 'Make them our dedicated therapist')}</div>
                <p className="mt-0.5 font-body text-xs text-petal-ink-soft leading-relaxed">
                  {tr('設定後，這位心理師可以唯讀檢視你們的', 'Once set, this therapist can view (read-only) your ')}<strong>{tr('牆', 'wall')}</strong>{tr('與', ' and ')}<strong>{tr('好好說話', 'Talk it through')}</strong>
                  {tr('（不含私密內容），隨時可解除。', ' (excluding private content). You can remove them any time.')}
                </p>
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 font-body text-xs text-petal-ink-soft cursor-pointer">
              <input
                type="checkbox"
                checked={canComment}
                onChange={(e) => setCanComment(e.target.checked)}
                data-testid="set-dedicated-cancomment"
                className="rounded border-petal-rule text-pink-500 focus:ring-pink-400"
              />
              {tr('同時允許此心理師在牆與好好說話留言', 'Also allow this therapist to comment on your wall and conversations')}
            </label>
            <button
              onClick={setAsDedicated}
              disabled={settingDedicated}
              data-testid="set-dedicated-button"
              className="mt-3 w-full py-2 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50 transition-colors font-body text-[13px] font-medium"
            >
              {settingDedicated ? tr('設定中…', 'Setting…') : tr('設為專屬心理師', 'Set as dedicated therapist')}
            </button>
          </div>
        )}

        {/* Rich sections */}
        <Section title={tr("給來談者的一段話", 'A note to clients')} show={!!t.introMessage}><TextBlock text={t.introMessage} /></Section>
        <Section title={tr("自我介紹", 'About me')} show={!!t.bio}><TextBlock text={t.bio} /></Section>
        <Section title={tr("心理師證照", 'License')} show={!!(t.certifications && t.certifications.length)}><BulletList items={t.certifications} /></Section>
        <Section title={tr("治療取向／治療理念", 'Approach / philosophy')} show={!!t.approach}><TextBlock text={t.approach} /></Section>
        <Section title={tr("認識治療師", 'Getting to know the therapist')} show={!!t.about}><TextBlock text={t.about} /></Section>
        <Section title={tr("現任", 'Current position')} show={!!(t.currentPositions && t.currentPositions.length)}><BulletList items={t.currentPositions} /></Section>
        <Section title={tr("專業資格", 'Qualifications')} show={!!(t.qualifications && t.qualifications.length)}><BulletList items={t.qualifications} /></Section>
        <Section title={tr("專業訓練", 'Training')} show={!!(t.training && t.training.length)}><BulletList items={t.training} /></Section>
        <Section title={tr("心理專業著作", 'Publications')} show={!!(t.publications && t.publications.length)}><LinkList items={t.publications} /></Section>
        <Section title={tr("心理專業文章", 'Articles')} show={!!(t.articles && t.articles.length)}><LinkList items={t.articles} /></Section>

        {!hasAnyRichSection && !t.bio && (
          <div className="px-5 sm:px-6 py-4 border-t border-petal-rule">
            <p className="font-body text-sm text-petal-muted">{tr('這位諮商師尚未填寫詳細介紹。', 'This counselor hasn\'t written a detailed profile yet.')}</p>
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
      showNotification({ type: 'success', title: tr('已送出評價', 'Review submitted'), message: res.message, duration: 4000 });
      onSubmitted();
    } catch (err) {
      showNotification({ type: 'error', title: tr('送出失敗', 'Couldn\'t submit'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="px-5 sm:px-6 py-5 border-t border-petal-rule bg-petal-cream-2/40" data-testid="reviews-section">
      <h4 className="font-display text-base text-pink-700 mb-3">{tr('客戶評價', 'Client reviews')}</h4>

      {reviews && reviews.reviews.length > 0 ? (
        <div className="space-y-3">{reviews.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}</div>
      ) : (
        <p className="font-body text-sm text-petal-muted">{tr('還沒有評價。', 'No reviews yet.')}</p>
      )}

      {/* Submission */}
      <div className="mt-4">
        {!isAuthenticated ? (
          <p className="font-body text-xs text-petal-muted">{tr('登入並與這位諮商師預約過後，就能留下評價。', 'Sign in and book with this counselor to leave a review.')}</p>
        ) : done || (reviews && reviews.alreadyReviewed) ? (
          <p className="font-body text-xs text-petal-sage-deep">{tr('你已留下評價，審核通過後會公開顯示。謝謝你！', 'You\'ve left a review. It\'ll appear publicly once approved. Thank you!')}</p>
        ) : reviews && reviews.canReview ? (
          <div className="rounded-md border border-petal-rule bg-petal-cream p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="font-body text-xs text-petal-ink-soft">{tr('給個評分（選填）', 'Give a rating (optional)')}</span>
              <Stars value={rating} onChange={setRating} />
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder={tr("分享你的諮商經驗，幫助其他人選擇…", 'Share your counseling experience to help others choose…')}
              data-testid="review-input"
              className="w-full px-3 py-2 rounded-md border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink resize-y"
            />
            <div className="flex items-center justify-between">
              <span className="font-body text-[11px] text-petal-muted">{tr('送出後會匿名顯示（例如「林O儀」），並經審核後公開。', 'It\'s shown anonymously (e.g. "Lin O-Yi") and published after review.')}</span>
              <button
                onClick={submit}
                disabled={submitting || !body.trim()}
                data-testid="review-submit"
                className="px-4 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-40 font-body text-xs font-medium"
              >
                {tr('送出評價', 'Submit review')}
              </button>
            </div>
          </div>
        ) : (
          <p className="font-body text-xs text-petal-muted">{tr('與這位諮商師預約過後，就能留下評價。', 'You can leave a review after booking with this counselor.')}</p>
        )}
      </div>
    </section>
  );
};

export default TherapistProfileModal;
