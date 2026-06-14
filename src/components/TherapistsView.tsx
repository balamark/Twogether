import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Sparkles, X, UserPlus, Clock, Languages, Award, CalendarCheck, MessageCircle, Send, StickyNote, UserCog, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  apiService,
  type Therapist,
  type TherapistFocusArea,
  type TherapistConsultation,
  type ConsultationThread,
  type EventRecord,
  type OwnTherapistProfile,
  type TherapistProfileUpdate,
} from '../services/api';
import type { Notification } from './ErrorNotification';
import { useScrollLock } from '../hooks/useScrollLock';

interface TherapistsViewProps {
  authState: {
    user: { id: string; nickname?: string } | null;
    isAuthenticated: boolean;
    partnerConnected: boolean;
  };
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

// Focus areas — keep the value/label/emoji in one place so the filter chips,
// cards, and forms all read from the same source of truth. Order matches the
// backend FOCUS_AREAS list in routes/therapists.js.
const FOCUS_AREAS: { id: TherapistFocusArea; label: string; emoji: string }[] = [
  { id: 'couple', label: '伴侶關係', emoji: '💞' },
  { id: 'family', label: '家庭', emoji: '🏡' },
  { id: 'childhood', label: '童年/原生家庭', emoji: '🧸' },
  { id: 'individual', label: '個人成長', emoji: '🌱' },
  { id: 'sexuality', label: '性與親密', emoji: '🔥' },
  { id: 'parenting', label: '親職教養', emoji: '👶' },
  { id: 'grief', label: '悲傷失落', emoji: '🕊️' },
  { id: 'anxiety', label: '焦慮憂鬱', emoji: '🌧️' },
  { id: 'depression', label: '憂鬱情緒', emoji: '🌫️' },
  { id: 'trauma', label: '創傷', emoji: '💔' },
  { id: 'addiction', label: '成癮', emoji: '🎯' },
  { id: 'lgbtq', label: '性別與多元認同', emoji: '🏳️‍🌈' },
  { id: 'career', label: '職涯/工作壓力', emoji: '💼' },
  { id: 'self_esteem', label: '自我價值', emoji: '✨' },
];

const focusLabel = (id: string): string =>
  FOCUS_AREAS.find((f) => f.id === id)?.label || id;

const LANGUAGE_LABEL: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};
const languageLabel = (code: string): string => LANGUAGE_LABEL[code] || code;

const formatNtd = (n: number): string => `NT$${n.toLocaleString('en-US')}`;

const CONSULTATION_STATUS: Record<TherapistConsultation['status'], { label: string; cls: string }> = {
  pending: { label: '等待回覆', cls: 'text-petal-rose-deep' },
  accepted: { label: '已接受', cls: 'text-petal-sage-deep' },
  declined: { label: '已婉拒', cls: 'text-petal-muted' },
  completed: { label: '已完成', cls: 'text-petal-sage-deep' },
  cancelled: { label: '已取消', cls: 'text-petal-muted' },
};

