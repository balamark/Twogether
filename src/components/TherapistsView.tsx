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
import DedicatedTherapistPanel from './DedicatedTherapistPanel';
import TherapistClientsPanel from './TherapistClientsPanel';
import ParticipantAvatar from './ParticipantAvatar';

interface TherapistsViewProps {
  authState: {
    user: { id: string; nickname?: string } | null;
    isAuthenticated: boolean;
    partnerConnected: boolean;
  };
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

const LANGUAGE_LABEL: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};
const languageLabel = (code: string): string => LANGUAGE_LABEL[code] || code;

const CONSULTATION_STATUS: Record<TherapistConsultation['status'], { label: string; cls: string }> = {
  pending: { label: '等待回覆', cls: 'text-petal-rose-deep' },
  accepted: { label: '已接受', cls: 'text-petal-sage-deep' },
  declined: { label: '已婉拒', cls: 'text-petal-muted' },
  completed: { label: '已完成', cls: 'text-petal-sage-deep' },
  cancelled: { label: '已取消', cls: 'text-petal-muted' },
  no_show: { label: '未出席', cls: 'text-petal-muted' },
};

// 公開問答 publish state → label shown in the chat room / consultation list.
const PUBLIC_STATUS_LABEL: Record<ConsultationPublicStatus, string> = {
  private: '私密',
  client_requested: '等待對方同意公開',
  therapist_requested: '等待對方同意公開',
  published: '已公開為公開問答',
  withdrawn: '已取消公開',
};

