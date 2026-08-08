import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  Tag,
  Loader2,
  Lock,
  Sparkles,
  HeartHandshake,
  HandHeart,
  Globe,
  Users,
  RotateCcw,
  X,
  Pencil,
  NotebookPen,
  Sprout,
  Gauge,
  PlayCircle,
} from 'lucide-react';
import apiService, {
  type EventRecord,
  type EventStatus,
  type ReplyRewritePreview,
  type EmotionAcceptancePreview,
  type EventVersionKey,
  type MessageTranslationMap,
  type TherapyNote,
  type DraftAnalysis,
  type FacilitationSession,
} from '../services/api';
import ReplyStepBar from './ReplyStepBar';
import MessageTranslationCard from './MessageTranslationCard';
import TherapyNoteCard from './TherapyNoteCard';
import ConflictBanner from './ConflictBanner';
import DraftEmotionMeter from './DraftEmotionMeter';
import { detectDraftTone, draftToneHint } from '../utils/conflictState';
import TherapistTurnCard from './TherapistTurnCard';
import SessionProgress from './SessionProgress';
import { useScrollLock } from '../hooks/useScrollLock';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';
import { companionName, resolveCompanion } from '../utils/aiCompanions';
import { useAiQuota } from '../hooks/useAiQuota';
import AiQuotaHint from './AiQuotaHint';
import ParticipantAvatar from './ParticipantAvatar';
import CloseTogetherBar from './closure/CloseTogetherBar';
import CloseTogetherModal from './closure/CloseTogetherModal';
import ClosurePanel from './closure/ClosurePanel';
import ClosureSummaryCard from './closure/ClosureSummaryCard';

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface EventDetailProps {
  eventId: string;
  currentUserId: string;
  // The viewer's chosen AI 諮商師 (null = default Luma); names the invite
  // button and the counselor preview.
  companionId?: string | null;
  // Display names for the message cards (who said what).
  myNickname?: string;
  partnerNickname?: string;
  onBack: () => void;
  showNotification: (n: NotificationInput) => void;
}

function statusPill(status: EventStatus) {
  switch (status) {
    // 'resolve_pending' is a legacy row from the retired 標記為解決 handshake.
    // It behaves like 'open' everywhere: same pill, same 一起收尾 bar.
    case 'open':
    case 'resolve_pending':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-petal-rose/30 text-petal-ink">未解決</span>;
    case 'closing':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink inline-flex items-center gap-1">
          <Sprout className="w-3 h-3" />
          收尾中
        </span>
      );
    case 'resolved':
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/30 text-petal-ink inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          已解決
        </span>
      );
  }
}

function formatTime(iso: string, tz: string) {
  if (!iso) return '';
  try {
    return formatDateTime(iso, tz);
  } catch {
    return iso;
  }
}

// Matches the event_messages CHECK constraint and the route validator
// (database/migrations/029_events.sql, routes/events.js POST /:id/messages).
const REPLY_MAX_CHARS = 2000;