const TherapistsView: React.FC<TherapistsViewProps> = ({ authState, showNotification }) => {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusFilter, setFocusFilter] = useState<TherapistFocusArea | 'all'>('all');

  const [bookingTarget, setBookingTarget] = useState<Therapist | null>(null);
  const [showMine, setShowMine] = useState(false);
  const [chatTarget, setChatTarget] = useState<TherapistConsultation | null>(null);
  const [consultations, setConsultations] = useState<TherapistConsultation[]>([]);
  const [consultationsLoaded, setConsultationsLoaded] = useState(false);

  // The logged-in user's own therapist profile (if they are a therapist), so we
  // can offer a "我的諮商師檔案" editor.
  const [ownProfile, setOwnProfile] = useState<OwnTherapistProfile | null>(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);

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
      {/* Intro */}
      <div className="text-center max-w-2xl mx-auto">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 心理諮商
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
          與真人 <em className="not-italic italic text-pink-600">諮商心理師</em> 聊聊
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          有些議題值得和一位受過專業訓練的人好好談。選擇一位諮商師，預約屬於你們的對話。
        </p>

        {/* AI rephrase remains the cheaper, always-on option */}
        <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-petal-rule bg-petal-cream-2">
          <Sparkles className="w-3.5 h-3.5 text-pink-500" strokeWidth={1.5} />
          <span className="font-body text-xs text-petal-ink-soft">
            只是想換個溫柔的說法？<span className="text-petal-ink">AI 潤稿</span> 仍隨時為你服務，且更省。
          </span>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Sign-up is a public, no-login page (served by the backend at
            /therapist-signup) so therapists can apply without an account. */}
        <a
          href="/therapist-signup"
          data-testid="therapist-apply-button"
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors font-body text-[13px] font-medium"
        >
          <UserPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
          成為諮商師
        </a>
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
      </div>

      {/* Focus filter */}
      <div className="flex flex-wrap justify-center gap-1.5">
        <FilterChip
          active={focusFilter === 'all'}
          onClick={() => setFocusFilter('all')}
          label="全部"
          emoji="✨"
        />
        {FOCUS_AREAS.map((f) => (
          <FilterChip
            key={f.id}
            active={focusFilter === f.id}
            onClick={() => setFocusFilter(f.id)}
            label={f.label}
            emoji={f.emoji}
          />
        ))}
      </div>

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
            <TherapistCard key={t.id} therapist={t} onBook={() => setBookingTarget(t)} />
          ))}
        </div>
      )}

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

      {showMine && (
        <MyConsultationsModal
          consultations={consultations}
          onClose={() => setShowMine(false)}
          onOpenRoom={(c) => setChatTarget(c)}
        />
      )}

      {chatTarget && (
        <ChatRoom
          consultation={chatTarget}
          onClose={() => { setChatTarget(null); setConsultationsLoaded(false); loadConsultations(); }}
          showNotification={showNotification}
        />
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
    </div>
  );
};

// --- Filter chip ----------------------------------------------------------

const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string; emoji: string }> = ({
  active, onClick, label, emoji,
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-colors border font-body text-[13px] font-medium tracking-tight ${
      active
        ? 'bg-petal-ink text-petal-cream border-petal-ink'
        : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
    }`}
  >
    <span>{emoji}</span>
    <span>{label}</span>
  </button>
);

// --- Therapist card -------------------------------------------------------

const TherapistCard: React.FC<{ therapist: Therapist; onBook: () => void }> = ({ therapist, onBook }) => (
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
      <button
        onClick={onBook}
        data-testid="therapist-book-button"
        className="px-4 py-2 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors font-body text-[13px] font-medium"
      >
        預約諮詢
      </button>
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
}> = ({ consultations, onClose, onOpenRoom }) => (
  <ModalShell title="我的預約" onClose={onClose}>
    {consultations.length === 0 ? (
      <p className="font-body text-sm text-petal-muted py-6 text-center">
        還沒有預約紀錄。挑一位諮商師開始吧。
      </p>
    ) : (
      <div className="space-y-3" data-testid="my-consultations">
        {consultations.map((c) => {
          const status = CONSULTATION_STATUS[c.status];
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
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await apiService.getConsultationMessages(consultation.id);
      setThread(t);
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  }, [consultation.id]);

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
              你們與諮商師的對話 — 可引用記錄過的「事件」一起討論
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label="關閉">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

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
                  <div className="font-body text-[11px] text-petal-muted mb-0.5 px-1">
                    {m.isTherapist ? `🩺 ${m.senderName}（諮商師）` : m.senderName}
                  </div>
                  {m.event && (
                    <div className="mb-1 px-3 py-2 rounded-lg bg-petal-cream-2 border border-petal-rule max-w-full">
                      <div className="font-body text-[10px] uppercase tracking-wide text-petal-muted">引用事件</div>
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
                title="引用事件"
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

      {/* Event picker overlay */}
      {showEventPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowEventPicker(false)}>
          <div className="bg-petal-cream w-full max-w-md max-h-[70vh] overflow-y-auto rounded-lg border border-petal-rule shadow-petal" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-petal-cream flex items-center justify-between px-4 py-3 border-b border-petal-rule">
              <h4 className="font-display text-base text-petal-ink">引用一個事件</h4>
              <button onClick={() => setShowEventPicker(false)} className="text-petal-muted hover:text-petal-ink"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-2" data-testid="event-picker">
              {events.length === 0 ? (
                <p className="font-body text-sm text-petal-muted text-center py-6">
                  你們還沒有記錄過事件。
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
