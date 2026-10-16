import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, X, UserPlus, Clock, Languages, Award, CalendarCheck, MessageCircle, Send, StickyNote, UserCog, Upload, CheckCircle2, AlertCircle, Globe, Video, Wallet } from 'lucide-react';
import {
  apiService,
  type Therapist,
  type TherapistFocusArea,
  type TherapistConsultation,
  type ConsultationThread,
  type ConsultationPublicStatus,
  type MeetingProvider,
  type TherapistEarnings,
  type EventRecord,
  type OwnTherapistProfile,
  type TherapistProfileUpdate,
  type PaymentProvider,
} from '../services/api';
import type { Notification } from './ErrorNotification';
import { useScrollLock } from '../hooks/useScrollLock';
import { FOCUS_AREAS, focusLabel, formatNtd } from './therapistShared';
import { POSITIONING_ONE_LINER, POSITIONING_SUBLINE, NOT_A_SUBSTITUTE } from '../content/positioning';
import PaymentMethodPicker from './PaymentMethodPicker';
import { FocusFilter } from './FocusFilter';
import TherapistProfileModal from './TherapistProfileModal';
import TherapySummaryCard from './TherapySummaryCard';
import TherapyTopicsCard from './TherapyTopicsCard';
import DedicatedTherapistPanel from './DedicatedTherapistPanel';
import TherapistClientsPanel from './TherapistClientsPanel';
import ParticipantAvatar from './ParticipantAvatar';
import { ROLE_STYLE } from '../utils/threadRoles';
import { tr } from '../i18n/tr';

interface TherapistsViewProps {
  authState: {
    user: { id: string; nickname?: string } | null;
    isAuthenticated: boolean;
    partnerConnected: boolean;
  };
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  // 'user' — the couple-facing 心理諮商 directory (browse/book, 諮商摘要, 專屬心理師).
  // 'counselor' — the 諮商師工作台: only the counselor's own tools (我輔導的伴侶,
  // 我的諮商師檔案, 我的收入, 個案諮商室). The two role contexts never mix on one
  // screen; the header switch flips between them. Defaults to 'user'.
  mode?: 'user' | 'counselor';
  // Bumped by a notification deep-link (dedicated_client_added) to jump straight
  // to 我輔導的伴侶 and auto-open the couple that just added this counselor. Each
  // increment is one focus request; ignored outside counselor mode.
  clientsFocusToken?: number;
  // The specific couple to auto-open when clientsFocusToken fires; null → open
  // the most-recent client as a fallback.
  clientsFocusCoupleId?: string | null;
}

const LANGUAGE_LABEL: Record<string, string> = {
  zh: tr('中文', 'Chinese'),
  en: 'English',
  ja: tr('日本語', 'Japanese'),
  ko: '한국어',
};
const languageLabel = (code: string): string => LANGUAGE_LABEL[code] || code;

const CONSULTATION_STATUS: Record<TherapistConsultation['status'], { label: string; cls: string }> = {
  pending: { label: tr('等待回覆', 'Awaiting reply'), cls: 'text-petal-rose-deep' },
  accepted: { label: tr('已接受', 'Accepted'), cls: 'text-petal-sage-deep' },
  declined: { label: tr('已婉拒', 'Declined'), cls: 'text-petal-muted' },
  completed: { label: tr('已完成', 'Completed'), cls: 'text-petal-sage-deep' },
  cancelled: { label: tr('已取消', 'Cancelled'), cls: 'text-petal-muted' },
  no_show: { label: tr('未出席', 'No-show'), cls: 'text-petal-muted' },
};

// 公開問答 publish state → label shown in the chat room / consultation list.
const PUBLIC_STATUS_LABEL: Record<ConsultationPublicStatus, string> = {
  private: tr('私密', 'Private'),
  client_requested: tr('等待對方同意公開', 'Waiting for the other side to agree to publish'),
  therapist_requested: tr('等待對方同意公開', 'Waiting for the other side to agree to publish'),
  published: tr('已公開為公開問答', 'Published as public Q&A'),
  withdrawn: tr('已取消公開', 'Unpublished'),
};