export default function EventDetail({ eventId, currentUserId, companionId, myNickname, partnerNickname, onBack, showNotification }: EventDetailProps) {
  const myCompanion = resolveCompanion(companionId);
  const { quota, refresh: refreshQuota } = useAiQuota();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  // Applied rewrites, inserted phrases and the emotion-meter suggestion all set
  // the draft directly, bypassing the textarea's maxLength — so guard on the
  // composed value, not on typing.
  const replyOver = reply.length > REPLY_MAX_CHARS;
  const [sending, setSending] = useState(false);
  const sendLockRef = useRef(false);
  const [resolving, setResolving] = useState(false);
  // 一起收尾 (Batch 1) — only the confirm sheet's boolean lives here; the panel
  // owns the closure fetch and every mutation. The summary card is kept in
  // sync with the event refresh in the resolved block below.
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closureSummary, setClosureSummary] = useState<import('../services/api').EventClosure | null>(null);
  const [retryingInsight, setRetryingInsight] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [rewritePreview, setRewritePreview] = useState<ReplyRewritePreview | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptancePreview, setAcceptancePreview] = useState<EmotionAcceptancePreview | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [draftAnalysis, setDraftAnalysis] = useState<DraftAnalysis | null>(null);
  const [aiInviting, setAiInviting] = useState(false);
  const [aiPosting, setAiPosting] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [shareWarnOpen, setShareWarnOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharePartnerOpen, setSharePartnerOpen] = useState(false);
  const [sharingPartner, setSharingPartner] = useState(false);
  // Post-send editing: creator edits title/summary; each side edits own messages.
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerTitle, setHeaderTitle] = useState('');
  const [headerSummary, setHeaderSummary] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translations, setTranslations] = useState<MessageTranslationMap>({});
  const [translationLoading, setTranslationLoading] = useState(false);
  // Kept after the toast fades so an unfinished batch stays explained on screen.
  const [translationNotice, setTranslationNotice] =
    useState<{ code?: string; message: string } | null>(null);
  const [therapyNote, setTherapyNote] = useState<TherapyNote | null>(null);
  const [therapyLoading, setTherapyLoading] = useState(false);
  // 引導模式 (Therapist Mode)
  const [facilitation, setFacilitation] = useState<FacilitationSession | null>(null);
  const [facilitating, setFacilitating] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  // Quota ran out mid-session: pause auto-advance so each further reply doesn't
  // re-fire the same warning toast. Cleared on event change / next success.
  const [advancePaused, setAdvancePaused] = useState(false);
  const tz = useTimezone();

  const insertPhrase = (phrase: string) => {
    setReply((prev) => (prev.trim().length > 0 ? `${prev}\n${phrase}` : phrase));
  };

  const requestDraftAnalysis = async () => {
    const draft = reply.trim();
    if (!draft) return;
    setAnalyzing(true);
    try {
      const analysis = await apiService.analyzeDraft(eventId, draft);
      setDraftAnalysis(analysis);
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: '今日 AI 次數已用完',
          message: '情緒檢測次數已達今日上限，升級 Premium 可提高每日上限，或先用下方的步驟提示自己檢查。',
        });
      } else {
        showNotification({
          type: 'error',
          title: '情緒檢測失敗',
          message: err instanceof Error ? err.message : '請稍後再試',
        });
      }
    } finally {
      setAnalyzing(false);
      refreshQuota();
    }
  };

  const requestRewrite = async () => {
    const draft = reply.trim();
    if (!draft) return;
    setRewriting(true);
    try {
      const preview = await apiService.previewReplyRewrite(eventId, draft);
      setRewritePreview(preview);
    } catch (err) {
      // A reached daily quota is an expected state, not a red failure.
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: '今日 AI 次數已用完',
          message: '明天會自動補上；升級 Premium 可提高每日上限。你也可以直接送出自己寫的版本。',
        });
      } else if (code === 'REWRITE_TOO_LONG') {
        // Expected for a very long draft — the model ran out of room to return
        // three full-length versions. Tell them how to get unstuck.
        showNotification({
          type: 'warning',
          title: 'AI 改寫沒完成',
          message: err instanceof Error ? err.message : '請縮短草稿，或分成兩則分開改寫送出。',
        });
      } else {
        showNotification({
          type: 'error',
          title: 'AI 改寫失敗',
          message: err instanceof Error ? err.message : '請稍後再試',
        });
      }
    } finally {
      setRewriting(false);
      refreshQuota();
    }
  };

  const applyRewriteVersion = (key: EventVersionKey) => {
    if (!rewritePreview) return;
    const text = rewritePreview.versions[key];
    setReply(text);
    setRewritePreview(null);
    // The rewrite matches the draft's length and warm adds a sentence on top of
    // firm, so a long draft can come back over the cap. Say so now rather than
    // letting the send button look broken.
    if (text.length > REPLY_MAX_CHARS) {
      showNotification({
        type: 'info',
        title: '這個版本超過字數上限',
        message: `這個版本 ${text.length} 字，超過 ${REPLY_MAX_CHARS} 字上限，請刪掉 ${text.length - REPLY_MAX_CHARS} 字再送出，或分成兩則送出。`,
      });
    }
  };

  const requestAcceptance = async () => {
    setAccepting(true);
    try {
      const preview = await apiService.previewEmotionAcceptance(eventId);
      setAcceptancePreview(preview);
    } catch (err) {
      // A reached daily quota is an expected state (the global paywall already
      // surfaces it) — show it as a gentle warning, not a red failure.
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: '今日 AI 次數已用完',
          message: '今天的 AI 接住建議次數已達上限，升級 Premium 可提高每日上限，或先用下方的步驟提示自己回應。',
        });
      } else {
        showNotification({
          type: 'error',
          title: 'AI 接住建議失敗',
          message: err instanceof Error ? err.message : '請稍後再試',
        });
      }
    } finally {
      setAccepting(false);
      refreshQuota();
    }
  };

  const insertAcceptance = (text: string) => {
    insertPhrase(text);
    setAcceptancePreview(null);
  };

  // Load the emotion/need translations for the thread's human messages. Cached
  // server-side per message, so this only bills for still-untranslated ones.
  const loadTranslations = async () => {
    setTranslationLoading(true);
    setTranslationNotice(null);
    const startedAt = Date.now();
    console.info('[情緒翻譯] event: loading translations…', { eventId });
    try {
      const res = await apiService.getEventTranslations(eventId);
      const keys = Object.keys(res.translations);
      console.info('[情緒翻譯] event: got translations', {
        eventId,
        count: keys.length,
        requested: res.requested,
        translated: res.translated,
        ms: Date.now() - startedAt,
        keys,
      });
      // Always render what did come back; a partial batch still helps.
      setTranslations(res.translations);
      setTranslationNotice(res.message ? { code: res.error_code, message: res.message } : null);
      if (res.message) {
        console.warn('[情緒翻譯] event: incomplete batch', {
          eventId, code: res.error_code, requested: res.requested, translated: res.translated,
        });
        // A batch the model couldn't finish is an expected degraded state with
        // a next step, not a red failure.
        showNotification({
          type: res.translated === 0 ? 'warning' : 'info',
          title: res.translated === 0 ? '情緒翻譯這次沒完成' : '情緒翻譯完成一部分',
          message: res.message,
        });
      }
    } catch (err) {
      console.error('[情緒翻譯] event: load failed', err);
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: '今日 AI 次數已用完',
          message: '情緒翻譯次數已達今日上限，升級 Premium 可提高每日上限。',
        });
      } else {
        showNotification({
          type: 'error',
          title: '情緒翻譯失敗',
          message: err instanceof Error ? err.message : '請稍後再試',
        });
      }
    } finally {
      setTranslationLoading(false);
      refreshQuota();
    }
  };

  const refresh = async (opts?: { skipFacilitation?: boolean }) => {
    try {
      const data = await apiService.getEvent(eventId);
      setEvent(data);
      setTranslationEnabled(data.translationEnabled);
      setTherapyNote(data.therapyNote);
      if (data.translationEnabled) loadTranslations();
      // Callers that just received fresh session state from a mutation response
      // skip the refetch so it can't race-overwrite the newer value.
      if (!opts?.skipFacilitation) {
        apiService.getFacilitation(eventId).then(setFacilitation).catch(() => {});
      }
      // Mark inbound unread messages as read (fire-and-forget)
      data.messages
        .filter((m) => m.senderId !== currentUserId && !m.readAt)
        .forEach((m) => apiService.markEventMessageRead(eventId, m.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法取得對話詳情');
    }
  };

  const handleToggleTranslation = async () => {
    const next = !translationEnabled;
    setTranslationEnabled(next);
    try {
      await apiService.setEventTranslation(eventId, next);
      if (next) await loadTranslations();
    } catch (err) {
      setTranslationEnabled(!next);
      showNotification({
        type: 'error',
        title: '無法更新情緒翻譯設定',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    }
  };

  const loadTherapyNote = async () => {
    setTherapyLoading(true);
    try {
      const note = await apiService.getEventTherapyNote(eventId);
      setTherapyNote(note);
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: '今日 AI 次數已用完',
          message: '治療摘要次數已達今日上限，升級 Premium 可提高每日上限，明天也會自動補上。',
        });
      } else {
        showNotification({
          type: 'error',
          title: '治療摘要暫時無法產生',
          message: err instanceof Error ? err.message : '請稍後再試',
        });
      }
    } finally {
      setTherapyLoading(false);
      refreshQuota();
    }
  };

  // 引導模式: shared handling for start + advance. Expected states (quota,
  // resolved, unpaired, stale session) surface as warning/info with a next
  // step; red errors are reserved for real failures.
  const handleFacilitationError = (err: unknown, phase: 'start' | 'advance') => {
    const code = (err as { error_code?: string })?.error_code;
    if (code === 'AI_DAILY_LIMIT_REACHED') {
      if (phase === 'advance') setAdvancePaused(true);
      showNotification({
        type: 'warning',
        title: '今日 AI 次數已用完',
        message: '引導練習次數已達今日上限，升級 Premium 可提高每日上限；明天會自動補上，引導也會接著繼續。',
      });
    } else if (code === 'NOT_PAIRED') {
      showNotification({
        type: 'info',
        title: '引導模式需要兩個人',
        message: err instanceof Error ? err.message : '先邀請另一半配對，就能一起練習。',
      });
    } else if (code === 'EVENT_RESOLVED') {
      showNotification({
        type: 'info',
        title: '這段對話已完成',
        message: err instanceof Error ? err.message : '如需再談可先重新開啟對話。',
      });
    } else if (code === 'PRIVATE_EVENT') {
      showNotification({
        type: 'info',
        title: '私人對話不支援引導',
        message: '引導模式需要兩個人一起參與，私人對話只有你看得到。',
      });
    } else if (code === 'NO_SESSION') {
      // Local state is stale (e.g. the partner ended the session) — resync
      // quietly instead of toasting.
      apiService.getFacilitation(eventId).then(setFacilitation).catch(() => {});
    } else {
      showNotification({
        type: 'error',
        title: '引導暫時無法進行',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    }
  };

  const startFacilitation = async () => {
    setFacilitating(true);
    try {
      const res = await apiService.startFacilitation(eventId);
      setFacilitation(res.session);
      setAdvancePaused(false);
      await refresh({ skipFacilitation: true });
    } catch (err) {
      handleFacilitationError(err, 'start');
    } finally {
      setFacilitating(false);
      refreshQuota();
    }
  };

  // After the awaited partner replies, fetch the therapist's next turn.
  const advanceFacilitation = async () => {
    setFacilitating(true);
    try {
      const res = await apiService.advanceFacilitation(eventId);
      setFacilitation(res.session);
      setAdvancePaused(false);
      await refresh({ skipFacilitation: true });
    } catch (err) {
      handleFacilitationError(err, 'advance');
    } finally {
      setFacilitating(false);
      refreshQuota();
    }
  };

  const endFacilitation = async () => {
    setEndingSession(true);
    try {
      const s = await apiService.endFacilitation(eventId);
      setFacilitation(s);
    } catch (err) {
      showNotification({ type: 'error', title: '無法結束引導', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setEndingSession(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setAdvancePaused(false);
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const sendReply = async () => {
    const content = reply.trim();
    if (!content) return;
    if (sendLockRef.current) return; // drop a same-tick second click
    sendLockRef.current = true;
    setSending(true);
    try {
      await apiService.replyToEvent(eventId, content);
      setReply('');
      setDraftAnalysis(null);
      await refresh();
      // In an active session, if the therapist was waiting on me, my reply
      // completes the step — fetch the next facilitated turn. Skipped while
      // paused (quota spent) so we don't re-toast on every reply.
      const myTurn = facilitation && facilitation.status === 'active' &&
        (facilitation.turnOwner === currentUserId || facilitation.turnOwner === null);
      if (myTurn && !advancePaused) await advanceFacilitation();
    } catch (err) {
      showNotification({
        type: 'error',
        title: '送出失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setSending(false);
      sendLockRef.current = false;
    }
  };

  const inviteAiCounselor = async () => {
    setAiInviting(true);
    try {
      const comment = await apiService.previewEventAiComment(eventId);
      setAiPreview(comment);
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: '今日 AI 次數已用完',
          message: `明天會自動補上；升級 Premium 可提高每日上限。${myCompanion.name} 明天還會在。`,
        });
      } else {
        showNotification({
          type: 'error',
          title: 'AI 諮商師暫時無法回應',
          message: err instanceof Error ? err.message : '請稍後再試',
        });
      }
    } finally {
      setAiInviting(false);
      refreshQuota();
    }
  };

  const postAiCounselor = async () => {
    if (!aiPreview) return;
    setAiPosting(true);
    try {
      await apiService.postEventAiComment(eventId, aiPreview);
      setAiPreview(null);
      await refresh();
    } catch (err) {
      showNotification({
        type: 'error',
        title: '貼上失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setAiPosting(false);
    }
  };

  const startHeaderEdit = () => {
    if (!event) return;
    setHeaderTitle(event.title);
    setHeaderSummary(event.summary);
    setEditingHeader(true);
  };

  const saveHeaderEdit = async () => {
    if (!event) return;
    const title = headerTitle.trim();
    const summary = headerSummary.trim();
    if (!title || !summary) {
      showNotification({ type: 'warning', title: '無法儲存', message: '標題與簡介都不能是空白' });
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await apiService.updateEvent(eventId, { title, summary });
      setEvent((prev) => (prev ? { ...prev, title: updated.title, summary: updated.summary, contentEditedAt: updated.contentEditedAt } : prev));
      setEditingHeader(false);
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      showNotification({
        type: code === 'EVENT_RESOLVED' ? 'warning' : 'error',
        title: '編輯失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const startMessageEdit = (id: string, content: string) => {
    setEditingMessageId(id);
    setEditingMessageText(content);
  };

  const saveMessageEdit = async () => {
    if (!editingMessageId) return;
    const content = editingMessageText.trim();
    if (!content) {
      showNotification({ type: 'warning', title: '無法儲存', message: '訊息內容不能是空白' });
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await apiService.updateEventMessage(eventId, editingMessageId, content);
      setEvent((prev) =>
        prev
          ? { ...prev, messages: prev.messages.map((m) => (m.id === updated.id ? { ...m, content: updated.content, editedAt: updated.editedAt } : m)) }
          : prev
      );
      setEditingMessageId(null);
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      showNotification({
        type: code === 'EVENT_RESOLVED' ? 'warning' : 'error',
        title: '編輯失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmShare = async () => {
    setSharing(true);
    try {
      const updated = await apiService.publishEvent(eventId);
      setEvent((prev) => (prev ? { ...prev, publicStatus: updated.publicStatus } : prev));
      setShareWarnOpen(false);
      showNotification({
        type: 'success',
        title: '已匿名公開',
        message: '這段對話會以匿名方式顯示在「公開問答」，謝謝你願意幫助別人。',
      });
    } catch (err) {
      showNotification({ type: 'error', title: '公開失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSharing(false);
    }
  };

  // Step 1 of sharing: turn a private (solo) conversation into a shared one so
  // the partner can see it. One-way; after this the 公開問答 control appears.
  const confirmShareWithPartner = async () => {
    setSharingPartner(true);
    try {
      const updated = await apiService.shareEventWithPartner(eventId);
      setEvent((prev) => (prev ? { ...prev, isPrivate: updated.isPrivate } : prev));
      setSharePartnerOpen(false);
      showNotification({
        type: 'success',
        title: '已分享給伴侶',
        message: '伴侶現在看得到這段對話，你們可以一起討論了。',
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '分享失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setSharingPartner(false);
    }
  };

  const unshare = async () => {
    setSharing(true);
    try {
      const updated = await apiService.unpublishEvent(eventId);
      setEvent((prev) => (prev ? { ...prev, publicStatus: updated.publicStatus } : prev));
      showNotification({ type: 'info', title: '已取消公開', message: '這段對話不再顯示於公開問答。' });
    } catch (err) {
      showNotification({ type: 'error', title: '操作失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSharing(false);
    }
  };

  const handleCloseTogether = async () => {
    setResolving(true);
    try {
      await apiService.startEventClosure(eventId);
      setCloseConfirmOpen(false);
      await refresh();
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      showNotification({
        type: code === 'NOT_PAIRED' || code === 'PRIVATE_EVENT' ? 'info' : 'error',
        title: '無法開始一起收尾',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setResolving(false);
    }
  };

  // Only fetch the summary once the event has actually resolved. Fires again on
  // refresh() so a manual insight retry is reflected.
  useEffect(() => {
    if (event?.status !== 'resolved' || event.isPrivate) {
      setClosureSummary(null);
      return;
    }
    let cancelled = false;
    apiService
      .getEventClosure(eventId)
      .then((c) => {
        if (!cancelled) setClosureSummary(c);
      })
      .catch((err) => {
        // A legacy resolved event has no closure row; that's fine, just don't
        // render the summary card. The route answers CLOSURE_NOT_STARTED for
        // that case — EVENT_NOT_CLOSING is a different gate and never comes back
        // here, so every legacy event used to log a warning.
        const code = (err as { error_code?: string })?.error_code;
        if (code && code !== 'CLOSURE_NOT_STARTED') {
          console.warn('[closure] summary fetch failed', code);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [event?.status, event?.isPrivate, eventId]);

  const handleRetryInsight = async () => {
    setRetryingInsight(true);
    try {
      const next = await apiService.retryClosureInsight(eventId);
      // The route returns the whole serialized closure (it used to return only
      // { insight }, so a SUCCESSFUL retry set this to undefined and unmounted
      // the card). Guard anyway — blanking the summary is the worst outcome here.
      if (next) setClosureSummary(next);
      else await refresh();
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      showNotification({
        type: code === 'AI_DAILY_LIMIT_REACHED' ? 'warning' : 'error',
        title: code === 'AI_DAILY_LIMIT_REACHED' ? '今日 AI 次數已用完' : '暫時無法產生見解',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setRetryingInsight(false);
      refreshQuota();
    }
  };

  const handleReopen = async () => {
    setResolving(true);
    try {
      await apiService.reopenEvent(eventId);
      await refresh();
      showNotification({ type: 'success', title: '已重新開啟', message: '可以繼續討論這段對話了' });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '操作失敗',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-petal-ink-soft">載入中…</div>;
  }
  if (error || !event) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        <div className="p-6 text-center text-red-500">{error || '找不到對話'}</div>
      </div>
    );
  }

  const isAuthor = event.createdBy === currentUserId;
  // Once we're in 一起收尾, hide the entire reply composer + AI-invite row so
  // the closure ceremony has the screen to itself. Users who need to say one
  // more thing tap 取消收尾 to reopen the discussion first.
  const canSendMessage = !event.isPrivate && event.status !== 'resolved' && event.status !== 'closing';
  const canFacilitate = canSendMessage;

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />

      <header className="bg-petal-cream border border-petal-rule rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          {editingHeader ? (
            <input
              data-testid="event-title-input"
              // Already 20px, so it can't trigger iOS's focus zoom — keep it
              // matching the <h2> it replaces instead of being clamped to 16px.
              data-keep-font
              value={headerTitle}
              onChange={(e) => setHeaderTitle(e.target.value)}
              maxLength={120}
              className="flex-1 text-xl font-serif text-petal-ink bg-white border border-petal-rule rounded-xl px-3 py-1.5 focus:outline-none focus:border-petal-rose-deep"
            />
          ) : (
            <h2 className="text-xl font-serif text-petal-ink flex-1">{event.title}</h2>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {event.isPrivate && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-petal-ink/10 text-petal-ink inline-flex items-center gap-1">
                <Lock className="w-3 h-3" />
                私人
              </span>
            )}
            {statusPill(event.status)}
            {isAuthor && event.status !== 'resolved' && !editingHeader && (
              <button
                type="button"
                data-testid="event-header-edit"
                onClick={startHeaderEdit}
                title="編輯標題與簡介"
                className="p-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-petal-muted mb-3">
          {formatTime(event.createdAt, tz)}・{isAuthor ? '你發起' : '伴侶發起'}
          {event.contentEditedAt && <span>・已編輯</span>}
        </p>

        {editingHeader ? (
          <div className="mb-3">
            <textarea
              data-testid="event-summary-input"
              value={headerSummary}
              onChange={(e) => setHeaderSummary(e.target.value)}
              rows={5}
              maxLength={1000}
              className="w-full p-3 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink focus:outline-none focus:border-petal-rose-deep resize-y"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setEditingHeader(false)}
                disabled={savingEdit}
                className="px-3 py-1.5 rounded-full border border-petal-rule text-xs text-petal-ink hover:bg-petal-sage/20 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="event-header-save"
                onClick={saveHeaderEdit}
                disabled={savingEdit}
                className="px-4 py-1.5 rounded-full bg-petal-ink text-petal-cream text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                儲存
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-petal-ink-soft leading-relaxed mb-3 whitespace-pre-wrap">{event.summary}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {event.emotions.map((e) => (
            <span key={`em-${e}`} className="text-xs px-2 py-0.5 rounded-full bg-petal-rose/20 text-petal-ink">
              {e}
            </span>
          ))}
          {event.tags.map((t) => (
            <span
              key={`tg-${t}`}
              className="text-xs px-2 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink inline-flex items-center gap-1"
            >
              <Tag className="w-3 h-3" />
              {t}
            </span>
          ))}
        </div>

        {/* Private (solo) conversation → let the partner see it (step 1 of the
            two-stage share flow). Author-only, one-way. Once shared, the 公開問答
            control below appears. */}
        {event.isPrivate && isAuthor && (
          <div className="mt-4 pt-3 border-t border-petal-rule space-y-1.5">
            <button
              type="button"
              data-testid="event-share-partner-button"
              onClick={() => setSharePartnerOpen(true)}
              className="text-xs px-3 py-1.5 rounded-full border border-petal-rose text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink inline-flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              讓伴侶也看得到
            </button>
            <p className="text-[11px] text-petal-muted leading-relaxed">
              這段對話目前只有你看得到。讓伴侶看得到後，你們就能一起討論；之後也能選擇匿名公開到「公開問答」。
            </p>
          </div>
        )}

        {/* Share to 公開問答 (anonymised, single-party toggle with warning). Only
            for shared events — a private one must be shared with the partner first. */}
        {!event.isPrivate && (
          <div className="mt-4 pt-3 border-t border-petal-rule">
            {event.publicStatus === 'published' ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-petal-sage-deep inline-flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  已匿名公開到公開問答
                </span>
                <button
                  type="button"
                  data-testid="event-unshare-button"
                  onClick={unshare}
                  disabled={sharing}
                  className="text-xs px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink disabled:opacity-50"
                >
                  取消公開
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="event-share-button"
                onClick={() => setShareWarnOpen(true)}
                className="text-xs px-3 py-1.5 rounded-full border border-petal-sage text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink inline-flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                匿名公開到公開問答
              </button>
            )}
          </div>
        )}
      </header>

      {!event.isPrivate && event.status !== 'resolved' && (
        <ConflictBanner messages={event.messages} threadKey={`event:${event.id}`} />
      )}

      {!event.isPrivate && (
        <section className="bg-petal-cream border border-petal-rule rounded-2xl p-4 space-y-3">
          {/* 情緒翻譯 lens toggle — shared across both partners. Turns each
              message into the underlying emotion + need so nobody reads an
              attack. */}
          <div className="flex items-center justify-between gap-2 bg-petal-cream-2 border border-petal-rule rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <HeartHandshake className="w-4 h-4 text-petal-rose-deep shrink-0" strokeWidth={1.5} />
              <span className="text-xs text-petal-ink truncate">情緒翻譯</span>
              <span
                className="text-[11px] text-petal-muted cursor-help shrink-0"
                title="開啟後，AI 會在每句話下方顯示背後的情緒與需求，幫你們從「立場」轉向「需求」。兩人都看得到。"
              >
                (?)
              </span>
              {translationLoading && (
                <span className="text-[11px] text-petal-muted shrink-0 inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />翻譯中…
                </span>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={translationEnabled}
              aria-label="情緒翻譯"
              onClick={handleToggleTranslation}
              data-testid="event-translation-toggle"
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                translationEnabled ? 'bg-petal-rose-deep' : 'bg-petal-rule'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  translationEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {/* An unfinished batch has to stay explained on screen: the toast
              disappears, but the missing cards do not. */}
          {translationEnabled && translationNotice && !translationLoading && (
            <div
              data-testid="event-translation-notice"
              className="flex items-start justify-between gap-2 bg-petal-cream-2 border border-petal-rule rounded-xl px-3 py-2"
            >
              <p className="text-[11px] text-petal-ink-soft leading-relaxed">{translationNotice.message}</p>
              <button
                type="button"
                onClick={loadTranslations}
                className="text-[11px] text-petal-rose-deep hover:underline shrink-0 whitespace-nowrap"
              >
                重試
              </button>
            </div>
          )}
          {event.messages.length === 0 && (
            <p className="text-sm text-petal-ink-soft text-center py-4">尚無訊息</p>
          )}
          {(() => {
            // The creator's opening message was seeded from one of the three
            // stored AI versions — when editing it, offer the other versions.
            const firstHumanMessage = event.messages.find((x) => !x.isAi);
            return event.messages.map((m) => {
            // Therapist Mode turn: render the structured exercise card.
            if (m.isAi && m.facilitation) {
              const f = m.facilitation;
              const isMyTurn = f.target === 'both' || f.targetUserId === currentUserId;
              const label = companionName(m.aiTherapist) ? `${companionName(m.aiTherapist)}・引導者` : '引導者';
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="max-w-[92%] w-full">
                    <TherapistTurnCard
                      facilitation={f}
                      say={m.content}
                      companionLabel={label}
                      companionId={m.aiTherapist}
                      isMyTurn={isMyTurn}
                      onQuickReply={(text) => setReply(text)}
                    />
                    <p className="text-[10px] text-petal-muted mt-1 text-center">{formatTime(m.createdAt, tz)}</p>
                  </div>
                </div>
              );
            }
            if (m.isAi) {
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="max-w-[92%] w-full rounded-2xl px-4 py-3 bg-petal-sage/15 border border-petal-sage/40">
                    <div className="flex items-center gap-1.5 mb-1 text-petal-sage-deep">
                      <ParticipantAvatar
                        size="xs"
                        role="ai"
                        companionId={m.aiTherapist}
                        name={companionName(m.aiTherapist) || 'AI 諮商師'}
                      />
                      <span className="text-xs font-medium">
                        {companionName(m.aiTherapist) ? `${companionName(m.aiTherapist)}・AI 諮商師` : 'AI 諮商師'}
                      </span>
                    </div>
                    <p className="text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    <p className="text-[10px] text-petal-muted mt-1.5">{formatTime(m.createdAt, tz)}</p>
                  </div>
                </div>
              );
            }
            // A message from the couple's dedicated (human) therapist — centered
            // and pink, distinct from the two partners and the AI 諮商師.
            if (m.isTherapist) {
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="max-w-[92%] w-full rounded-2xl px-4 py-3 bg-pink-50 border border-pink-200">
                    <div className="flex items-center gap-1.5 mb-1 text-pink-700">
                      <ParticipantAvatar size="xs" role="therapist" name="專屬心理師" />
                      <span className="text-xs font-medium">專屬心理師</span>
                    </div>
                    <p className="text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    <p className="text-[10px] text-petal-muted mt-1.5">{formatTime(m.createdAt, tz)}</p>
                  </div>
                </div>
              );
            }
            const mine = m.senderId === currentUserId;
            const isEditing = editingMessageId === m.id;
            const speakerName = mine ? (myNickname || '我') : (partnerNickname || '對方');
            const canSwapVersion =
              mine &&
              m.id === firstHumanMessage?.id &&
              event.createdBy === currentUserId &&
              Object.values(event.versions || {}).some((v) => (v || '').trim().length > 0);
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`${isEditing ? 'w-full max-w-[92%]' : 'max-w-[80%]'} rounded-2xl px-4 py-2 ${
                    mine ? 'bg-petal-rose/20' : 'bg-petal-sage/15'
                  }`}
                >
                  {isEditing ? (
                    <div>
                      <textarea
                        data-testid="event-message-edit-input"
                        value={editingMessageText}
                        onChange={(e) => setEditingMessageText(e.target.value)}
                        rows={4}
                        maxLength={REPLY_MAX_CHARS}
                        className="w-full p-2 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink focus:outline-none focus:border-petal-rose-deep resize-y"
                      />
                      {/* Swapping in a stored version sets the value directly,
                          so this can exceed the cap the same way a reply can. */}
                      <div className="flex justify-end mt-1">
                        <span
                          data-testid="event-message-edit-counter"
                          className={`font-body text-[11px] ${
                            editingMessageText.length > REPLY_MAX_CHARS ? 'text-red-600' : 'text-petal-muted'
                          }`}
                        >
                          {editingMessageText.length} / {REPLY_MAX_CHARS}
                        </span>
                      </div>
                      {editingMessageText.length > REPLY_MAX_CHARS && (
                        <p className="mt-1 font-body text-xs text-red-600">
                          超過 {editingMessageText.length - REPLY_MAX_CHARS} 字，請刪減後再儲存。
                        </p>
                      )}
                      {canSwapVersion && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="text-[10px] text-petal-muted">改用當時的其他版本：</span>
                          {([
                            ['neutral', '中性版'],
                            ['firm', '堅定版'],
                            ['warm', '善意版'],
                          ] as const).map(([key, label]) =>
                            (event.versions[key] || '').trim().length > 0 ? (
                              <button
                                key={key}
                                type="button"
                                data-testid={`event-message-version-${key}`}
                                onClick={() => setEditingMessageText(event.versions[key])}
                                className="text-[11px] px-2 py-0.5 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
                              >
                                {label}
                              </button>
                            ) : null
                          )}
                        </div>
                      )}
                      <div className="flex justify-end gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingMessageId(null)}
                          disabled={savingEdit}
                          className="px-3 py-1 rounded-full border border-petal-rule text-xs text-petal-ink hover:bg-petal-sage/20 disabled:opacity-50"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          data-testid="event-message-edit-save"
                          onClick={saveMessageEdit}
                          disabled={savingEdit || editingMessageText.length > REPLY_MAX_CHARS}
                          className="px-3 py-1 rounded-full bg-petal-ink text-petal-cream text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                          儲存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-petal-ink whitespace-pre-wrap">{m.content}</p>
                      <p className="text-[10px] text-petal-muted mt-1 flex items-center gap-1">
                        <ParticipantAvatar size="xs" name={speakerName} colorKey={m.senderId} />
                        <span className="font-medium text-petal-ink-soft">{speakerName}</span>
                        <span>・{formatTime(m.createdAt, tz)}</span>
                        {m.editedAt && <span>・已編輯</span>}
                        {mine && m.readAt && <span>・已讀</span>}
                        {mine && event.status !== 'resolved' && (
                          <button
                            type="button"
                            data-testid={`event-message-edit-${m.id}`}
                            onClick={() => startMessageEdit(m.id, m.content)}
                            title="編輯訊息"
                            className="ml-1 p-0.5 rounded text-petal-muted hover:text-petal-ink"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </p>
                      {translationEnabled && translations[m.id] && (
                        <MessageTranslationCard translation={translations[m.id]} />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
            });
          })()}
        </section>
      )}

      {/* Invite the AI 諮商師 based on the conversation so far — deliberately
          OUTSIDE the reply composer: it reads the thread history, it doesn't
          rewrite whatever you're typing below. */}
      {canSendMessage && (
        <div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="event-ai-counselor-button"
              onClick={inviteAiCounselor}
              disabled={aiInviting}
              className="px-3 py-2 rounded-full bg-petal-sage-deep text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
              title={`請 ${myCompanion.name} 讀過你們的對話，給一段中立的建議`}
            >
              {aiInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HeartHandshake className="w-4 h-4" />}
              <span>請 {myCompanion.name} 加入</span>
            </button>
            {/* 引導模式: a facilitated session, not one-shot advice. Shown only when
                no session is active — an active one renders its progress tray.
                Hidden during 收尾: the couple is finishing an existing
                discussion, not starting a new practice. */}
            {canFacilitate && (!facilitation || facilitation.status !== 'active') && (
              <button
                type="button"
                data-testid="event-facilitation-start-button"
                onClick={startFacilitation}
                disabled={facilitating}
                className="px-3 py-2 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
              >
                {facilitating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                <span>開始引導</span>
              </button>
            )}
          </div>
          {/* Visible on mobile (tooltips aren't): what 開始引導 does + that both
              buttons draw from the shared daily AI budget. */}
          <div className="flex flex-wrap items-center justify-between gap-1 mt-1.5">
            <p className="font-body text-xs text-petal-muted">
              「開始引導」：{myCompanion.name} 會像諮商師一樣，一步一步帶你們做練習（會使用 AI 次數）。
            </p>
            <AiQuotaHint quota={quota} />
          </div>
        </div>
      )}

      {canSendMessage && facilitation && facilitation.status === 'active' && (
        <SessionProgress eventId={eventId} session={facilitation} onEnd={endFacilitation} ending={endingSession} />
      )}

      {canSendMessage && (
        <div className="bg-petal-cream border border-petal-rule rounded-2xl p-3">
          {facilitation && facilitation.status === 'active' && (
            <div className="mb-2 font-body text-xs space-y-0.5" data-testid="facilitation-turn-hint">
              {advancePaused ? (
                <span className="text-petal-muted">⏸️ 今日 AI 次數已用完，明天會自動接續引導。你們仍可自由回覆。</span>
              ) : facilitation.turnOwner === currentUserId || facilitation.turnOwner === null ? (
                <span className="text-petal-rose-deep">🎯 輪到你了：照著上面 {myCompanion.name} 的引導回應。</span>
              ) : (
                <>
                  <span className="text-petal-muted block">⏳ 等待 {partnerNickname || '對方'} 回應這一步…</span>
                  <span className="text-petal-muted block">你也可以先自由回覆，練習會等 {partnerNickname || '對方'} 完成這一步再繼續。</span>
                </>
              )}
            </div>
          )}
          <ReplyStepBar onInsertPhrase={insertPhrase} />
          <textarea
            data-testid="event-reply-input"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="回覆…"
            rows={2}
            maxLength={REPLY_MAX_CHARS}
            className="w-full p-2 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          {/* maxLength only limits typing — an applied AI rewrite or an
              inserted phrase sets the value directly and can land over the
              cap. Show the count so the disabled send button is explainable. */}
          <div className="flex justify-end mt-1">
            <span
              data-testid="event-reply-counter"
              className={`font-body text-[11px] ${replyOver ? 'text-red-600' : 'text-petal-muted'}`}
            >
              {reply.length} / {REPLY_MAX_CHARS}
            </span>
          </div>
          {replyOver && (
            <p data-testid="event-reply-over-hint" className="mt-1 font-body text-xs text-red-600">
              這則留言 {reply.length} / {REPLY_MAX_CHARS} 字，請刪掉 {reply.length - REPLY_MAX_CHARS} 字，或分成兩則送出。
            </p>
          )}
          {/* Free, instant tone hint: when the draft reads charged, nudge the
              writer to run the emotion check before sending (no LLM, no quota). */}
          {(() => {
            const tone = detectDraftTone(reply);
            if (tone === 'connection') return null;
            return (
              <p
                className="mt-1.5 font-body text-xs text-petal-rose-deep flex items-start gap-1.5"
                data-testid="event-draft-tone-hint"
              >
                <Gauge className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
                <span>{draftToneHint(tone)}</span>
              </p>
            );
          })()}
          <div className="flex justify-end mt-1.5">
            <AiQuotaHint quota={quota} />
          </div>
          <div className="flex flex-wrap justify-end gap-2 mt-1">
            <button
              type="button"
              data-testid="event-draft-analyze-button"
              onClick={requestDraftAnalysis}
              disabled={analyzing || reply.trim().length === 0}
              className="px-3 py-2 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-40 disabled:shadow-none hover:opacity-90 active:scale-[0.98] transition"
              title="送出前，看看這句話底層的情緒、對方會怎麼聽，以及更好的說法"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gauge className="w-4 h-4" />}
              <span>情緒檢測</span>
            </button>
            <button
              type="button"
              data-testid="event-acceptance-button"
              onClick={requestAcceptance}
              disabled={accepting}
              className="px-3 py-2 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
              title="先別急著解決——讓 AI 教你怎麼接住TA的情緒"
            >
              {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandHeart className="w-4 h-4" />}
              <span>如何接住TA的情緒</span>
            </button>
            <button
              type="button"
              data-testid="event-reply-rewrite-button"
              onClick={requestRewrite}
              disabled={rewriting || reply.trim().length === 0}
              className="px-3 py-2 rounded-full bg-petal-rose text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-40 disabled:shadow-none hover:opacity-90 active:scale-[0.98] transition"
              title="讓 AI 把你的回覆改得更中性、客觀"
            >
              {rewriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>讓 AI 重寫</span>
            </button>
            <button
              type="button"
              data-testid="event-reply-send-button"
              onClick={sendReply}
              disabled={sending || reply.trim().length === 0 || replyOver}
              className="px-4 py-2 rounded-full bg-petal-ink text-petal-cream font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-40 disabled:shadow-none hover:opacity-90 active:scale-[0.98] transition"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>送出</span>
            </button>
          </div>
        </div>
      )}

      {draftAnalysis && (
        <DraftEmotionMeter
          analysis={draftAnalysis}
          onUseRewrite={(text) => {
            setReply(text);
            setDraftAnalysis(null);
          }}
          onClose={() => setDraftAnalysis(null)}
        />
      )}

      {rewritePreview && (
        <RewritePicker
          preview={rewritePreview}
          onApply={applyRewriteVersion}
          onCancel={() => setRewritePreview(null)}
        />
      )}

      {acceptancePreview && (
        <AcceptancePicker
          preview={acceptancePreview}
          onInsert={insertAcceptance}
          onCancel={() => setAcceptancePreview(null)}
        />
      )}

      {aiPreview !== null && (
        <AiCounselorPreview
          companionName={myCompanion.name}
          comment={aiPreview}
          posting={aiPosting}
          onPost={postAiCounselor}
          onCancel={() => setAiPreview(null)}
        />
      )}

      {shareWarnOpen && (
        <ShareWarning
          busy={sharing}
          onConfirm={confirmShare}
          onCancel={() => setShareWarnOpen(false)}
        />
      )}

      {sharePartnerOpen && (
        <ShareWithPartnerWarning
          busy={sharingPartner}
          onConfirm={confirmShareWithPartner}
          onCancel={() => setSharePartnerOpen(false)}
        />
      )}

      {!event.isPrivate && (event.status === 'open' || event.status === 'resolve_pending') && (
        <CloseTogetherBar
          onStart={() => setCloseConfirmOpen(true)}
          busy={resolving}
        />
      )}

      {closeConfirmOpen && (
        <CloseTogetherModal
          busy={resolving}
          partnerNickname={partnerNickname}
          onConfirm={handleCloseTogether}
          onCancel={() => setCloseConfirmOpen(false)}
        />
      )}

      {!event.isPrivate && event.status === 'closing' && (
        <ClosurePanel
          eventId={eventId}
          partnerNickname={partnerNickname}
          quota={quota}
          refreshQuota={refreshQuota}
          onResolved={() => refresh()}
          onCancelled={() => refresh()}
          showNotification={showNotification}
        />
      )}

      {!event.isPrivate && event.status === 'resolved' && (
        <div className="space-y-3">
          {closureSummary && (
            <ClosureSummaryCard
              closure={closureSummary}
              myNickname={myNickname}
              partnerNickname={partnerNickname}
              retryingInsight={retryingInsight}
              onRetryInsight={handleRetryInsight}
            />
          )}
          {therapyNote ? (
            <TherapyNoteCard note={therapyNote} />
          ) : (
            <div className="bg-petal-sage/15 border border-petal-sage/40 rounded-2xl p-4 text-center space-y-2">
              <p className="text-sm text-petal-ink inline-flex items-center gap-1.5">
                <NotebookPen className="w-4 h-4 text-petal-sage-deep" />
                想不想讓 AI 幫你們整理這次衝突的「治療摘要」？
              </p>
              <p className="text-xs text-petal-ink-soft leading-relaxed">
                看清楚這次的觸發點、彼此真正的需求、你們落入的循環，還有下次可以先說的一句話。
              </p>
              <button
                type="button"
                data-testid="event-therapy-note-button"
                disabled={therapyLoading}
                onClick={loadTherapyNote}
                className="px-4 py-2 rounded-full bg-petal-sage-deep text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2 disabled:opacity-50"
              >
                {therapyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <NotebookPen className="w-4 h-4" />}
                {therapyLoading ? '整理中⋯' : '產生治療摘要'}
              </button>
            </div>
          )}

          <div className="flex flex-col items-center gap-2 text-center bg-petal-sage/15 border border-petal-sage/40 rounded-2xl p-4">
            <p className="text-sm text-petal-ink-soft inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-petal-sage-deep" />
              這段對話已完成。如果還想再聊聊，可以重新開啟。
            </p>
            <button
              type="button"
              data-testid="event-reopen-button"
              disabled={resolving}
              onClick={handleReopen}
              className="px-4 py-2 rounded-full bg-petal-sage-deep text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-2 disabled:opacity-50"
            >
              {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              重新開啟討論
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AiCounselorPreview({
  companionName: name,
  comment,
  posting,
  onPost,
  onCancel,
}: {
  companionName: string;
  comment: string;
  posting: boolean;
  onPost: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      data-testid="event-ai-counselor-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-lg w-full max-h-[min(85vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-petal-sage-deep" />
            <div>
              <h3 className="text-lg font-serif text-petal-ink">{name}（AI 諮商師）的建議</h3>
              <p className="text-xs text-petal-ink-soft mt-1">看看這段建議，貼到對話串後雙方都看得到。</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="text-petal-ink-soft hover:text-petal-ink" aria-label="取消">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-white border border-petal-sage/40 rounded-xl p-4 mb-4">
          <p className="text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">{comment}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            先不要
          </button>
          <button
            type="button"
            data-testid="event-ai-counselor-post"
            onClick={onPost}
            disabled={posting}
            className="text-sm px-4 py-2 rounded-full bg-petal-sage-deep text-petal-cream inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            貼到對話串
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareWithPartnerWarning({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="event-share-partner-warning">
      <div className="bg-petal-cream rounded-2xl max-w-md w-full p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-petal-rose-deep" />
          <h3 className="text-lg font-serif text-petal-ink">讓伴侶也看得到</h3>
        </div>
        <p className="text-sm text-petal-ink-soft leading-relaxed mb-2">
          目前這段對話<span className="text-petal-ink font-medium">只有你看得到</span>。
          分享後，<span className="text-petal-ink font-medium">伴侶會看到標題與內容</span>，你們就能一起討論這件事。
        </p>
        <p className="text-sm text-petal-ink-soft leading-relaxed mb-4">
          這個動作<span className="text-petal-ink font-medium">無法復原</span>——伴侶看過就收不回了。日後如果想幫助其他人，還能再選擇匿名公開到「公開問答」。
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            先不要
          </button>
          <button
            type="button"
            data-testid="event-share-partner-confirm"
            onClick={onConfirm}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-full bg-petal-ink text-petal-cream inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            確定分享給伴侶
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareWarning({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="event-share-warning">
      <div className="bg-petal-cream rounded-2xl max-w-md w-full p-5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-5 h-5 text-petal-rose-deep" />
          <h3 className="text-lg font-serif text-petal-ink">公開到「公開問答」</h3>
        </div>
        <p className="text-sm text-petal-ink-soft leading-relaxed mb-2">
          公開後，這段對話會<span className="text-petal-ink font-medium">匿名</span>顯示在「公開問答」，
          <span className="text-petal-ink font-medium">所有人（包含未登入的訪客）都看得到</span>。
        </p>
        <p className="text-sm text-petal-ink-soft leading-relaxed mb-4">
          你們會顯示為「匿名 A / 匿名 B」，不會出現名字。你隨時可以取消公開。
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="event-share-confirm"
            onClick={onConfirm}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-full bg-petal-ink text-petal-cream inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            確定公開
          </button>
        </div>
      </div>
    </div>
  );
}

function AcceptancePicker({
  preview,
  onInsert,
  onCancel,
}: {
  preview: EmotionAcceptancePreview;
  onInsert: (text: string) => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      data-testid="event-acceptance-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-lg w-full max-h-[min(85vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <HandHeart className="w-5 h-5 text-petal-rose-deep" />
            <div>
              <h3 className="text-lg font-serif text-petal-ink">先接住TA的情緒</h3>
              <p className="text-xs text-petal-ink-soft mt-1">真正的修復，從情緒被接住開始——先別急著解釋或解決。</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="text-petal-ink-soft hover:text-petal-ink" aria-label="取消">
            <X className="w-5 h-5" />
          </button>
        </div>

        {preview.empathy && (
          <div className="bg-petal-rose/10 border border-petal-rose/30 rounded-xl p-3 mb-4">
            <p className="text-sm text-petal-ink leading-relaxed">{preview.empathy}</p>
          </div>
        )}

        <div className="space-y-3">
          {preview.acceptances.map((a, i) => (
            <div
              key={`${a.label}-${i}`}
              className="bg-white border border-petal-rule rounded-xl p-3"
              data-testid={`event-acceptance-card-${i}`}
            >
              {a.label && <div className="text-xs text-petal-rose-deep mb-1">{a.label}</div>}
              <p className="text-sm text-petal-ink whitespace-pre-wrap mb-2">{a.text}</p>
              <div className="flex justify-end">
                <button
                  type="button"
                  data-testid={`event-acceptance-insert-${i}`}
                  onClick={() => onInsert(a.text)}
                  className="text-sm px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:opacity-90"
                >
                  放進回覆
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            先不用
          </button>
        </div>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-petal-ink-soft hover:text-petal-ink"
    >
      <ArrowLeft className="w-4 h-4" />
      回到歷史
    </button>
  );
}

const VERSION_LABELS: Record<EventVersionKey, { title: string; hint: string }> = {
  neutral: { title: '中性版', hint: '第三方客觀描述，不示弱也不指責' },
  firm: { title: '堅定版', hint: '以「我訊息」說感受，不指責' },
  warm: { title: '善意版', hint: '在堅定的基礎上多一份願意聊聊的善意' },
};

function RewritePicker({
  preview,
  onApply,
  onCancel,
}: {
  preview: ReplyRewritePreview;
  onApply: (key: EventVersionKey) => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      data-testid="event-reply-rewrite-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-lg w-full max-h-[min(85vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-serif text-petal-ink">AI 幫你改寫的版本</h3>
            <p className="text-xs text-petal-ink-soft mt-1">挑一個版本套用到你的草稿，或保留原文。</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-petal-ink-soft hover:text-petal-ink"
            aria-label="取消"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {(Object.keys(VERSION_LABELS) as EventVersionKey[]).map((key) => (
            <div
              key={key}
              className="bg-white border border-petal-rule rounded-xl p-3"
              data-testid={`event-reply-rewrite-card-${key}`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <div className="text-sm font-medium text-petal-ink">{VERSION_LABELS[key].title}</div>
                <div className="text-[11px] text-petal-muted">{VERSION_LABELS[key].hint}</div>
              </div>
              <p className="text-sm text-petal-ink whitespace-pre-wrap mb-2">{preview.versions[key]}</p>
              <div className="flex justify-end">
                <button
                  type="button"
                  data-testid={`event-reply-rewrite-apply-${key}`}
                  onClick={() => onApply(key)}
                  className="text-sm px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream hover:opacity-90"
                >
                  使用這個版本
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            保留原文
          </button>
        </div>
      </div>
    </div>
  );
}