const TherapistsView: React.FC<TherapistsViewProps> = ({ authState, showNotification }) => {
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
      setError(err instanceof Error ? err.message : '無法取得諮商師列表');
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

  const pendingCount = useMemo(
    () => consultations.filter((c) => c.status === 'pending').length,
    [consultations]
  );

  return (
    <div className="space-y-8" data-testid="therapists-view">
      {/* Intro — leads with the Therapy Companion positioning: we sit beside
          therapists, not against them. The 167-hours one-liner + the honest
          "not a substitute" note come from src/content/positioning.ts so every
          surface stays in sync. */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 心理諮商
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
          與真人 <em className="not-italic italic text-pink-600">諮商心理師</em> 聊聊
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          {POSITIONING_ONE_LINER}
          <br className="hidden sm:block" />
          {POSITIONING_SUBLINE}有些議題值得和一位受過專業訓練的人好好談——選擇一位諮商師，預約屬於你們的對話。
        </p>
        <p className="mt-3 font-body text-xs text-petal-muted max-w-md mx-auto leading-relaxed">
          {NOT_A_SUBSTITUTE}
        </p>
      </div>

      {/* 諮商摘要 — the between-sessions digest the couple brings INTO a session.
          This is the Therapy Companion flagship: it sits above the directory so
          "整理你們的近況 → 帶去和心理師談" reads as one flow. */}
      <TherapySummaryCard
        authState={{ isAuthenticated: authState.isAuthenticated, partnerConnected: authState.partnerConnected }}
        showNotification={showNotification}
      />

      {/* 你們的專屬心理師 — set/manage the couple's dedicated therapist. */}
      <DedicatedTherapistPanel
        reloadKey={dedicatedKey}
        isAuthenticated={authState.isAuthenticated}
        showNotification={showNotification}
      />

      {/* 我輔導的伴侶 — only shown to a logged-in therapist. */}
      {ownProfile && (
        <TherapistClientsPanel showNotification={showNotification} />
      )}

      {/* 公開問答 moved to the 真實故事 tab (StoriesView) — this view is the
          therapist directory only now. */}
      <>
      {/* Actions row. 成為諮商師 lives in the page footer now (therapists sign
          in with a normal account, so there's no separate login button here). */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {authState.isAuthenticated && (
          <button
            onClick={openMine}
            data-testid="therapist-mybookings-button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium"
          >
            <CalendarCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
            我的預約{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        )}
        {authState.isAuthenticated && ownProfile && (
          <button
            onClick={() => setShowProfileEditor(true)}
            data-testid="therapist-myprofile-button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium"
          >
            <UserCog className="w-3.5 h-3.5" strokeWidth={1.5} />
            我的諮商師檔案
          </button>
        )}
        {authState.isAuthenticated && ownProfile && (
          <button
            onClick={() => setShowEarnings(true)}
            data-testid="therapist-earnings-button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium"
          >
            <Wallet className="w-3.5 h-3.5" strokeWidth={1.5} />
            我的收入
          </button>
        )}
      </div>

      {/* Focus filter — a few common tags, the rest behind 更多 */}
      <FocusFilter value={focusFilter} onChange={setFocusFilter} />

      {/* List */}
      {loading ? (
        <p className="text-center font-body text-sm text-petal-muted py-12">載入中…</p>
      ) : error ? (
        <div className="text-center py-12">
          <p className="font-body text-sm text-petal-rose-deep mb-3">{error}</p>
          <button
            onClick={loadTherapists}
            className="font-body text-sm text-petal-ink underline underline-offset-4"
          >
            重新載入
          </button>
        </div>
      ) : therapists.length === 0 ? (
        <p className="text-center font-body text-sm text-petal-muted py-12">
          這個領域目前還沒有諮商師，換個領域看看吧。
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
              title: '預約已送出',
              message: '諮商師將盡快與你聯繫',
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
          consultations={consultations}
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
            showNotification({ type: 'success', title: '檔案已更新', message: '你的諮商師檔案已儲存', duration: 3000 });
          }}
          showNotification={showNotification}
        />
      )}

      {/* Page footer — becoming a therapist is a low-key entry (public sign-up
          page). Therapists sign in with a normal Twogether account. */}
      <footer className="mt-12 pt-6 border-t border-petal-rule text-center">
        <p className="font-body text-xs text-petal-muted">
          你是諮商師，想加入 Twogether？
          <a
            href="/therapist-signup"
            data-testid="therapist-apply-button"
            className="text-pink-600 hover:text-pink-700 underline underline-offset-2 ml-1 inline-flex items-center gap-1"
          >
            <UserPlus className="w-3 h-3" strokeWidth={1.5} />
            成為諮商師
          </a>
        </p>
      </footer>
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
              <Award className="w-3 h-3" strokeWidth={1.5} /> {therapist.yearsExperience} 年資歷
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
        <span className="text-petal-muted text-xs"> / {therapist.sessionMinutes} 分鐘</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onViewProfile}
          data-testid="therapist-profile-button"
          className="px-3.5 py-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-[13px] font-medium"
        >
          完整檔案
        </button>
        <button
          onClick={onBook}
          data-testid="therapist-book-button"
          className="px-4 py-2 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors font-body text-[13px] font-medium"
        >
          預約諮詢
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
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label="關閉">
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
      showNotification({ type: 'warning', title: '請先登入', message: '登入後即可預約諮詢', duration: 3000 });
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
        title: '預約失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title={`預約 ${therapist.displayName}`} onClose={onClose}>
      <div className="space-y-4" data-testid="consultation-modal">
        <p className="font-body text-sm text-petal-muted">
          {formatNtd(therapist.rateTwd)} / {therapist.sessionMinutes} 分鐘 · 送出後諮商師會與你聯繫安排時間。
        </p>

        <div>
          <label className={fieldLabel}>想談的主題</label>
          <select
            value={focusArea}
            onChange={(e) => setFocusArea(e.target.value as TherapistFocusArea)}
            className={fieldInput}
          >
            <option value="">不指定</option>
            {therapist.focusAreas.map((a) => (
              <option key={a} value={a}>{focusLabel(a)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={fieldLabel}>想聊聊的事（選填）</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="簡單描述你們目前的狀況或想處理的議題…"
            className={`${fieldInput} resize-none`}
            data-testid="consultation-message"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={fieldLabel}>聯絡 Email（選填）</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="預設使用帳號 Email"
              className={fieldInput}
            />
          </div>
          <div>
            <label className={fieldLabel}>希望的時段（選填）</label>
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
          {submitting ? '送出中…' : '送出預約'}
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
  <ModalShell title="我的預約" onClose={onClose}>
    {consultations.length === 0 ? (
      <p className="font-body text-sm text-petal-muted py-6 text-center">
        還沒有預約紀錄。挑一位諮商師開始吧。
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
                      你是諮商師 · 來自 {c.requesterName}
                    </span>
                  )}
                </div>
                <span className={`font-body text-xs font-medium ${status.cls}`}>{status.label}</span>
              </div>
              {isPaidSession && (
                <div className="mt-1 inline-flex items-center gap-1.5 font-body text-[11px]">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-50 border border-pink-200 text-pink-700">
                    <Video className="w-3 h-3" strokeWidth={1.5} /> 視訊諮商
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
                  主題：{focusLabel(c.focusArea)}
                </div>
              )}
              {c.message && (
                <p className="mt-1.5 font-body text-sm text-petal-ink-soft line-clamp-3">{c.message}</p>
              )}
              {c.preferredTime && (
                <div className="mt-1.5 inline-flex items-center gap-1 font-body text-xs text-petal-muted">
                  <Clock className="w-3 h-3" strokeWidth={1.5} />
                  希望時段：{new Date(c.preferredTime).toLocaleString('zh-TW')}
                </div>
              )}
              {c.responseNote && (
                <p className="mt-2 font-body text-sm text-petal-sage-deep">
                  諮商師回覆：{c.responseNote}
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
                進入諮商室{c.messageCount > 0 ? ` (${c.messageCount})` : ''}
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
    showNotification({ type: 'error', title: '操作失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 4000 });

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
      showNotification({ type: 'success', title: '已設定會議連結', message: '對方付款後即可看到連結', duration: 3000 });
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
            <Wallet className="w-3.5 h-3.5" strokeWidth={1.5} /> {busy ? '前往付款…' : `前往付款 ${c.priceTwd ? formatNtd(c.priceTwd) : ''}`}
          </button>
        </div>
      );
    }
    if (c.paymentStatus === 'pending') {
      return <p className="mt-2 font-body text-xs text-petal-muted">付款確認中，稍候會自動更新。</p>;
    }
    if (c.paymentStatus === 'paid') {
      return c.meetingUrl ? (
        <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" data-testid="join-meeting-link"
          className="mt-3 mr-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-petal-sage-deep text-white hover:opacity-90 transition-opacity font-body text-xs font-medium">
          <Video className="w-3.5 h-3.5" strokeWidth={1.5} /> 加入{MEETING_LABEL[c.meetingProvider || 'other']}視訊
        </a>
      ) : (
        <p className="mt-2 font-body text-xs text-petal-sage-deep">已付款，等待諮商師提供會議連結。</p>
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
            className="px-3 py-1.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 font-body text-xs font-medium">接受預約</button>
          <button onClick={() => respond('decline')} disabled={busy}
            className="px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink font-body text-xs">婉拒</button>
        </div>
      );
    }
    if (c.status === 'accepted') {
      return (
        <div className="mt-3 space-y-2">
          {c.meetingUrl ? (
            <div className="inline-flex items-center gap-1.5 font-body text-xs text-petal-sage-deep">
              <Video className="w-3.5 h-3.5" strokeWidth={1.5} /> 會議連結已提供（{MEETING_LABEL[c.meetingProvider || 'other']}）
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select value={provider} onChange={(e) => setProvider(e.target.value as MeetingProvider)} className="px-2 py-1.5 rounded-md border border-petal-rule bg-petal-cream font-body text-xs text-petal-ink">
                <option value="meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="other">其他</option>
              </select>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="貼上會議連結 https://…" data-testid="meeting-link-input"
                className="flex-1 min-w-[180px] px-3 py-1.5 rounded-md border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-xs text-petal-ink" />
              <button onClick={saveMeeting} disabled={busy || !url.trim()} data-testid="save-meeting-link"
                className="px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50 font-body text-xs font-medium">設定連結</button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => respond('complete')} disabled={busy} data-testid="complete-booking"
              className="px-3 py-1.5 rounded-full border border-petal-sage text-petal-sage-deep hover:bg-petal-sage/10 disabled:opacity-50 font-body text-xs">標記完成</button>
            <button onClick={() => respond('no_show')} disabled={busy}
              className="px-3 py-1.5 rounded-full border border-petal-rule text-petal-muted hover:border-petal-ink font-body text-xs">未出席</button>
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
  unpaid: '尚未付款',
  pending: '付款確認中',
  paid: '已付款',
  refunded: '已退款',
  failed: '付款失敗',
};

const MEETING_LABEL: Record<string, string> = { zoom: 'Zoom', meet: 'Google Meet', other: '視訊' };

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
      showNotification({ type: 'error', title: '預約失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 4000 });
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`預約視訊諮商 · ${therapistName}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-petal-cream-2 border border-petal-rule px-4 py-3">
          <span className="font-body text-sm text-petal-ink-soft">1:1 視訊諮商 · {sessionMinutes} 分鐘</span>
          <span className="font-display text-lg text-pink-600">{formatNtd(priceTwd)}</span>
        </div>
        <p className="font-body text-xs text-petal-muted">
          視訊以 Zoom / Google Meet 進行，諮商師接受預約後會提供會議連結。付款由綠界 ECPay 或藍新金流處理。
        </p>
        <div>
          <label className={fieldLabel}>希望的時段（選填）</label>
          <input type="datetime-local" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label className={fieldLabel}>想先讓諮商師知道的事（選填）</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} className={`${fieldInput} resize-none`} />
        </div>
        <div>
          <label className={fieldLabel}>付款方式</label>
          <PaymentMethodPicker value={payProvider} onChange={setPayProvider} disabled={busy} />
        </div>
        <button
          onClick={proceed}
          disabled={busy}
          data-testid="video-pay-button"
          className="w-full py-3 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50 transition-colors font-display italic text-base"
        >
          {busy ? '前往付款…' : `前往付款 ${formatNtd(priceTwd)}`}
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
      showNotification({ type: 'success', title: '已更新', message: res.message, duration: 3500 });
    } catch (err) {
      showNotification({ type: 'error', title: '操作失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-2.5 border-b border-petal-rule bg-petal-cream-2/60" data-testid="publish-controls">
      {proposing ? (
        <div className="space-y-2">
          <p className="font-body text-[11px] text-petal-muted">
            匿名公開這段對話，幫助有相同困擾的人。對方同意後才會公開，個案姓名不會顯示。
          </p>
          <div className="flex items-center gap-2">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              maxLength={200}
              placeholder="幫這則公開問答下個標題…"
              data-testid="publish-title-input"
              className="flex-1 px-3 py-1.5 rounded-full border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink"
            />
            <button
              onClick={() => run(() => apiService.requestPublishConsultation(consultationId, titleDraft.trim()))}
              disabled={busy || !titleDraft.trim()}
              data-testid="publish-submit"
              className="shrink-0 px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-40 font-body text-xs font-medium"
            >
              送出提議
            </button>
            <button onClick={() => { setProposing(false); setTitleDraft(''); }} className="shrink-0 text-petal-muted hover:text-petal-ink font-body text-xs">
              取消
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
                設為公開問答
              </button>
            )}
            {iRequested && (
              <button onClick={() => run(() => apiService.withdrawPublishConsultation(consultationId))} disabled={busy} className="font-body text-xs text-petal-muted hover:text-petal-ink disabled:opacity-40">
                取消提議
              </button>
            )}
            {iCanApprove && (
              <>
                <button onClick={() => run(() => apiService.approvePublishConsultation(consultationId))} disabled={busy} data-testid="publish-approve" className="px-3 py-1 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40 font-body text-xs font-medium">
                  同意公開
                </button>
                <button onClick={() => run(() => apiService.withdrawPublishConsultation(consultationId))} disabled={busy} className="font-body text-xs text-petal-muted hover:text-petal-ink disabled:opacity-40">
                  婉拒
                </button>
              </>
            )}
            {published && (
              <button onClick={() => run(() => apiService.withdrawPublishConsultation(consultationId))} disabled={busy} data-testid="publish-withdraw" className="font-body text-xs text-petal-muted hover:text-petal-ink disabled:opacity-40">
                取消公開
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
      .catch((err) => { if (alive) showNotification({ type: 'error', title: '無法取得收入', message: err instanceof Error ? err.message : '請稍後再試', duration: 4000 }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [showNotification]);

  return (
    <ModalShell title="我的收入" onClose={onClose}>
      {loading ? (
        <p className="font-body text-sm text-petal-muted py-6 text-center">載入中…</p>
      ) : !earnings ? (
        <p className="font-body text-sm text-petal-muted py-6 text-center">尚無收入資料。</p>
      ) : (
        <div className="space-y-4" data-testid="earnings-modal">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-petal-rule p-4">
              <div className="font-body text-xs text-petal-muted">累計實拿</div>
              <div className="font-display text-2xl text-pink-600">{formatNtd(earnings.totalNetTwd)}</div>
              <div className="font-body text-[11px] text-petal-muted mt-0.5">{earnings.paidSessionCount} 次已付款諮商</div>
            </div>
            <div className="rounded-md border border-petal-rule p-4">
              <div className="font-body text-xs text-petal-muted">目前平台分潤</div>
              <div className="font-display text-2xl text-petal-ink">{earnings.currentFeeRate}%</div>
              <div className="font-body text-[11px] text-petal-muted mt-0.5">
                {earnings.introSessionsRemaining > 0
                  ? `新進優惠剩 ${earnings.introSessionsRemaining} 次（10%）`
                  : '已套用一般分潤（20%）'}
              </div>
            </div>
          </div>
          <p className="font-body text-[11px] text-petal-muted">
            視訊諮商款項由平台每月結算後撥付。問答分潤另計（每月結算）。
          </p>
          {earnings.sessions.length > 0 && (
            <div className="space-y-2">
              <div className="font-body text-xs font-semibold text-petal-ink-soft">已付款的諮商</div>
              {earnings.sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-petal-rule px-3 py-2 font-body text-xs">
                  <span className="text-petal-muted">
                    {s.paidAt ? new Date(s.paidAt).toLocaleDateString('zh-TW') : '—'} · 平台 {s.feeRate}%
                  </span>
                  <span className="text-petal-ink">
                    {formatNtd(s.priceTwd)} → <span className="text-pink-600 font-medium">實拿 {formatNtd(s.therapistNetTwd)}</span>
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
        title: '送出失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
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
            <h3 className="font-display text-lg font-medium text-petal-ink">諮商室 · {consultation.therapistName}</h3>
            <p className="font-body text-xs text-petal-muted">
              你們與諮商師的對話 — 可引用記錄過的「對話」一起討論
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label="關閉">
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
            想更深入談談？預約 1:1 視訊諮商（{formatNtd(consultation.therapistRateTwd || 0)} / {consultation.therapistSessionMinutes || 50} 分鐘）
          </button>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="chat-messages">
          {!thread ? (
            <p className="text-center font-body text-sm text-petal-muted">載入中…</p>
          ) : thread.messages.length === 0 ? (
            <p className="text-center font-body text-sm text-petal-muted py-8">
              還沒有訊息。打個招呼，開始你們的對話吧。
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
                      {m.isTherapist ? `${m.senderName}（諮商師）` : m.senderName}
                    </span>
                  </div>
                  {m.event && (
                    <div className="mb-1 px-3 py-2 rounded-lg bg-petal-cream-2 border border-petal-rule max-w-full">
                      <div className="font-body text-[10px] uppercase tracking-wide text-petal-muted">引用對話</div>
                      <div className="font-body text-xs font-medium text-petal-ink">{m.event.title}</div>
                      <div className="font-body text-xs text-petal-ink-soft line-clamp-2">{m.event.summary}</div>
                    </div>
                  )}
                  <div
                    className={`px-3.5 py-2 rounded-2xl font-body text-sm ${
                      m.isMine
                        ? 'bg-petal-ink text-petal-cream rounded-br-sm'
                        : m.isTherapist
                          ? 'bg-pink-100 text-petal-ink rounded-bl-sm'
                          : 'bg-petal-cream-2 text-petal-ink rounded-bl-sm'
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
              <span className="font-body text-xs text-petal-ink-soft truncate">引用：{selectedEvent.title}</span>
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
                title="引用對話"
                className="shrink-0 p-2 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
              >
                <StickyNote className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="輸入訊息…"
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
              <h4 className="font-display text-base text-petal-ink">引用一段對話</h4>
              <button onClick={() => setShowEventPicker(false)} className="text-petal-muted hover:text-petal-ink"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-2" data-testid="event-picker">
              {events.length === 0 ? (
                <p className="font-body text-sm text-petal-muted text-center py-6">
                  你們還沒有記錄過對話。
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
  pending: { label: '審核中', cls: 'text-petal-rose-deep' },
  approved: { label: '已上架', cls: 'text-petal-sage-deep' },
  suspended: { label: '已暫停（暫時下架）', cls: 'text-petal-muted' },
  rejected: { label: '未通過', cls: 'text-petal-muted' },
};

const IDENTITY_LABEL: Record<string, string> = {
  unverified: '尚未提交文件',
  submitted: '文件審核中',
  verified: '身分已驗證',
  rejected: '文件已退回',
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
      showNotification({ type: 'error', title: '上傳失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 4000 });
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
      showNotification({ type: 'success', title: '文件已上傳', message: '等待管理員審核', duration: 3000 });
    } catch (err) {
      showNotification({ type: 'error', title: '上傳失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 4000 });
    } finally {
      setUploadingDoc(false);
    }
  };

  const save = async () => {
    if (!displayName.trim()) {
      showNotification({ type: 'warning', title: '請填寫姓名', message: '姓名不能為空', duration: 3000 });
      return;
    }
    if (focusAreas.length === 0) {
      showNotification({ type: 'warning', title: '請選擇專長', message: '請至少選擇一個專長領域', duration: 3000 });
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
      showNotification({ type: 'error', title: '儲存失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 4000 });
    } finally {
      setSaving(false);
    }
  };

  const status = STATUS_LABEL[profile.status];

  return (
    <ModalShell title="我的諮商師檔案" onClose={onClose}>
      <div className="space-y-4" data-testid="therapist-profile-editor">
        {/* Status banner */}
        <div className="rounded-md border border-petal-rule p-3 bg-petal-cream-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-petal-muted">上架狀態</span>
            <span className={`font-body text-xs font-medium ${status.cls}`}>{status.label}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-petal-muted">Email 驗證</span>
            <span className={`inline-flex items-center gap-1 font-body text-xs font-medium ${profile.emailVerified ? 'text-petal-sage-deep' : 'text-petal-rose-deep'}`}>
              {profile.emailVerified
                ? (<><CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> 已驗證</>)
                : (<><AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} /> 未驗證（請查收驗證信）</>)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-petal-muted">身分文件</span>
            <span className="font-body text-xs font-medium text-petal-ink-soft">{IDENTITY_LABEL[identityStatus] || identityStatus}</span>
          </div>
          {profile.reviewNote && (
            <p className="font-body text-xs text-petal-ink-soft pt-1">管理員備註：{profile.reviewNote}</p>
          )}
        </div>

        {/* Photo */}
        <div>
          <label className={fieldLabel}>大頭照</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 shrink-0 rounded-full overflow-hidden bg-petal-cream-2 border border-petal-rule flex items-center justify-center">
              {photoUrl
                ? <img src={photoUrl} alt={displayName} className="w-full h-full object-contain" />
                : <Heart className="w-7 h-7 text-pink-300" strokeWidth={1.5} />}
            </div>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs">
              <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
              {uploadingPhoto ? '上傳中…' : '更換照片'}
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
            <label className={fieldLabel}>姓名</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>職稱</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="諮商心理師 / 臨床心理師" className={fieldInput} />
          </div>
        </div>

        {/* Focus areas */}
        <div>
          <label className={fieldLabel}>專長領域</label>
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
          <label className={fieldLabel}>自訂專長 / 取向（最多 8 個）</label>
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
              placeholder="例如：EMDR、創傷知情、CBT…"
              className={fieldInput}
            />
            <button type="button" onClick={addCustom} className="shrink-0 px-3 rounded-md bg-petal-ink text-petal-cream font-body text-xs">新增</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={fieldLabel}>年資</label>
            <input type="number" min={0} max={80} value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>費率 (NT$)</label>
            <input type="number" min={0} max={100000} value={rateTwd} onChange={(e) => setRateTwd(e.target.value)} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>時長 (分)</label>
            <input type="number" min={10} max={240} value={sessionMinutes} onChange={(e) => setSessionMinutes(e.target.value)} className={fieldInput} />
          </div>
        </div>

        <div>
          <label className={fieldLabel}>聯絡電話</label>
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={40} className={fieldInput} />
        </div>

        <div>
          <label className={fieldLabel}>自我介紹</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={2000} className={`${fieldInput} resize-none`} />
        </div>

        {/* Rich profile sections (048) */}
        <div className="pt-1 border-t border-petal-rule">
          <div className="font-body text-xs font-semibold text-petal-ink-soft mb-1">完整檔案（選填）</div>
          <p className="font-body text-[11px] text-petal-muted mb-3">這些內容會顯示在「完整檔案」頁面，幫助來談者更認識你。清單欄位請一行一項。</p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={acceptingNewClients} onChange={(e) => setAcceptingNewClients(e.target.checked)} className="accent-pink-500" />
          <span className="font-body text-sm text-petal-ink-soft">目前開放新案預約</span>
        </label>

        <div>
          <label className={fieldLabel}>給來談者的一段話</label>
          <textarea value={introMessage} onChange={(e) => setIntroMessage(e.target.value)} rows={4} maxLength={8000} className={`${fieldInput} resize-y`} placeholder="想對正在考慮預約的人說的話…" />
        </div>
        <div>
          <label className={fieldLabel}>治療取向／治療理念</label>
          <textarea value={approach} onChange={(e) => setApproach(e.target.value)} rows={4} maxLength={8000} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>認識治療師</label>
          <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} maxLength={8000} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>心理師證照（一行一項）</label>
          <textarea value={certifications} onChange={(e) => setCertifications(e.target.value)} rows={2} className={`${fieldInput} resize-y`} placeholder="諮商心理師證書字號／諮心字第 0000 號" />
        </div>
        <div>
          <label className={fieldLabel}>現任（一行一項）</label>
          <textarea value={currentPositions} onChange={(e) => setCurrentPositions(e.target.value)} rows={2} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>專業資格（一行一項）</label>
          <textarea value={qualifications} onChange={(e) => setQualifications(e.target.value)} rows={2} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>專業訓練（一行一項）</label>
          <textarea value={training} onChange={(e) => setTraining(e.target.value)} rows={3} className={`${fieldInput} resize-y`} />
        </div>
        <div>
          <label className={fieldLabel}>心理專業著作（一行一項，可加「標題 | 來源」）</label>
          <textarea value={publications} onChange={(e) => setPublications(e.target.value)} rows={2} className={`${fieldInput} resize-y`} placeholder="文章標題 | 張老師月刊 No.567" />
        </div>
        <div>
          <label className={fieldLabel}>心理專業文章 / 影音（一行一項，可加「標題 | 連結」）</label>
          <textarea value={articles} onChange={(e) => setArticles(e.target.value)} rows={3} className={`${fieldInput} resize-y`} placeholder="文章標題 | https://…" />
        </div>

        {/* Identity documents */}
        <div>
          <label className={fieldLabel}>證照 / 身分證明文件</label>
          {documents.length > 0 && (
            <div className="space-y-1 mb-2">
              {documents.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block font-body text-xs text-pink-600 underline underline-offset-2">
                  📎 文件 {i + 1}
                </a>
              ))}
            </div>
          )}
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors font-body text-xs">
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
            {uploadingDoc ? '上傳中…' : '上傳文件'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ''; }}
            />
          </label>
          <p className="mt-1.5 font-body text-[11px] text-petal-muted">文件僅供管理員審核，不會公開顯示。</p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          data-testid="save-therapist-profile"
          className="w-full py-2.5 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-50 transition-colors font-body text-sm font-medium"
        >
          {saving ? '儲存中…' : '儲存檔案'}
        </button>
      </div>
    </ModalShell>
  );
};

export default TherapistsView;