const TherapistsView: React.FC<TherapistsViewProps> = ({ authState, showNotification, mode = 'user', clientsFocusToken = 0, clientsFocusCoupleId = null }) => {
  const isCounselorMode = mode === 'counselor';
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusFilter, setFocusFilter] = useState<TherapistFocusArea | 'all'>('all');

  // Two separate interfaces: the open 公開問答 browse (default — the showcase /
  // funnel) and the 找諮商師 directory where you book a (free) chat.

  const [bookingTarget, setBookingTarget] = useState<Therapist | null>(null);
  const [profileTarget, setProfileTarget] = useState<Therapist | null>(null);
  const [showMine, setShowMine] = useState(false);
  const [chatTarget, setChatTarget] = useState<TherapistConsultation | null>(null);
  const [consultations, setConsultations] = useState<TherapistConsultation[]>([]);
  const [consultationsLoaded, setConsultationsLoaded] = useState(false);

  // The logged-in user's own therapist profile (if they are a therapist), so we
  // can offer a "我的諮商師檔案" editor.
  const [ownProfile, setOwnProfile] = useState<OwnTherapistProfile | null>(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showEarnings, setShowEarnings] = useState(false);
  // Bumped when a therapist is set as dedicated (from a profile modal) so the
  // 你們的專屬心理師 panel re-fetches.
  const [dedicatedKey, setDedicatedKey] = useState(0);

  const loadOwnProfile = useCallback(async () => {
    if (!authState.isAuthenticated) { setOwnProfile(null); return; }
    try {
      setOwnProfile(await apiService.getMyTherapistProfile());
    } catch {
      setOwnProfile(null);
    }
  }, [authState.isAuthenticated]);

  useEffect(() => { loadOwnProfile(); }, [loadOwnProfile]);

  const loadTherapists = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getTherapists(
        focusFilter === 'all' ? undefined : focusFilter
      );
      setTherapists(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('無法取得諮商師列表', 'Couldn\'t load counselors. Please try again in a moment.'));
    } finally {
      setLoading(false);
    }
  }, [focusFilter]);

  useEffect(() => {
    loadTherapists();
  }, [loadTherapists]);

  const loadConsultations = useCallback(async () => {
    if (!authState.isAuthenticated) return;
    try {
      const data = await apiService.getMyConsultations();
      setConsultations(data);
      setConsultationsLoaded(true);
    } catch (err) {
      console.error('Failed to load consultations:', err);
    }
  }, [authState.isAuthenticated]);

  const openMine = () => {
    setShowMine(true);
    if (!consultationsLoaded) loadConsultations();
  };

  // Split the shared consultations list by role so each mode only shows its own
  // side: the couple sees the sessions they booked (client), the counselor sees
  // the sessions where they are the therapist. Keeps the two roles separate.
  const visibleConsultations = useMemo(
    () => consultations.filter((c) => (isCounselorMode ? c.role === 'therapist' : c.role === 'client')),
    [consultations, isCounselorMode]
  );

  const pendingCount = useMemo(
    () => visibleConsultations.filter((c) => c.status === 'pending').length,
    [visibleConsultations]
  );

  return (
    <div className="space-y-8" data-testid="therapists-view">
      {/* Intro — user mode leads with the Therapy Companion positioning (we sit
          beside therapists, not against them; the 167-hours one-liner + honest
          "not a substitute" note come from src/content/positioning.ts). In
          counselor mode this is the 諮商師工作台 header instead. */}
      {isCounselorMode ? (
        <div className="text-center max-w-2xl mx-auto">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            {tr('— 諮商師工作台', '— Counselor desk')}
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
            {tr('你的', 'Your ')} <em className="not-italic italic text-pink-600">{tr('諮商師', 'counselor')}</em> {tr('工作區', ' workspace')}
          </h2>
          <p className="font-display italic font-light text-base text-petal-muted">
            {tr('這裡集中你以諮商師身分使用的功能——你輔導的伴侶、個案諮商室、你的檔案與收入。', 'Everything you use as a counselor in one place: the couples you support, your client rooms, your profile and earnings.')}
            <br className="hidden sm:block" />
            {tr('切回右上角的「一般」即可回到你自己的伴侶功能。', 'Switch back to "Personal" in the top right to return to your own couple features.')}
          </p>
        </div>
      ) : (
        <div className="text-center max-w-2xl mx-auto">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            {tr('— 心理諮商', '— Counseling')}
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
            {tr('與真人', 'Talk with a real ')} <em className="not-italic italic text-pink-600">{tr('諮商心理師', 'counselor')}</em> {tr('聊聊', '')}
          </h2>
          <p className="font-display italic font-light text-base text-petal-muted">
            {POSITIONING_ONE_LINER}
            <br className="hidden sm:block" />
            {POSITIONING_SUBLINE}{tr('有些議題值得和一位受過專業訓練的人好好談——選擇一位諮商師，預約屬於你們的對話。', 'Some topics are worth discussing with someone professionally trained. Choose a counselor and book a conversation for the two of you.')}
          </p>
          <p className="mt-3 font-body text-xs text-petal-muted max-w-md mx-auto leading-relaxed">
            {NOT_A_SUBSTITUTE}
          </p>
        </div>
      )}

      {/* 諮商摘要 / 話題建議 / 你們的專屬心理師 — couple-facing prep tools; only in
          user mode. A counselor sees none of the couple's own 心理諮商 surface. */}
      {!isCounselorMode && (
        <>
          {/* 諮商摘要 — the between-sessions digest the couple brings INTO a
              session; sits above the directory so "整理近況 → 帶去談" reads as
              one flow. */}
          <TherapySummaryCard
            authState={{ isAuthenticated: authState.isAuthenticated, partnerConnected: authState.partnerConnected }}
            showNotification={showNotification}
          />

          {/* 話題建議 — proactively suggests topics for the NEXT session. */}
          <TherapyTopicsCard
            authState={{ isAuthenticated: authState.isAuthenticated, partnerConnected: authState.partnerConnected }}
            showNotification={showNotification}
          />

          {/* 你們的專屬心理師 — set/manage the couple's dedicated therapist. */}
          <DedicatedTherapistPanel
            reloadKey={dedicatedKey}
            isAuthenticated={authState.isAuthenticated}
            showNotification={showNotification}
          />
        </>
      )}

      {/* 我輔導的伴侶 — counselor-only (the flagship counselor tool). Gated on the
          role mode, not just on owning a profile, so it never leaks into a
          regular user's 心理諮商 page. */}
      {isCounselorMode && (
        <TherapistClientsPanel showNotification={showNotification} autoOpenToken={clientsFocusToken} autoOpenCoupleId={clientsFocusCoupleId} />
      )}

      {/* 公開問答 moved to the 真實故事 tab (StoriesView) — this view is the
          therapist directory only now. */}
      <>
      {/* Actions row. In user mode this is 我的預約 only; in counselor mode it's
          the counselor's own tools (個案諮商室 + 我的諮商師檔案 + 我的收入). */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {authState.isAuthenticated && (
          <button
            onClick={openMine}
            data-testid="therapist-mybookings-button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium"
          >
            <CalendarCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
            {isCounselorMode ? tr('個案諮商室', 'Client rooms') : tr('我的預約', 'My bookings')}{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        )}
        {isCounselorMode && authState.isAuthenticated && ownProfile && (
          <button
            onClick={() => setShowProfileEditor(true)}
            data-testid="therapist-myprofile-button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium"
          >
            <UserCog className="w-3.5 h-3.5" strokeWidth={1.5} />
            {tr('我的諮商師檔案', 'My counselor profile')}
          </button>
        )}
        {isCounselorMode && authState.isAuthenticated && ownProfile && (
          <button
            onClick={() => setShowEarnings(true)}
            data-testid="therapist-earnings-button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium"
          >
            <Wallet className="w-3.5 h-3.5" strokeWidth={1.5} />
            {tr('我的收入', 'My earnings')}
          </button>
        )}
      </div>

      {/* Therapist directory (focus filter + card grid) — couple-facing browse;
          user mode only. A counselor never browses the directory from here. */}
      {!isCounselorMode && (
        <>
          {/* Focus filter — a few common tags, the rest behind 更多 */}
          <FocusFilter value={focusFilter} onChange={setFocusFilter} />

          {/* List */}
          {loading ? (
            <p className="text-center font-body text-sm text-petal-muted py-12">{tr('載入中…', 'Loading…')}</p>
          ) : error ? (
            <div className="text-center py-12">
              <p className="font-body text-sm text-petal-rose-deep mb-3">{error}</p>
              <button
                onClick={loadTherapists}
                className="font-body text-sm text-petal-ink underline underline-offset-4"
              >
                {tr('重新載入', 'Reload')}
              </button>
            </div>
          ) : therapists.length === 0 ? (
            <p className="text-center font-body text-sm text-petal-muted py-12">
              {tr('這個領域目前還沒有諮商師，換個領域看看吧。', 'No counselors in this area yet. Try another area.')}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {therapists.map((t) => (
                <TherapistCard
                  key={t.id}
                  therapist={t}
                  onBook={() => setBookingTarget(t)}
                  onViewProfile={() => setProfileTarget(t)}
                />
              ))}
            </div>
          )}
        </>
      )}
      </>

      {bookingTarget && (
        <ConsultationModal
          therapist={bookingTarget}
          defaultEmail={authState.user ? undefined : undefined}
          isAuthenticated={authState.isAuthenticated}
          onClose={() => setBookingTarget(null)}
          onBooked={() => {
            setBookingTarget(null);
            setConsultationsLoaded(false);
            showNotification({
              type: 'success',
              title: tr('預約已送出', 'Booking sent'),
              message: tr('諮商師將盡快與你聯繫', 'The counselor will contact you as soon as possible'),
              duration: 3500,
            });
          }}
          showNotification={showNotification}
        />
      )}

      {profileTarget && (
        <TherapistProfileModal
          therapist={profileTarget}
          isAuthenticated={authState.isAuthenticated}
          onClose={() => setProfileTarget(null)}
          onBook={() => { const t = profileTarget; setProfileTarget(null); setBookingTarget(t); }}
          onDedicated={() => setDedicatedKey((k) => k + 1)}
          showNotification={showNotification}
        />
      )}

      {showMine && (
        <MyConsultationsModal
          consultations={visibleConsultations}
          onClose={() => setShowMine(false)}
          onOpenRoom={(c) => setChatTarget(c)}
          onChanged={loadConsultations}
          showNotification={showNotification}
        />
      )}

      {chatTarget && (
        <ChatRoom
          consultation={chatTarget}
          onClose={() => { setChatTarget(null); setConsultationsLoaded(false); loadConsultations(); }}
          showNotification={showNotification}
        />
      )}

      {showEarnings && (
        <EarningsModal onClose={() => setShowEarnings(false)} showNotification={showNotification} />
      )}

      {showProfileEditor && ownProfile && (
        <ProfileEditorModal
          profile={ownProfile}
          onClose={() => setShowProfileEditor(false)}
          onSaved={(updated) => {
            setOwnProfile(updated);
            loadTherapists();
            showNotification({ type: 'success', title: tr('檔案已更新', 'Profile updated'), message: tr('你的諮商師檔案已儲存', 'Your counselor profile has been saved'), duration: 3000 });
          }}
          showNotification={showNotification}
        />
      )}

      {/* Page footer — becoming a therapist is a low-key entry (public sign-up
          page); user mode only. A signed-in counselor is already one. */}
      {!isCounselorMode && (
        <footer className="mt-12 pt-6 border-t border-petal-rule text-center">
          <p className="font-body text-xs text-petal-muted">
            {tr('你是諮商師，想加入 Twogether？', 'Are you a counselor and want to join Twogether?')}
            <a
              href="/therapist-signup"
              data-testid="therapist-apply-button"
              className="text-pink-600 hover:text-pink-700 underline underline-offset-2 ml-1 inline-flex items-center gap-1"
            >
              <UserPlus className="w-3 h-3" strokeWidth={1.5} />
              {tr('成為諮商師', 'Become a counselor')}
            </a>
          </p>
        </footer>
      )}
    </div>
  );
};

// --- Therapist card -------------------------------------------------------

const TherapistCard: React.FC<{ therapist: Therapist; onBook: () => void; onViewProfile: () => void }> = ({ therapist, onBook, onViewProfile }) => (
  <div
    className="flex flex-col bg-petal-cream rounded-lg border border-petal-rule shadow-petal overflow-hidden"
    data-testid="therapist-card"
  >
    <div className="flex gap-4 p-5">
      {/* Avatar — contained, never cropped (project image rule) */}
      <div className="w-20 h-20 shrink-0 rounded-full overflow-hidden bg-petal-cream-2 border border-petal-rule flex items-center justify-center">
        {therapist.photoUrl ? (
          <img
            src={therapist.photoUrl}
            alt={therapist.displayName}
            className="w-full h-full object-contain"
          />
        ) : (
          <Heart className="w-8 h-8 text-pink-300" strokeWidth={1.5} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="font-display text-xl font-medium text-petal-ink">{therapist.displayName}</h3>
          {therapist.title && (
            <span className="font-body text-xs text-petal-muted">{therapist.title}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 font-body text-xs text-petal-ink-soft">
          {typeof therapist.yearsExperience === 'number' && (
            <span className="inline-flex items-center gap-1">
              <Award className="w-3 h-3" strokeWidth={1.5} /> {therapist.yearsExperience} {tr('年資歷', ' years of experience')}
            </span>
          )}
          {therapist.languages.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Languages className="w-3 h-3" strokeWidth={1.5} />
              {therapist.languages.map(languageLabel).join('・')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {therapist.focusAreas.map((a) => (
            <span
              key={a}
              className="px-2 py-0.5 rounded-full bg-petal-cream-2 border border-petal-rule font-body text-[11px] text-petal-ink-soft"
            >
              {focusLabel(a)}
            </span>
          ))}
          {(therapist.customSpecialties || []).map((s) => (
            <span
              key={s}
              className="px-2 py-0.5 rounded-full bg-pink-50 border border-pink-200 font-body text-[11px] text-pink-700"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>

    {therapist.bio && (
      <p className="px-5 font-body text-sm text-petal-ink-soft leading-relaxed line-clamp-4">
        {therapist.bio}
      </p>
    )}

    <div className="mt-auto flex items-center justify-between gap-3 px-5 py-4 mt-4 border-t border-petal-rule">
      <div className="font-body text-sm text-petal-ink">
        <span className="font-display text-lg text-pink-600">{formatNtd(therapist.rateTwd)}</span>
        <span className="text-petal-muted text-xs"> / {therapist.sessionMinutes} {tr('分鐘', ' min')}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onViewProfile}
          data-testid="therapist-profile-button"
          className="px-3.5 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium"
        >
          {tr('完整檔案', 'Full profile')}
        </button>
        <button
          onClick={onBook}
          data-testid="therapist-book-button"
          className="px-4 py-2 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors font-body text-[13px] font-medium"
        >
          {tr('預約諮詢', 'Book a session')}
        </button>
      </div>
    </div>
  </div>
);

// --- Modal shell ----------------------------------------------------------

const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title, onClose, children,
}) => {
  useScrollLock(true);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-petal-cream w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-lg border border-petal-rule shadow-petal">
        <div className="sticky top-0 bg-petal-cream flex items-center justify-between px-5 py-4 border-b border-petal-rule">
          <h3 className="font-display text-xl font-medium text-petal-ink">{title}</h3>
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label={tr("關閉", 'Close')}>
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

const fieldLabel = 'block font-body text-xs font-medium text-petal-ink-soft mb-1.5';
const fieldInput =
  'w-full px-3 py-2 rounded-md border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink';

// --- Consultation modal ---------------------------------------------------

const ConsultationModal: React.FC<{
  therapist: Therapist;
  defaultEmail?: string;
  isAuthenticated: boolean;
  onClose: () => void;
  onBooked: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ therapist, isAuthenticated, onClose, onBooked, showNotification }) => {
  const [focusArea, setFocusArea] = useState<TherapistFocusArea | ''>(
    therapist.focusAreas[0] || ''
  );
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!isAuthenticated) {
      showNotification({ type: 'warning', title: tr('請先登入', 'Please sign in'), message: tr('登入後即可預約諮詢', 'Sign in to book a session'), duration: 3000 });
      return;
    }
    try {
      setSubmitting(true);
      await apiService.requestConsultation(therapist.id, {
        focusArea: focusArea || undefined,
        message: message.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        preferredTime: preferredTime ? new Date(preferredTime).toISOString() : undefined,
      });
      onBooked();
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('預約失敗', 'Couldn\'t book'),
        message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'),
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title={tr(`預約 ${therapist.displayName}`, `Book ${therapist.displayName}`)} onClose={onClose}>
      <div className="space-y-4" data-testid="consultation-modal">
        <p className="font-body text-sm text-petal-muted">
          {formatNtd(therapist.rateTwd)} / {therapist.sessionMinutes} {tr('分鐘 · 送出後諮商師會與你聯繫安排時間。', ' min · After you send it, the counselor will contact you to arrange a time.')}
        </p>

        <div>
          <label className={fieldLabel}>{tr('想談的主題', 'Topic')}</label>
          <select
            value={focusArea}
            onChange={(e) => setFocusArea(e.target.value as TherapistFocusArea)}
            className={fieldInput}
          >
            <option value="">{tr('不指定', 'Not specified')}</option>
            {therapist.focusAreas.map((a) => (
              <option key={a} value={a}>{focusLabel(a)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={fieldLabel}>{tr('想聊聊的事（選填）', 'What you\'d like to talk about (optional)')}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={tr("簡單描述你們目前的狀況或想處理的議題…", 'Briefly describe your situation or what you\'d like to work on…')}
            className={`${fieldInput} resize-none`}
            data-testid="consultation-message"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel}>{tr('聯絡 Email（選填）', 'Contact email (optional)')}</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder={tr("預設使用帳號 Email", 'Defaults to your account email')}
              className={fieldInput}
            />
          </div>
          <div>
            <label className={fieldLabel}>{tr('希望的時段（選填）', 'Preferred times (optional)')}</label>
            <input
              type="datetime-local"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              className={fieldInput}
            />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          data-testid="consultation-submit"
          className="w-full py-2.5 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50 transition-colors font-body text-sm font-medium"
        >
          {submitting ? tr('送出中…', 'Sending…') : tr('送出預約', 'Send booking')}
        </button>
      </div>
    </ModalShell>
  );
};

// --- My consultations modal ----------------------------------------------

const MyConsultationsModal: React.FC<{
  consultations: TherapistConsultation[];
  onClose: () => void;
  onOpenRoom: (c: TherapistConsultation) => void;
  onChanged: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ consultations, onClose, onOpenRoom, onChanged, showNotification }) => (
  <ModalShell title={tr("我的預約", 'My bookings')} onClose={onClose}>
    {consultations.length === 0 ? (
      <p className="font-body text-sm text-petal-muted py-6 text-center">
        {tr('還沒有預約紀錄。挑一位諮商師開始吧。', 'No bookings yet. Pick a counselor to get started.')}
      </p>
    ) : (
      <div className="space-y-3" data-testid="my-consultations">
        {consultations.map((c) => {
          const status = CONSULTATION_STATUS[c.status];
          const isPaidSession = c.bookingType === 'scheduled';
          return (
            <div key={c.id} className="rounded-md border border-petal-rule p-4" data-testid="consultation-row">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-base text-petal-ink">
                  {c.therapistName}
                  {c.therapistTitle && (
                    <span className="font-body text-xs text-petal-muted ml-2">{c.therapistTitle}</span>
                  )}
                  {c.role === 'therapist' && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-petal-cream-2 border border-petal-rule font-body text-[10px] text-petal-ink-soft">
                      {tr('你是諮商師 · 來自', 'You\'re the counselor · from')} {c.requesterName}
                    </span>
                  )}
                </div>
                <span className={`font-body text-xs font-medium ${status.cls}`}>{status.label}</span>
              </div>
              {isPaidSession && (
                <div className="mt-1 inline-flex items-center gap-1.5 font-body text-[11px]">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-50 border border-pink-200 text-pink-700">
                    <Video className="w-3 h-3" strokeWidth={1.5} /> {tr('視訊諮商', 'Video session')}
                  </span>
                  {c.paymentStatus && (
                    <span className={c.paymentStatus === 'paid' ? 'text-petal-sage-deep' : 'text-petal-muted'}>
                      {PAYMENT_STATUS_LABEL[c.paymentStatus]}
                      {c.priceTwd ? ` · ${formatNtd(c.priceTwd)}` : ''}
                    </span>
                  )}
                </div>
              )}
              {c.focusArea && (
                <div className="mt-1 font-body text-xs text-petal-ink-soft">
                  {tr('主題：', 'Topic: ')}{focusLabel(c.focusArea)}
                </div>
              )}
              {c.message && (
                <p className="mt-1.5 font-body text-sm text-petal-ink-soft line-clamp-3">{c.message}</p>
              )}
              {c.preferredTime && (
                <div className="mt-1.5 inline-flex items-center gap-1 font-body text-xs text-petal-muted">
                  <Clock className="w-3 h-3" strokeWidth={1.5} />
                  {tr('希望時段：', 'Preferred times: ')}{new Date(c.preferredTime).toLocaleString('zh-TW')}
                </div>
              )}
              {c.responseNote && (
                <p className="mt-2 font-body text-sm text-petal-sage-deep">
                  {tr('諮商師回覆：', 'Counselor\'s reply: ')}{c.responseNote}
                </p>
              )}
              {c.publicStatus && c.publicStatus !== 'private' && c.publicStatus !== 'withdrawn' && (
                <div className="mt-2 inline-flex items-center gap-1 font-body text-[11px] text-petal-ink-soft">
                  <Globe className="w-3 h-3" strokeWidth={1.5} />
                  {PUBLIC_STATUS_LABEL[c.publicStatus]}
                </div>
              )}

              {/* Paid-session actions (pay / accept / meeting link / complete) */}
              <ConsultationSessionActions c={c} onChanged={onChanged} showNotification={showNotification} />

              <button
                onClick={() => onOpenRoom(c)}
                data-testid="enter-room-button"
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors font-body text-xs font-medium"
              >
                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                {tr('進入諮商室', 'Enter the room')}{c.messageCount > 0 ? ` (${c.messageCount})` : ''}
              </button>
            </div>
          );
        })}
      </div>
    )}
  </ModalShell>
);

// Paid-video-session actions on a consultation row: the client pays / joins; the
// therapist accepts, sets the meeting link, and completes / marks no-show.
const ConsultationSessionActions: React.FC<{
  c: TherapistConsultation;
  onChanged: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ c, onChanged, showNotification }) => {
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<MeetingProvider>('meet');
  const [payProvider, setPayProvider] = useState<PaymentProvider>('ecpay');
  const [url, setUrl] = useState('');

  if (c.bookingType !== 'scheduled') return null;

  const notifyErr = (err: unknown) =>
    showNotification({ type: 'error', title: tr('操作失敗', 'Something went wrong'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 4000 });

  const pay = async () => {
    try { setBusy(true); await apiService.paySession(c.id, payProvider); } catch (err) { notifyErr(err); setBusy(false); }
  };
  const respond = async (action: 'accept' | 'decline' | 'complete' | 'no_show') => {
    try {
      setBusy(true);
      await apiService.respondConsultation(c.id, action);
      onChanged();
    } catch (err) { notifyErr(err); } finally { setBusy(false); }
  };
  const saveMeeting = async () => {
    if (!url.trim()) return;
    try {
      setBusy(true);
      await apiService.setMeetingLink(c.id, provider, url.trim());
      setUrl('');
      onChanged();
      showNotification({ type: 'success', title: tr('已設定會議連結', 'Meeting link set'), message: tr('對方付款後即可看到連結', 'They\'ll see the link once they\'ve paid'), duration: 3000 });
    } catch (err) { notifyErr(err); } finally { setBusy(false); }
  };

  // --- Client side ---
  if (c.role === 'client') {
    if (c.paymentStatus === 'unpaid' || c.paymentStatus === 'failed') {
      return (
        <div className="mt-3">
          <div className="mb-2 max-w-xs">
            <PaymentMethodPicker value={payProvider} onChange={setPayProvider} disabled={busy} />
          </div>
          <button onClick={pay} disabled={busy} data-testid="pay-session-button"
            className="mr-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 transition-colors font-body text-xs font-medium">
            <Wallet className="w-3.5 h-3.5" strokeWidth={1.5} /> {busy ? tr('前往付款…', 'Going to payment…') : tr(`前往付款 ${c.priceTwd ? formatNtd(c.priceTwd) : ''}`, `Pay ${c.priceTwd ? formatNtd(c.priceTwd) : ''}`)}
          </button>
        </div>
      );
    }
    if (c.paymentStatus === 'pending') {
      return <p className="mt-2 font-body text-xs text-petal-muted">{tr('付款確認中，稍候會自動更新。', 'Confirming payment; this will update automatically.')}</p>;
    }
    if (c.paymentStatus === 'paid') {
      return c.meetingUrl ? (
        <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" data-testid="join-meeting-link"
          className="mt-3 mr-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-petal-sage-deepertext-white hover:opacity-90 transition-opacity font-body text-xs font-medium">
          <Video className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('加入', 'Join')}{MEETING_LABEL[c.meetingProvider || 'other']}{tr('視訊', ' video call')}
        </a>
      ) : (
        <p className="mt-2 font-body text-xs text-petal-sage-deep">{tr('已付款，等待諮商師提供會議連結。', 'Paid. Waiting for the counselor to share a meeting link.')}</p>
      );
    }
    return null;
  }

  // --- Therapist side ---
  if (c.role === 'therapist') {
    if (c.status === 'pending') {
      return (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => respond('accept')} disabled={busy} data-testid="accept-booking"
            className="px-3 py-1.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 font-body text-xs font-medium">{tr('接受預約', 'Accept booking')}</button>
          <button onClick={() => respond('decline')} disabled={busy}
            className="px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink font-body text-xs">{tr('婉拒', 'Decline')}</button>
        </div>
      );
    }
    if (c.status === 'accepted') {
      return (
        <div className="mt-3 space-y-2">
          {c.meetingUrl ? (
            <div className="inline-flex items-center gap-1.5 font-body text-xs text-petal-sage-deep">
              <Video className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('會議連結已提供（', 'Meeting link shared (')}{MEETING_LABEL[c.meetingProvider || 'other']}{tr('）', ')')}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select value={provider} onChange={(e) => setProvider(e.target.value as MeetingProvider)} className="px-2 py-1.5 rounded-md border border-petal-rule bg-petal-cream font-body text-xs text-petal-ink">
                <option value="meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="other">{tr('其他', 'Other')}</option>
              </select>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={tr("貼上會議連結 https://…", 'Paste the meeting link https://…')} data-testid="meeting-link-input"
                className="flex-1 min-w-[180px] px-3 py-1.5 rounded-md border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-xs text-petal-ink" />
              <button onClick={saveMeeting} disabled={busy || !url.trim()} data-testid="save-meeting-link"
                className="px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50 font-body text-xs font-medium">{tr('設定連結', 'Set link')}</button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => respond('complete')} disabled={busy} data-testid="complete-booking"
              className="px-3 py-1.5 rounded-full border border-petal-sage text-petal-sage-deep hover:bg-petal-sage/10 disabled:opacity-50 font-body text-xs">{tr('標記完成', 'Mark complete')}</button>
            <button onClick={() => respond('no_show')} disabled={busy}
              className="px-3 py-1.5 rounded-full border border-petal-rule text-petal-muted hover:border-petal-ink font-body text-xs">{tr('未出席', 'No-show')}</button>
          </div>
        </div>
      );
    }
    return null;
  }
  return null;
};

// --- Paid video session: booking modal + helpers -------------------------

const PAYMENT_STATUS_LABEL: Record<NonNullable<TherapistConsultation['paymentStatus']>, string> = {
  unpaid: tr('尚未付款', 'Unpaid'),
  pending: tr('付款確認中', 'Confirming payment'),
  paid: tr('已付款', 'Paid'),
  refunded: tr('已退款', 'Refunded'),
  failed: tr('付款失敗', 'Payment failed'),
};

const MEETING_LABEL: Record<string, string> = { zoom: 'Zoom', meet: 'Google Meet', other: tr('視訊', 'Video') };

// Books a paid video session off a free chat, then redirects to ECPay. Video is
// third-party; the platform only matches the two parties.
const VideoBookingModal: React.FC<{
  therapistId: string;
  therapistName: string;
  priceTwd: number;
  sessionMinutes: number;
  sourceConsultationId?: string;
  onClose: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ therapistId, therapistName, priceTwd, sessionMinutes, sourceConsultationId, onClose, showNotification }) => {
  const [message, setMessage] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [payProvider, setPayProvider] = useState<PaymentProvider>('ecpay');
  const [busy, setBusy] = useState(false);

  const proceed = async () => {
    try {
      setBusy(true);
      const booking = await apiService.bookVideoSession(therapistId, {
        message: message.trim() || undefined,
        preferredTime: preferredTime ? new Date(preferredTime).toISOString() : undefined,
        sourceConsultationId,
      });
      // Redirects the browser to the chosen gateway (resolves only on failure).
      await apiService.paySession(booking.id, payProvider);
    } catch (err) {
      showNotification({ type: 'error', title: tr('預約失敗', 'Couldn\'t book'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 4000 });
      setBusy(false);
    }
  };

  return (
    <ModalShell title={tr(`預約視訊諮商 · ${therapistName}`, `Book a video session · ${therapistName}`)} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-petal-cream-2 border border-petal-rule px-4 py-3">
          <span className="font-body text-sm text-petal-ink-soft">{tr('1:1 視訊諮商 ·', '1:1 video session ·')} {sessionMinutes} {tr('分鐘', ' min')}</span>
          <span className="font-display text-lg text-pink-600">{formatNtd(priceTwd)}</span>
        </div>
        <p className="font-body text-xs text-petal-muted">
          {tr('視訊以 Zoom / Google Meet 進行，諮商師接受預約後會提供會議連結。付款由綠界 ECPay 或藍新金流處理。', 'Sessions take place on Zoom / Google Meet; the counselor shares a meeting link once they accept. Payment is handled by ECPay or NewebPay.')}
        </p>
        <div>
          <label className={fieldLabel}>{tr('希望的時段（選填）', 'Preferred times (optional)')}</label>
          <input type="datetime-local" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('想先讓諮商師知道的事（選填）', 'Anything you\'d like the counselor to know first (optional)')}</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} className={`${fieldInput} resize-none`} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('付款方式', 'Payment method')}</label>
          <PaymentMethodPicker value={payProvider} onChange={setPayProvider} disabled={busy} />
        </div>
        <button
          onClick={proceed}
          disabled={busy}
          data-testid="video-pay-button"
          className="w-full py-3 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50 transition-colors font-display italic text-base"
        >
          {busy ? tr('前往付款…', 'Going to payment…') : tr(`前往付款 ${formatNtd(priceTwd)}`, `Pay ${formatNtd(priceTwd)}`)}
        </button>
      </div>
    </ModalShell>
  );
};

// --- 公開問答 publish controls (inside the chat room) ---------------------

// The two-party consent handshake to publish a chat as 公開問答. Either side may
// propose (with an anonymised title); the OTHER side approves; either side can
// withdraw. We infer "did I propose this?" from the publish status + my role,
// which is enough because the therapist and the couple are the two sides.
const PublishControls: React.FC<{
  consultationId: string;
  status: ConsultationPublicStatus;
  role: 'therapist' | 'client';
  onChanged: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ consultationId, status, role, onChanged, showNotification }) => {
  const [proposing, setProposing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const canPropose = status === 'private' || status === 'withdrawn';
  const iRequested =
    (status === 'client_requested' && role === 'client') ||
    (status === 'therapist_requested' && role === 'therapist');
  const iCanApprove =
    (status === 'client_requested' && role === 'therapist') ||
    (status === 'therapist_requested' && role === 'client');
  const published = status === 'published';

  const run = async (fn: () => Promise<{ message: string }>) => {
    try {
      setBusy(true);
      const res = await fn();
      onChanged();
      setProposing(false);
      setTitleDraft('');
      showNotification({ type: 'success', title: tr('已更新', 'Updated'), message: res.message, duration: 3500 });
    } catch (err) {
      showNotification({ type: 'error', title: tr('操作失敗', 'Something went wrong'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 3500 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-2.5 border-b border-petal-rule bg-petal-cream-2/60" data-testid="publish-controls">
      {proposing ? (
        <div className="space-y-2">
          <p className="font-body text-[11px] text-petal-muted">
            {tr('匿名公開這段對話，幫助有相同困擾的人。對方同意後才會公開，個案姓名不會顯示。', 'Publish this conversation anonymously to help people facing the same thing. It\'s only published once the other side agrees, and client names are never shown.')}
          </p>
          <div className="flex items-center gap-2">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              maxLength={200}
              placeholder={tr("幫這則公開問答下個標題…", 'Give this public Q&A a title…')}
              data-testid="publish-title-input"
              className="flex-1 px-3 py-1.5 rounded-full border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink"
            />
            <button
              onClick={() => run(() => apiService.requestPublishConsultation(consultationId, titleDraft.trim()))}
              disabled={busy || !titleDraft.trim()}
              data-testid="publish-submit"
              className="shrink-0 px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-40 font-body text-xs font-medium"
            >
              {tr('送出提議', 'Send proposal')}
            </button>
            <button onClick={() => { setProposing(false); setTitleDraft(''); }} className="shrink-0 text-petal-muted hover:text-petal-ink font-body text-xs">
              {tr('取消', 'Cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 font-body text-[11px] text-petal-ink-soft min-w-0">
            <Globe className="w-3 h-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{PUBLIC_STATUS_LABEL[status]}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canPropose && (
              <button onClick={() => setProposing(true)} data-testid="publish-propose" className="font-body text-xs font-medium text-petal-ink underline underline-offset-2 hover:text-pink-700">
                {tr('設為公開問答', 'Make it public Q&A')}
              </button>
            )}
            {iRequested && (
              <button onClick={() => run(() => apiService.withdrawPublishConsultation(consultationId))} disabled={busy} className="font-body text-xs text-petal-muted hover:text-petal-ink disabled:opacity-40">
                {tr('取消提議', 'Withdraw proposal')}
              </button>
            )}
            {iCanApprove && (
              <>
                <button onClick={() => run(() => apiService.approvePublishConsultation(consultationId))} disabled={busy} data-testid="publish-approve" className="px-3 py-1 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40 font-body text-xs font-medium">
                  {tr('同意公開', 'Agree to publish')}
                </button>
                <button onClick={() => run(() => apiService.withdrawPublishConsultation(consultationId))} disabled={busy} className="font-body text-xs text-petal-muted hover:text-petal-ink disabled:opacity-40">
                  {tr('婉拒', 'Decline')}
                </button>
              </>
            )}
            {published && (
              <button onClick={() => run(() => apiService.withdrawPublishConsultation(consultationId))} disabled={busy} data-testid="publish-withdraw" className="font-body text-xs text-petal-muted hover:text-petal-ink disabled:opacity-40">
                {tr('取消公開', 'Unpublish')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Therapist earnings ---------------------------------------------------

const EarningsModal: React.FC<{
  onClose: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ onClose, showNotification }) => {
  const [earnings, setEarnings] = useState<TherapistEarnings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiService.getMyEarnings()
      .then((e) => { if (alive) setEarnings(e); })
      .catch((err) => { if (alive) showNotification({ type: 'error', title: tr('無法取得收入', 'Couldn\'t load earnings'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 4000 }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [showNotification]);

  return (
    <ModalShell title={tr("我的收入", 'My earnings')} onClose={onClose}>
      {loading ? (
        <p className="font-body text-sm text-petal-muted py-6 text-center">{tr('載入中…', 'Loading…')}</p>
      ) : !earnings ? (
        <p className="font-body text-sm text-petal-muted py-6 text-center">{tr('尚無收入資料。', 'No earnings data yet.')}</p>
      ) : (
        <div className="space-y-4" data-testid="earnings-modal">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-petal-rule p-4">
              <div className="font-body text-xs text-petal-muted">{tr('累計實拿', 'Total earned')}</div>
              <div className="font-display text-2xl text-pink-600">{formatNtd(earnings.totalNetTwd)}</div>
              <div className="font-body text-[11px] text-petal-muted mt-0.5">{earnings.paidSessionCount} {tr('次已付款諮商', ' paid sessions')}</div>
            </div>
            <div className="rounded-md border border-petal-rule p-4">
              <div className="font-body text-xs text-petal-muted">{tr('目前平台分潤', 'Current platform fee')}</div>
              <div className="font-display text-2xl text-petal-ink">{earnings.currentFeeRate}%</div>
              <div className="font-body text-[11px] text-petal-muted mt-0.5">
                {earnings.introSessionsRemaining > 0
                  ? tr(`新進優惠剩 ${earnings.introSessionsRemaining} 次（10%）`, `${earnings.introSessionsRemaining} intro-rate sessions left (10%)`)
                  : tr('已套用一般分潤（20%）', 'Standard fee applies (20%)')}
              </div>
            </div>
          </div>
          <p className="font-body text-[11px] text-petal-muted">
            {tr('視訊諮商款項由平台每月結算後撥付。問答分潤另計（每月結算）。', 'Video session payments are settled and paid out monthly by the platform. Q&A revenue share is calculated separately (monthly).')}
          </p>
          {earnings.sessions.length > 0 && (
            <div className="space-y-2">
              <div className="font-body text-xs font-semibold text-petal-ink-soft">{tr('已付款的諮商', 'Paid sessions')}</div>
              {earnings.sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-petal-rule px-3 py-2 font-body text-xs">
                  <span className="text-petal-muted">
                    {s.paidAt ? new Date(s.paidAt).toLocaleDateString('zh-TW') : '—'} {tr('· 平台', '· Platform')} {s.feeRate}%
                  </span>
                  <span className="text-petal-ink">
                    {formatNtd(s.priceTwd)} → <span className="text-pink-600 font-medium">{tr('實拿', 'You get')} {formatNtd(s.therapistNetTwd)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};

// --- Consultation chat room ----------------------------------------------

// Group chat for a consultation: both partners + the therapist. Polls for new
// messages every few seconds while open. Couple members can anchor a message
// to one of their recorded events via the event picker.
const ChatRoom: React.FC<{
  consultation: TherapistConsultation;
  onClose: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ consultation, onClose, showNotification }) => {
  const [thread, setThread] = useState<ConsultationThread | null>(null);
  const [draft, setDraft] = useState('');
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await apiService.getConsultationMessages(consultation.id);
      setThread(t);
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  }, [consultation.id]);

  // The "預約視訊諮商" nudge is for the client side, and only when we know the
  // therapist + their rate (from the consultation list payload).
  const canBookVideo = consultation.role === 'client'
    && !!consultation.therapistId
    && typeof consultation.therapistRateTwd === 'number';

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000); // lightweight polling, MVP
    return () => clearInterval(timer);
  }, [load]);

  // The event picker only makes sense for couple members (their own events).
  useEffect(() => {
    if (consultation.role === 'client') {
      apiService.listEvents({ limit: 50 })
        .then((r) => setEvents(r.events))
        .catch(() => { /* non-fatal */ });
    }
  }, [consultation.role]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      setSending(true);
      await apiService.postConsultationMessage(consultation.id, body, selectedEvent?.id);
      setDraft('');
      setSelectedEvent(null);
      await load();
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('送出失敗', 'Couldn\'t send'),
        message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'),
        duration: 3500,
      });
    } finally {
      setSending(false);
    }
  };

  useScrollLock(true);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-petal-cream w-full sm:max-w-lg h-[92vh] sm:h-[80vh] flex flex-col rounded-t-2xl sm:rounded-lg border border-petal-rule shadow-petal" data-testid="chat-room">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-petal-rule">
          <div>
            <h3 className="font-display text-lg font-medium text-petal-ink">{tr('諮商室 ·', 'Counseling room ·')} {consultation.therapistName}</h3>
            <p className="font-body text-xs text-petal-muted">
              {tr('你們與諮商師的對話 — 可引用記錄過的「對話」一起討論', 'Your conversation with the counselor. You can quote recorded "conversations" to discuss together')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label={tr("關閉", 'Close')}>
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* 公開問答 publish handshake */}
        {thread && (
          <PublishControls
            consultationId={consultation.id}
            status={thread.publicStatus || 'private'}
            role={thread.role}
            onChanged={load}
            showNotification={showNotification}
          />
        )}

        {/* Nudge to book a paid video session (the free chat funnel) */}
        {canBookVideo && (
          <button
            onClick={() => setShowBooking(true)}
            data-testid="book-video-cta"
            className="flex items-center justify-center gap-2 px-5 py-2.5 border-b border-petal-rule bg-pink-50 text-pink-700 hover:bg-pink-100 transition-colors font-body text-[13px] font-medium"
          >
            <Video className="w-3.5 h-3.5" strokeWidth={1.5} />
            {tr('想更深入談談？預約 1:1 視訊諮商（', 'Want to go deeper? Book a 1:1 video session (')}{formatNtd(consultation.therapistRateTwd || 0)} / {consultation.therapistSessionMinutes || 50} {tr('分鐘）', ' min)')}
          </button>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="chat-messages">
          {!thread ? (
            <p className="text-center font-body text-sm text-petal-muted">{tr('載入中…', 'Loading…')}</p>
          ) : thread.messages.length === 0 ? (
            <p className="text-center font-body text-sm text-petal-muted py-8">
              {tr('還沒有訊息。打個招呼，開始你們的對話吧。', 'No messages yet. Say hello and start your conversation.')}
            </p>
          ) : (
            thread.messages.map((m) => (
              <div key={m.id} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${m.isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div className="flex items-center gap-1.5 mb-0.5 px-1">
                    <ParticipantAvatar
                      size="xs"
                      role={m.isTherapist ? 'therapist' : 'user'}
                      name={m.senderName}
                      colorKey={m.senderId}
                    />
                    <span className="font-body text-[11px] text-petal-muted">
                      {m.isTherapist ? tr(`${m.senderName}（諮商師）`, `${m.senderName} (counselor)`) : m.senderName}
                    </span>
                  </div>
                  {m.event && (
                    <div className="mb-1 px-3 py-2 rounded-lg bg-petal-cream-2 border border-petal-rule max-w-full">
                      <div className="font-body text-[10px] uppercase tracking-wide text-petal-muted">{tr('引用對話', 'Quote a conversation')}</div>
                      <div className="font-body text-xs font-medium text-petal-ink">{m.event.title}</div>
                      <div className="font-body text-xs text-petal-ink-soft line-clamp-2">{m.event.summary}</div>
                    </div>
                  )}
                  <div
                    className={`px-3.5 py-2 rounded-2xl font-body text-sm ${
                      m.isMine
                        ? 'bg-petal-ink text-petal-cream rounded-br-sm'
                        : m.isTherapist
                          ? `${ROLE_STYLE.therapist.surface} text-petal-ink rounded-bl-sm`
                          : `${ROLE_STYLE.partner.surface} text-petal-ink rounded-bl-sm`
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-petal-rule px-4 py-3">
          {selectedEvent && (
            <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-petal-cream-2 border border-petal-rule">
              <span className="font-body text-xs text-petal-ink-soft truncate">{tr('引用：', 'Quoting: ')}{selectedEvent.title}</span>
              <button onClick={() => setSelectedEvent(null)} className="ml-auto text-petal-muted hover:text-petal-ink">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            {consultation.role === 'client' && (
              <button
                onClick={() => setShowEventPicker(true)}
                data-testid="reference-event-button"
                title={tr("引用對話", 'Quote a conversation')}
                className="shrink-0 p-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
              >
                <StickyNote className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={tr("輸入訊息…", 'Type a message…')}
              data-testid="chat-input"
              className="flex-1 px-3.5 py-2 rounded-full border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink"
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              data-testid="chat-send"
              className="shrink-0 p-2.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40 transition-colors"
            >
              <Send className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Paid video booking */}
      {showBooking && canBookVideo && (
        <VideoBookingModal
          therapistId={consultation.therapistId as string}
          therapistName={consultation.therapistName}
          priceTwd={consultation.therapistRateTwd as number}
          sessionMinutes={consultation.therapistSessionMinutes || 50}
          sourceConsultationId={consultation.id}
          onClose={() => setShowBooking(false)}
          showNotification={showNotification}
        />
      )}

      {/* Event picker overlay */}
      {showEventPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowEventPicker(false)}>
          <div className="bg-petal-cream w-full max-w-md max-h-[70vh] overflow-y-auto rounded-lg border border-petal-rule shadow-petal" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-petal-cream flex items-center justify-between px-4 py-3 border-b border-petal-rule">
              <h4 className="font-display text-base text-petal-ink">{tr('引用一段對話', 'Quote a conversation')}</h4>
              <button onClick={() => setShowEventPicker(false)} className="text-petal-muted hover:text-petal-ink"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-2" data-testid="event-picker">
              {events.length === 0 ? (
                <p className="font-body text-sm text-petal-muted text-center py-6">
                  {tr('你們還沒有記錄過對話。', 'You haven\'t recorded any conversations yet.')}
                </p>
              ) : (
                events.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => { setSelectedEvent(ev); setShowEventPicker(false); }}
                    className="w-full text-left px-3 py-2.5 rounded-md border border-petal-rule hover:border-petal-ink transition-colors"
                  >
                    <div className="font-body text-sm font-medium text-petal-ink">{ev.title}</div>
                    <div className="font-body text-xs text-petal-ink-soft line-clamp-2">{ev.summary}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Therapist profile editor (self-service) ------------------------------

const STATUS_LABEL: Record<OwnTherapistProfile['status'], { label: string; cls: string }> = {
  pending: { label: tr('審核中', 'Under review'), cls: 'text-petal-rose-deep' },
  approved: { label: tr('已上架', 'Listed'), cls: 'text-petal-sage-deep' },
  suspended: { label: tr('已暫停（暫時下架）', 'Paused (temporarily unlisted)'), cls: 'text-petal-muted' },
  rejected: { label: tr('未通過', 'Not approved'), cls: 'text-petal-muted' },
};

const IDENTITY_LABEL: Record<string, string> = {
  unverified: tr('尚未提交文件', 'No documents submitted'),
  submitted: tr('文件審核中', 'Documents under review'),
  verified: tr('身分已驗證', 'Identity verified'),
  rejected: tr('文件已退回', 'Documents returned'),
};

const ProfileEditorModal: React.FC<{
  profile: OwnTherapistProfile;
  onClose: () => void;
  onSaved: (updated: OwnTherapistProfile) => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}> = ({ profile, onClose, onSaved, showNotification }) => {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [title, setTitle] = useState(profile.title || '');
  const [focusAreas, setFocusAreas] = useState<TherapistFocusArea[]>(profile.focusAreas);
  const [customSpecialties, setCustomSpecialties] = useState<string[]>(profile.customSpecialties || []);
  const [customDraft, setCustomDraft] = useState('');
  const [bio, setBio] = useState(profile.bio || '');
  const [rateTwd, setRateTwd] = useState(String(profile.rateTwd));
  const [sessionMinutes, setSessionMinutes] = useState(String(profile.sessionMinutes));
  const [yearsExperience, setYearsExperience] = useState(
    profile.yearsExperience != null ? String(profile.yearsExperience) : ''
  );
  const [contactPhone, setContactPhone] = useState(profile.contactPhone || '');
  const [photoUrl, setPhotoUrl] = useState(profile.photoUrl || '');
  const [documents, setDocuments] = useState<string[]>(profile.identityDocuments || []);
  const [identityStatus, setIdentityStatus] = useState(profile.identityStatus);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rich profile (048). List fields are edited as one-item-per-line text and
  // converted on save; publications/articles are "標題 | 連結" per line.
  const [introMessage, setIntroMessage] = useState(profile.introMessage || '');
  const [approach, setApproach] = useState(profile.approach || '');
  const [about, setAbout] = useState(profile.about || '');
  const [acceptingNewClients, setAcceptingNewClients] = useState(profile.acceptingNewClients !== false);
  const [certifications, setCertifications] = useState((profile.certifications || []).join('\n'));
  const [currentPositions, setCurrentPositions] = useState((profile.currentPositions || []).join('\n'));
  const [qualifications, setQualifications] = useState((profile.qualifications || []).join('\n'));
  const [training, setTraining] = useState((profile.training || []).join('\n'));
  const [publications, setPublications] = useState(
    (profile.publications || []).map((p) => (p.source ? `${p.title} | ${p.source}` : p.title)).join('\n')
  );
  const [articles, setArticles] = useState(
    (profile.articles || []).map((a) => (a.url ? `${a.title} | ${a.url}` : a.title)).join('\n')
  );

  // "one per line" → string[]; "標題 | 連結" → {title, [key]} list.
  const linesToList = (raw: string): string[] =>
    raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const linesToLinks = (raw: string, key: 'url' | 'source') =>
    raw.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [title, ...rest] = line.split('|');
      const link = rest.join('|').trim();
      return { title: title.trim(), [key]: link } as { title: string; url?: string; source?: string };
    }).filter((it) => it.title);

  const toggleFocus = (id: TherapistFocusArea) => {
    setFocusAreas((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const addCustom = () => {
    const v = customDraft.trim().slice(0, 40);
    if (!v || customSpecialties.length >= 8) { setCustomDraft(''); return; }
    if (!customSpecialties.includes(v)) setCustomSpecialties([...customSpecialties, v]);
    setCustomDraft('');
  };

  const uploadPhoto = async (file: File) => {
    try {
      setUploadingPhoto(true);
      setPhotoUrl(await apiService.uploadTherapistAsset(file, 'photo'));
    } catch (err) {
      showNotification({ type: 'error', title: tr('上傳失敗', 'Upload failed'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 4000 });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const uploadDoc = async (file: File) => {
    try {
      setUploadingDoc(true);
      const url = await apiService.uploadTherapistAsset(file, 'document');
      const updated = await apiService.addMyTherapistDocument(url);
      setDocuments(updated.identityDocuments);
      setIdentityStatus(updated.identityStatus);
      showNotification({ type: 'success', title: tr('文件已上傳', 'Document uploaded'), message: tr('等待管理員審核', 'Waiting for admin review'), duration: 3000 });
    } catch (err) {
      showNotification({ type: 'error', title: tr('上傳失敗', 'Upload failed'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 4000 });
    } finally {
      setUploadingDoc(false);
    }
  };

  const save = async () => {
    if (!displayName.trim()) {
      showNotification({ type: 'warning', title: tr('請填寫姓名', 'Please enter your name'), message: tr('姓名不能為空', 'Name can\'t be empty'), duration: 3000 });
      return;
    }
    if (focusAreas.length === 0) {
      showNotification({ type: 'warning', title: tr('請選擇專長', 'Please choose your specialties'), message: tr('請至少選擇一個專長領域', 'Please choose at least one specialty'), duration: 3000 });
      return;
    }
    const payload: TherapistProfileUpdate = {
      displayName: displayName.trim(),
      title: title.trim() || null,
      focusAreas,
      customSpecialties,
      bio: bio.trim() || null,
      photoUrl: photoUrl || null,
      rateTwd: Number(rateTwd) || 0,
      sessionMinutes: Number(sessionMinutes) || 50,
      yearsExperience: yearsExperience ? Number(yearsExperience) : null,
      contactPhone: contactPhone.trim() || null,
      // Rich profile sections (048).
      introMessage: introMessage.trim() || null,
      approach: approach.trim() || null,
      about: about.trim() || null,
      acceptingNewClients,
      certifications: linesToList(certifications),
      currentPositions: linesToList(currentPositions),
      qualifications: linesToList(qualifications),
      training: linesToList(training),
      publications: linesToLinks(publications, 'source'),
      articles: linesToLinks(articles, 'url'),
    };
    try {
      setSaving(true);
      const updated = await apiService.updateMyTherapistProfile(payload);
      onSaved(updated);
      onClose();
    } catch (err) {
      showNotification({ type: 'error', title: tr('儲存失敗', 'Couldn\'t save'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 4000 });
    } finally {
      setSaving(false);
    }
  };

  const status = STATUS_LABEL[profile.status];

  return (
    <ModalShell title={tr("我的諮商師檔案", 'My counselor profile')} onClose={onClose}>
      <div className="space-y-4" data-testid="therapist-profile-editor">
        {/* Status banner */}
        <div className="rounded-md border border-petal-rule p-3 bg-petal-cream-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-petal-muted">{tr('上架狀態', 'Listing status')}</span>
            <span className={`font-body text-xs font-medium ${status.cls}`}>{status.label}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-petal-muted">{tr('Email 驗證', 'Email verification')}</span>
            <span className={`inline-flex items-center gap-1 font-body text-xs font-medium ${profile.emailVerified ? 'text-petal-sage-deep' : 'text-petal-rose-deep'}`}>
              {profile.emailVerified
                ? (<><CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('已驗證', 'Verified')}</>)
                : (<><AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('未驗證（請查收驗證信）', 'Not verified (check your inbox for the verification email)')}</>)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-petal-muted">{tr('身分文件', 'Identity documents')}</span>
            <span className="font-body text-xs font-medium text-petal-ink-soft">{IDENTITY_LABEL[identityStatus] || identityStatus}</span>
          </div>
          {profile.reviewNote && (
            <p className="font-body text-xs text-petal-ink-soft pt-1">{tr('管理員備註：', 'Admin note: ')}{profile.reviewNote}</p>
          )}
        </div>

        {/* Photo */}
        <div>
          <label className={fieldLabel}>{tr('大頭照', 'Profile photo')}</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 shrink-0 rounded-full overflow-hidden bg-petal-cream-2 border border-petal-rule flex items-center justify-center">
              {photoUrl
                ? <img src={photoUrl} alt={displayName} className="w-full h-full object-contain" />
                : <Heart className="w-7 h-7 text-pink-300" strokeWidth={1.5} />}
            </div>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs">
              <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
              {uploadingPhoto ? tr('上傳中…', 'Uploading…') : tr('更換照片', 'Change photo')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }}
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel}>{tr('姓名', 'Name')}</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>{tr('職稱', 'Title')}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={tr("諮商心理師 / 臨床心理師", 'Counseling psychologist / Clinical psychologist')} className={fieldInput} />
          </div>
        </div>

        {/* Focus areas */}
        <div>
          <label className={fieldLabel}>{tr('專長領域', 'Specialties')}</label>
          <div className="flex flex-wrap gap-1.5">
            {FOCUS_AREAS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFocus(f.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full border font-body text-xs transition-colors ${
                  focusAreas.includes(f.id)
                    ? 'bg-petal-ink text-petal-cream border-petal-ink'
                    : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink'
                }`}
              >
                <span>{f.emoji}</span><span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom specialties */}
        <div>
          <label className={fieldLabel}>{tr('自訂專長 / 取向（最多 8 個）', 'Custom specialties / approaches (up to 8)')}</label>
          {customSpecialties.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {customSpecialties.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-pink-50 border border-pink-200 font-body text-[11px] text-pink-700">
                  {s}
                  <button type="button" onClick={() => setCustomSpecialties(customSpecialties.filter((x) => x !== s))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              maxLength={40}
              placeholder={tr("例如：EMDR、創傷知情、CBT…", 'e.g. EMDR, trauma-informed, CBT…')}
              className={fieldInput}
            />
            <button type="button" onClick={addCustom} className="shrink-0 px-3 rounded-md bg-petal-ink text-petal-cream font-body text-xs">{tr('新增', 'Add')}</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={fieldLabel}>{tr('年資', 'Years of experience')}</label>
            <input type="number" min={0} max={80} value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>{tr('費率 (NT$)', 'Rate (NT$)')}</label>
            <input type="number" min={0} max={100000} value={rateTwd} onChange={(e) => setRateTwd(e.target.value)} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>{tr('時長 (分)', 'Duration (min)')}</label>
            <input type="number" min={10} max={240} value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value)} className={fieldInput} />
          </div>
        </div>

        <div>
          <label className={fieldLabel}>{tr('聯絡電話', 'Phone')}</label>
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={40} className={fieldInput} />
        </div>

        <div>
          <label className={fieldLabel}>{tr('自我介紹', 'About me')}</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={2000} className={`${fieldInput} resize-none`} />
        </div>

        {/* Rich profile sections (048) */}
        <div className="pt-1 border-t border-petal-rule">
          <div className="font-body text-xs font-semibold text-petal-ink-soft mb-1">{tr('完整檔案（選填）', 'Full profile (optional)')}</div>
          <p className="font-body text-[11px] text-petal-muted mb-3">{tr('這些內容會顯示在「完整檔案」頁面，幫助來談者更認識你。清單欄位請一行一項。', 'This appears on your "Full profile" page to help clients get to know you. For list fields, one item per line.')}</p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={acceptingNewClients} onChange={(e) => setAcceptingNewClients(e.target.checked)} className="accent-pink-500" />
          <span className="font-body text-sm text-petal-ink-soft">{tr('目前開放新案預約', 'Taking new clients')}</span>
        </label>

        <div>
          <label className={fieldLabel}>{tr('給來談者的一段話', 'A note to clients')}</label>
          <textarea value={introMessage} onChange={(e) => setIntroMessage(e.target.value)} rows={4} maxLength={8000} className={`${fieldInput} resize-y`} placeholder={tr("想對正在考慮預約的人說的話…", 'What you\'d like to say to someone considering booking…')} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('治療取向／治療理念', 'Approach / philosophy')}</label>
          <textarea value={approach} onChange={(e) => setApproach(e.target.value)} rows={4} maxLength={8000} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('認識治療師', 'Getting to know the therapist')}</label>
          <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} maxLength={8000} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('心理師證照（一行一項）', 'Licenses (one per line)')}</label>
          <textarea value={certifications} onChange={(e) => setCertifications(e.target.value)} rows={2} className={`${fieldInput} resize-y`} placeholder={tr("諮商心理師證書字號／諮心字第 0000 號", 'Counseling psychologist license no. 0000')} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('現任（一行一項）', 'Current positions (one per line)')}</label>
          <textarea value={currentPositions} onChange={(e) => setCurrentPositions(e.target.value)} rows={2} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('專業資格（一行一項）', 'Qualifications (one per line)')}</label>
          <textarea value={qualifications} onChange={(e) => setQualifications(e.target.value)} rows={2} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('專業訓練（一行一項）', 'Training (one per line)')}</label>
          <textarea value={training} onChange={(e) => setTraining(e.target.value)} rows={3} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('心理專業著作（一行一項，可加「標題 | 來源」）', 'Publications (one per line; you can add "Title | Source")')}</label>
          <textarea value={publications} onChange={(e) => setPublications(e.target.value)} rows={2} className={`${fieldInput} resize-y`} placeholder={tr("文章標題 | 張老師月刊 No.567", 'Article title | Journal No. 567')} />
        </div>
        <div>
          <label className={fieldLabel}>{tr('心理專業文章 / 影音（一行一項，可加「標題 | 連結」）', 'Articles / videos (one per line; you can add "Title | Link")')}</label>
          <textarea value={articles} onChange={(e) => setArticles(e.target.value)} rows={3} className={`${fieldInput} resize-y`} placeholder={tr("文章標題 | https://…", 'Article title | https://…')} />
        </div>

        {/* Identity documents */}
        <div>
          <label className={fieldLabel}>{tr('證照 / 身分證明文件', 'License / identity documents')}</label>
          {documents.length > 0 && (
            <div className="space-y-1 mb-2">
              {documents.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block font-body text-xs text-pink-600 underline underline-offset-2">
                  {tr('📎 文件', '📎 Document')} {i + 1}
                </a>
              ))}
            </div>
          )}
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs">
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
            {uploadingDoc ? tr('上傳中…', 'Uploading…') : tr('上傳文件', 'Upload document')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ''; }}
            />
          </label>
          <p className="mt-1.5 font-body text-[11px] text-petal-muted">{tr('文件僅供管理員審核，不會公開顯示。', 'Documents are only for admin review and are never shown publicly.')}</p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          data-testid="save-therapist-profile"
          className="w-full py-2.5 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50 transition-colors font-body text-sm font-medium"
        >
          {saving ? tr('儲存中…', 'Saving…') : tr('儲存檔案', 'Save profile')}
        </button>
      </div>
    </ModalShell>
  );
};

export default TherapistsView;
