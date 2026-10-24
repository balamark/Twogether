import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Pin, PinOff, ClipboardList, Compass, History, MessageCircle, Plus, Check, Trash2,
  FileText, Play, Square, ArrowRight, Sparkles, ChevronDown, RotateCw,
} from 'lucide-react';
import {
  apiService,
  type DedicatedSpace,
  type DedicatedMessage,
  type DedicatedAgendaItem,
  type DedicatedSpaceTopic,
} from '../services/api';
import type { DedicatedSpaceState } from '../hooks/useDedicatedSpace';
import ParticipantAvatar from './ParticipantAvatar';
import TherapySummaryDetail from './TherapySummaryDetail';
import { ROLE_STYLE, SEAT_ALIGN } from '../utils/threadRoles';
import { tr, dateLocale } from '../i18n/tr';

// 專屬諮商空間 — shared by the couple (DedicatedSpaceModal) and their dedicated
// therapist (TherapistClientView). Two panes over the same data:
//
//   訊息   a three-way thread. Between sessions either side writes what's going
//          on; 📌 sends it straight into 下次要談.
//   諮商頁 the page open DURING a session: 這次要談 (check off as you go),
//          本次摘要 (shared notes), and every source of material in one place —
//          recent messages (→ 摘要 / ＋ 要談), 話題建議, AI 諮商摘要, 過往紀錄.
//
// coupleId set → therapist path for that client; omitted → the caller's couple.

const errMsg = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const timeLabel = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(dateLocale(), { month: 'numeric', day: 'numeric' });
};
const dateLabel = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'numeric', day: 'numeric' });
};

// Shared agenda actions (used by both panes).
function useAgendaActions(state: DedicatedSpaceState) {
  const { coupleId, notify, setSpace } = state;

  const addAgenda = useCallback(async (input: { content: string; source?: DedicatedAgendaItem['source']; sourceMessageId?: string; sourceRef?: string }) => {
    try {
      const { item, duplicate } = await apiService.addDedicatedAgendaItem(input, coupleId);
      if (duplicate) {
        notify({ type: 'info', title: tr('已經排進去了', 'Already on the list'), message: tr('這件事已經在「下次要談」裡了', 'This is already in "Next time"'), duration: 2500 });
        return;
      }
      setSpace((s) => (s ? { ...s, agenda: [...s.agenda, item] } : s));
      notify({ type: 'success', title: tr('已加入下次要談', 'Added to "Next time"'), message: tr('諮商時打開「諮商頁」就看得到', 'You\'ll see it on the session page'), duration: 2200 });
    } catch (err) {
      notify({ type: 'error', title: tr('沒能加入', 'Couldn\'t add it'), message: errMsg(err, tr('請稍後再試一次', 'Please try again in a moment')), duration: 3500 });
    }
  }, [coupleId, notify, setSpace]);

  return { addAgenda };
}

// --- Empty / error states ---------------------------------------------------

export const DedicatedSpaceGate: React.FC<{ state: DedicatedSpaceState }> = ({ state }) => {
  if (state.loading && !state.space) {
    return <p className="text-center font-body text-sm text-petal-muted py-10">{tr('載入中…', 'Loading…')}</p>;
  }
  if (state.loadError) {
    return (
      <div className="p-6 text-center" data-testid="dedicated-space-error">
        <p className="font-body text-sm text-petal-rose-deep mb-3">{state.loadError.message}</p>
        <button
          onClick={() => state.reload()}
          className="inline-flex items-center gap-1.5 font-body text-sm text-petal-ink underline underline-offset-4"
        >
          <RotateCw className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('重新載入', 'Reload')}
        </button>
      </div>
    );
  }
  return null;
};

// --- 訊息 pane ----------------------------------------------------------------

const SAMPLE_PROMPTS = [
  tr('這週我們又為了家事分工吵架，想下次談談怎麼分配。', 'We argued about chores again this week. I\'d like to talk about how we split them next time.'),
  tr('最近我很容易覺得被忽略，但說不出口。', 'Lately I often feel ignored, but I can\'t find the words to say it.'),
  tr('上次諮商教的暫停練習我們試了，想分享結果。', 'We tried the time-out exercise from last session and want to share how it went.'),
];

interface PendingMessage {
  tempId: string;
  content: string;
  pin: boolean;
  failed: boolean;
}

const MessageBubble: React.FC<{
  m: DedicatedMessage;
  pinned: boolean;
  onPin?: () => void;
  onToNotes?: () => void;
  compact?: boolean;
}> = ({ m, pinned, onPin, onToNotes, compact }) => {
  const role = m.isTherapist ? 'therapist' : m.isMine ? 'self' : 'partner';
  const seat = m.isTherapist ? 'center' : m.isMine ? 'right' : 'left';
  const who = m.isTherapist
    ? tr(`${m.senderName || '心理師'}（心理師）`, `${m.senderName || 'Therapist'} (therapist)`)
    : m.isMine ? tr('我', 'Me') : (m.senderName || tr('另一半', 'Your partner'));
  return (
    <div className={`flex ${compact ? 'justify-start' : SEAT_ALIGN[seat]}`} data-testid="dedicated-message">
      <div className={`rounded-lg px-3 py-2 ${ROLE_STYLE[role].surface} ${compact ? 'w-full' : ROLE_STYLE[role].width}`}>
        <div className="flex items-center gap-1.5">
          <ParticipantAvatar size="xs" role={m.isTherapist ? 'therapist' : 'user'} colorKey={m.senderId || undefined} name={who} />
          <span className="font-body text-[11px] text-petal-muted">{who}</span>
          <span className="font-body text-[10px] text-petal-muted ml-auto">{timeLabel(m.createdAt)}</span>
        </div>
        <p className="mt-1 font-body text-sm text-petal-ink whitespace-pre-wrap break-words">{m.content}</p>
        {(onPin || onToNotes) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {onToNotes && (
              <button
                type="button"
                onClick={onToNotes}
                data-testid="dedicated-message-to-notes"
                className="inline-flex items-center gap-1 rounded-full border border-petal-rule bg-petal-cream px-2 py-0.5 font-body text-[11px] text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink"
              >
                <FileText className="w-3 h-3" strokeWidth={1.5} /> {tr('加進摘要', 'Add to notes')}
              </button>
            )}
            {onPin && (
              pinned ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-petal-sage/15 px-2 py-0.5 font-body text-[11px] text-petal-sage-deep" data-testid="dedicated-message-pinned">
                  <Pin className="w-3 h-3" strokeWidth={1.5} /> {tr('已排進下次要談', 'In "Next time"')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onPin}
                  data-testid="dedicated-message-pin"
                  className="inline-flex items-center gap-1 rounded-full border border-petal-rule bg-petal-cream px-2 py-0.5 font-body text-[11px] text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink"
                >
                  <Pin className="w-3 h-3" strokeWidth={1.5} /> {tr('下次要談', 'Talk next time')}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const DedicatedMessagesPane: React.FC<{ state: DedicatedSpaceState; onOpenSession: () => void }> = ({ state, onOpenSession }) => {
  const { space, coupleId, notify, setSpace } = state;
  const { addAgenda } = useAgendaActions(state);
  const [draft, setDraft] = useState('');
  const [pinNext, setPinNext] = useState(true);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = space?.messages ?? [];
  const pinnedIds = useMemo(
    () => new Set((space?.agenda ?? []).filter((a) => a.status === 'open' && a.sourceMessageId).map((a) => a.sourceMessageId as string)),
    [space?.agenda]
  );
  const openCount = (space?.agenda ?? []).filter((a) => a.status === 'open').length;
  const isTherapist = space?.role === 'therapist';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending.length]);

  // R7: the message appears immediately; the round trip runs behind it. A
  // failure keeps the text on screen with 重送 so nothing typed is lost.
  const deliver = useCallback(async (p: PendingMessage) => {
    try {
      const msg = await apiService.sendDedicatedMessage(p.content, coupleId);
      setPending((list) => list.filter((x) => x.tempId !== p.tempId));
      setSpace((s) => (s ? { ...s, messages: [...s.messages, msg] } : s));
      if (p.pin) {
        await addAgenda({ content: p.content.slice(0, 300), source: 'message', sourceMessageId: msg.id });
      }
    } catch (err) {
      setPending((list) => list.map((x) => (x.tempId === p.tempId ? { ...x, failed: true } : x)));
      notify({ type: 'error', title: tr('訊息沒有送出', 'Message not sent'), message: errMsg(err, tr('請檢查網路後按「重送」', 'Check your connection and tap "Retry"')), duration: 4000 });
    }
  }, [coupleId, setSpace, addAgenda, notify]);

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    const p: PendingMessage = { tempId: `tmp-${Date.now()}`, content, pin: pinNext, failed: false };
    setPending((list) => [...list, p]);
    setDraft('');
    deliver(p);
  };

  const retry = (p: PendingMessage) => {
    setPending((list) => list.map((x) => (x.tempId === p.tempId ? { ...x, failed: false } : x)));
    deliver({ ...p, failed: false });
  };

  if (!space) return <DedicatedSpaceGate state={state} />;

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="dedicated-messages-pane">
      {/* 下次要談 strip — the bridge from this thread to the session page. */}
      <button
        type="button"
        onClick={onOpenSession}
        data-testid="dedicated-agenda-strip"
        className="flex items-center gap-2 px-4 py-2.5 border-b border-petal-rule bg-petal-cream-2/60 text-left hover:bg-petal-cream-2"
      >
        <Pin className="w-4 h-4 text-pink-500 shrink-0" strokeWidth={1.5} />
        <span className="font-body text-xs text-petal-ink-soft flex-1">
          {openCount > 0
            ? tr(`已有 ${openCount} 件事排進「下次要談」`, `${openCount} item${openCount === 1 ? '' : 's'} queued for next session`)
            : tr('想在下次諮商談的事，按 📌 就會排進「下次要談」', 'Tap 📌 on anything you want to bring to the next session')}
        </span>
        <span className="inline-flex items-center gap-0.5 font-body text-xs text-pink-600 shrink-0">
          {tr('打開諮商頁', 'Open session page')} <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </span>
      </button>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {messages.length === 0 && pending.length === 0 ? (
          // Empty state = mini-onboarding: value line + CTA + samples.
          <div className="rounded-lg border border-petal-rule bg-petal-cream-2/50 p-5" data-testid="dedicated-messages-empty">
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" strokeWidth={1.5} />
              <div>
                <h4 className="font-display text-base text-petal-ink">
                  {isTherapist ? tr('和這對伴侶的共同訊息', 'Your shared thread with this couple') : tr('諮商之間，也能先說給心理師聽', 'Between sessions, tell your therapist first')}
                </h4>
                <p className="mt-1 font-body text-sm text-petal-ink-soft leading-relaxed">
                  {isTherapist
                    ? tr('伴侶雙方和你都看得到這裡。可以提醒作業、回應他們的近況，或把想下次深入的事排進「下次要談」。', 'Both partners and you can see this thread. Follow up on homework, respond to what\'s happening, or queue topics for next time.')
                    : tr('你們兩個和心理師都看得到這裡。這週發生了什麼、想下次談什麼，先寫下來，下次諮商就能直接切入重點。', 'You both and your therapist can see this thread. Write down what happened this week and what you want to discuss, so the next session gets straight to the point.')}
                </p>
                {!isTherapist && (
                  <div className="mt-3 space-y-1.5">
                    <div className="font-body text-[11px] text-petal-muted">{tr('可以這樣開頭：', 'You could start with:')}</div>
                    {SAMPLE_PROMPTS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setDraft(s); inputRef.current?.focus(); }}
                        data-testid="dedicated-sample-prompt"
                        className="block w-full text-left rounded-md border border-dashed border-petal-rule bg-petal-cream px-3 py-1.5 font-body text-xs text-petal-ink-soft hover:border-petal-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => inputRef.current?.focus()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-petal-ink px-4 py-1.5 font-body text-xs font-medium text-petal-cream hover:bg-pink-700"
                >
                  <Send className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('寫第一則訊息', 'Write the first message')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                pinned={pinnedIds.has(m.id)}
                onPin={() => addAgenda({ content: m.content.slice(0, 300), source: 'message', sourceMessageId: m.id })}
              />
            ))}
            {pending.map((p) => (
              <div key={p.tempId} className="flex justify-end" data-testid="dedicated-message-pending">
                <div className={`rounded-lg px-3 py-2 ${ROLE_STYLE.self.surface} ${ROLE_STYLE.self.width} ${p.failed ? '' : 'opacity-70'}`}>
                  <p className="font-body text-sm text-petal-ink whitespace-pre-wrap break-words">{p.content}</p>
                  <div className="mt-1 font-body text-[11px] text-petal-muted">
                    {p.failed ? (
                      <button onClick={() => retry(p)} className="inline-flex items-center gap-1 text-petal-rose-deep underline underline-offset-2">
                        <RotateCw className="w-3 h-3" strokeWidth={1.5} /> {tr('沒送出，重送', 'Not sent, retry')}
                      </button>
                    ) : tr('傳送中…', 'Sending…')}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-petal-rule px-4 py-3 space-y-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
            rows={2}
            maxLength={2000}
            placeholder={isTherapist ? tr('傳訊息給這對伴侶…', 'Message this couple…') : tr('想讓心理師知道的事…', 'Something you want your therapist to know…')}
            data-testid="dedicated-message-input"
            className="flex-1 resize-none px-3.5 py-2 rounded-lg border border-petal-rule bg-petal-cream focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink"
          />
          <button
            onClick={send}
            disabled={!draft.trim()}
            data-testid="dedicated-message-send"
            aria-label={tr('送出', 'Send')}
            className="shrink-0 p-2.5 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-40"
          >
            <Send className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={pinNext}
          onClick={() => setPinNext((v) => !v)}
          data-testid="dedicated-pin-toggle"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-[11px] transition-colors ${
            pinNext ? 'bg-pink-50 border border-pink-200 text-pink-700' : 'border border-petal-rule text-petal-muted'
          }`}
        >
          {pinNext ? <Pin className="w-3 h-3" strokeWidth={1.5} /> : <PinOff className="w-3 h-3" strokeWidth={1.5} />}
          {pinNext ? tr('同時排進「下次要談」', 'Also add to "Next time"') : tr('只傳訊息', 'Message only')}
        </button>
      </div>
    </div>
  );
};

// --- 諮商頁 pane --------------------------------------------------------------

type MaterialTab = 'messages' | 'topics' | 'summary' | 'history';

const SOURCE_BADGE: Record<DedicatedAgendaItem['source'], { label: string; cls: string }> = {
  message: { label: tr('訊息', 'Message'), cls: 'bg-pink-50 text-pink-700 border-pink-200' },
  topic: { label: tr('話題', 'Topic'), cls: 'bg-petal-sage/10 text-petal-sage-deep border-petal-sage/30' },
  manual: { label: tr('手動', 'Added'), cls: 'bg-petal-cream-2 text-petal-muted border-petal-rule' },
};

export const DedicatedSessionPane: React.FC<{ state: DedicatedSpaceState }> = ({ state }) => {
  const { space, coupleId, notify, setSpace, reload } = state;
  const { addAgenda } = useAgendaActions(state);
  const [newItem, setNewItem] = useState('');
  const [material, setMaterial] = useState<MaterialTab>('messages');
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // 本次摘要 draft — kept local while the user types so a background poll never
  // clobbers it; adopted from the server only when it isn't dirty.
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const saveTimer = useRef<number | null>(null);
  const session = space?.session ?? null;

  useEffect(() => {
    if (!dirty) setNotes(session?.notes ?? '');
  }, [session?.id, session?.notes, dirty]);

  const saveNotes = useCallback(async (value: string) => {
    setSaveState('saving');
    try {
      const saved = await apiService.saveDedicatedSessionNotes(value, coupleId);
      setSpace((s) => (s ? { ...s, session: saved } : s));
      setDirty(false);
      setSaveState('saved');
    } catch (err) {
      setSaveState('failed');
      notify({ type: 'error', title: tr('摘要沒有存到', 'Notes not saved'), message: errMsg(err, tr('請檢查網路後再試一次（內容還留在畫面上）', 'Check your connection and try again (your text is still on screen)')), duration: 4500 });
    }
  }, [coupleId, setSpace, notify]);

  const onNotesChange = (value: string) => {
    setNotes(value);
    setDirty(true);
    setSaveState('idle');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveNotes(value), 1200);
  };
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  const agenda = space?.agenda ?? [];
  const openItems = agenda.filter((a) => a.status === 'open');
  const doneItems = agenda.filter((a) => a.status === 'discussed');
  const pinnedMessageIds = new Set(openItems.map((a) => a.sourceMessageId).filter(Boolean) as string[]);
  const queuedRefs = new Set(openItems.map((a) => a.sourceRef).filter(Boolean) as string[]);

  // Messages since the last session ended — "what came up in between".
  const lastEnded = space?.pastSessions[0]?.endedAt ?? null;
  const recentMessages = useMemo(() => {
    const all = space?.messages ?? [];
    const since = lastEnded ? all.filter((m) => m.createdAt > lastEnded) : all;
    return (since.length > 0 ? since : all.slice(-10)).slice().reverse();
  }, [space?.messages, lastEnded]);

  if (!space) return <DedicatedSpaceGate state={state} />;

  // Optimistic toggle (R7): flip locally, roll back on failure.
  const toggleItem = async (item: DedicatedAgendaItem) => {
    const next: DedicatedAgendaItem['status'] = item.status === 'open' ? 'discussed' : 'open';
    setSpace((s) => (s ? { ...s, agenda: s.agenda.map((a) => (a.id === item.id ? { ...a, status: next } : a)) } : s));
    try {
      const saved = await apiService.updateDedicatedAgendaItem(item.id, { status: next }, coupleId);
      setSpace((s) => (s ? { ...s, agenda: s.agenda.map((a) => (a.id === item.id ? saved : a)) } : s));
    } catch (err) {
      setSpace((s) => (s ? { ...s, agenda: s.agenda.map((a) => (a.id === item.id ? item : a)) } : s));
      notify({ type: 'error', title: tr('沒能更新', 'Couldn\'t update'), message: errMsg(err, tr('請稍後再試一次', 'Please try again in a moment')), duration: 3500 });
    }
  };

  const removeItem = async (item: DedicatedAgendaItem) => {
    setSpace((s) => (s ? { ...s, agenda: s.agenda.filter((a) => a.id !== item.id) } : s));
    try {
      await apiService.deleteDedicatedAgendaItem(item.id, coupleId);
    } catch (err) {
      setSpace((s) => (s ? { ...s, agenda: [...s.agenda, item] } : s));
      notify({ type: 'error', title: tr('沒能刪除', 'Couldn\'t delete'), message: errMsg(err, tr('請稍後再試一次', 'Please try again in a moment')), duration: 3500 });
    }
  };

  const addManual = async () => {
    const content = newItem.trim();
    if (!content) return;
    setNewItem('');
    await addAgenda({ content, source: 'manual' });
  };

  const startSession = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const s = await apiService.startDedicatedSession(coupleId);
      setSpace((prev) => (prev ? { ...prev, session: s, sessionCount: prev.session ? prev.sessionCount : prev.sessionCount + 1 } : prev));
    } catch (err) {
      notify({ type: 'error', title: tr('沒能開始', 'Couldn\'t start'), message: errMsg(err, tr('請稍後再試一次', 'Please try again in a moment')), duration: 3500 });
    } finally {
      setBusy(false);
    }
  };

  const endSession = async () => {
    if (busy) return;
    try {
      setBusy(true);
      if (dirty) await saveNotes(notes);
      await apiService.endDedicatedSession(coupleId);
      setConfirmEnd(false);
      setDirty(false);
      notify({
        type: 'success',
        title: tr('這次諮商已存進紀錄', 'Session saved'),
        message: openItems.length > 0
          ? tr(`沒談完的 ${openItems.length} 件事會留在下次要談`, `${openItems.length} unfinished item${openItems.length === 1 ? '' : 's'} carried over to next time`)
          : tr('可以在「過往紀錄」回顧', 'Review it any time under "Past sessions"'),
        duration: 3500,
      });
      await reload({ silent: true });
      setMaterial('history');
    } catch (err) {
      notify({ type: 'error', title: tr('沒能結束', 'Couldn\'t end'), message: errMsg(err, tr('請稍後再試一次', 'Please try again in a moment')), duration: 3500 });
    } finally {
      setBusy(false);
    }
  };

  const messageToNotes = async (m: DedicatedMessage) => {
    try {
      const { session: s, startedSession } = await apiService.appendMessageToDedicatedSession(m.id, coupleId);
      setSpace((prev) => (prev ? { ...prev, session: s, sessionCount: startedSession ? prev.sessionCount + 1 : prev.sessionCount } : prev));
      setDirty(false);
      setNotes(s.notes);
      notify({
        type: 'success',
        title: tr('已加進本次摘要', 'Added to this session\'s notes'),
        message: startedSession ? tr('已幫你開始今天的諮商紀錄', 'Today\'s session notes were started for you') : tr('可以在摘要裡再補充', 'You can expand on it in the notes'),
        duration: 2500,
      });
    } catch (err) {
      notify({ type: 'error', title: tr('沒能加進摘要', 'Couldn\'t add to notes'), message: errMsg(err, tr('請稍後再試一次', 'Please try again in a moment')), duration: 3500 });
    }
  };

  const topicToAgenda = (t: DedicatedSpaceTopic) =>
    addAgenda({ content: (t.notes ? `${t.title}：${t.notes}` : t.title).slice(0, 300), source: 'topic', sourceRef: t.ref });

  return (
    <div className="h-full overflow-y-auto" data-testid="dedicated-session-pane">
      {/* Session status bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-petal-rule bg-petal-cream/95 backdrop-blur">
        {session ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-body text-sm text-petal-ink">
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
              {tr(`第 ${space.sessionCount} 次諮商・進行中`, `Session ${space.sessionCount} · in progress`)}
            </span>
            <span className="font-body text-[11px] text-petal-muted">{tr(`${dateLabel(session.startedAt)} 開始`, `Started ${dateLabel(session.startedAt)}`)}</span>
            <div className="ml-auto">
              {confirmEnd ? (
                <span className="inline-flex items-center gap-2">
                  <span className="font-body text-[11px] text-petal-ink-soft">{tr('結束後摘要會存進過往紀錄', 'Notes will be saved to past sessions')}</span>
                  <button onClick={endSession} disabled={busy} data-testid="dedicated-session-end-confirm" className="rounded-full bg-petal-ink px-3 py-1 font-body text-xs text-petal-cream disabled:opacity-40">
                    {tr('確定結束', 'End now')}
                  </button>
                  <button onClick={() => setConfirmEnd(false)} className="font-body text-xs text-petal-muted underline underline-offset-2">{tr('還沒', 'Not yet')}</button>
                </span>
              ) : (
                <button onClick={() => setConfirmEnd(true)} data-testid="dedicated-session-end" className="inline-flex items-center gap-1 rounded-full border border-petal-rule px-3 py-1 font-body text-xs text-petal-ink-soft hover:border-petal-ink">
                  <Square className="w-3 h-3" strokeWidth={1.5} /> {tr('結束這次諮商', 'End this session')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="font-body text-sm text-petal-ink-soft">
              {space.sessionCount > 0
                ? tr(`已完成 ${space.sessionCount} 次諮商`, `${space.sessionCount} session${space.sessionCount === 1 ? '' : 's'} completed`)
                : tr('還沒有諮商紀錄', 'No session notes yet')}
            </span>
            <button onClick={startSession} disabled={busy} data-testid="dedicated-session-start" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-petal-ink px-4 py-1.5 font-body text-xs font-medium text-petal-cream hover:bg-pink-700 disabled:opacity-40">
              <Play className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('開始今天的諮商', 'Start today\'s session')}
            </button>
          </>
        )}
      </div>

      <div className="p-4 grid gap-4 md:grid-cols-5">
        {/* Left: the working area */}
        <div className="md:col-span-3 space-y-4">
          {/* 這次要談 */}
          <section className="rounded-lg border border-petal-rule bg-petal-cream p-4" data-testid="dedicated-agenda">
            <div className="flex items-center gap-1.5 mb-2">
              <Pin className="w-4 h-4 text-pink-500" strokeWidth={1.5} />
              <h4 className="font-display text-base text-petal-ink">{session ? tr('這次要談', 'To talk about') : tr('下次要談', 'Next time')}</h4>
              <span className="font-body text-[11px] text-petal-muted">{tr(`${openItems.length} 件`, `${openItems.length}`)}</span>
            </div>
            {openItems.length === 0 && doneItems.length === 0 ? (
              <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
                {tr('把想談的事排在這裡，諮商時一件件勾掉。可以從右邊的訊息或話題建議一鍵加入，或直接寫在下面。', 'Line up what you want to discuss and check items off during the session. Add from messages or topic suggestions, or type one below.')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {[...openItems, ...doneItems].map((item) => (
                  <li key={item.id} className="group flex items-start gap-2" data-testid="dedicated-agenda-item">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.status === 'discussed'}
                      onClick={() => toggleItem(item)}
                      data-testid="dedicated-agenda-toggle"
                      className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${
                        item.status === 'discussed' ? 'bg-petal-sage-deep border-petal-sage-deep text-white' : 'border-petal-rule bg-white'
                      }`}
                    >
                      {item.status === 'discussed' && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`font-body text-sm whitespace-pre-wrap break-words ${item.status === 'discussed' ? 'text-petal-muted line-through' : 'text-petal-ink'}`}>
                        {item.content}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className={`inline-flex rounded-full border px-1.5 font-body text-[10px] ${SOURCE_BADGE[item.source].cls}`}>{SOURCE_BADGE[item.source].label}</span>
                        {item.createdByName && <span className="font-body text-[10px] text-petal-muted">{item.createdByName}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                      aria-label={tr('移除', 'Remove')}
                      className="p-1 text-petal-muted hover:text-petal-rose-deep sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center gap-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } }}
                maxLength={300}
                placeholder={tr('新增要談的事…', 'Add something to discuss…')}
                data-testid="dedicated-agenda-input"
                className="flex-1 px-3 py-1.5 rounded-full border border-petal-rule bg-white focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink"
              />
              <button onClick={addManual} disabled={!newItem.trim()} data-testid="dedicated-agenda-add" aria-label={tr('加入', 'Add')} className="shrink-0 p-2 rounded-full bg-petal-ink text-petal-cream hover:bg-pink-700 disabled:opacity-40">
                <Plus className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          </section>

          {/* 本次摘要 */}
          <section className="rounded-lg border border-petal-rule bg-petal-cream p-4" data-testid="dedicated-notes">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-4 h-4 text-petal-sage-deep" strokeWidth={1.5} />
              <h4 className="font-display text-base text-petal-ink">{tr('本次摘要', 'Session notes')}</h4>
              {session && (
                <span className="ml-auto font-body text-[11px] text-petal-muted" data-testid="dedicated-notes-status">
                  {saveState === 'saving' ? tr('儲存中…', 'Saving…')
                    : saveState === 'failed' ? (
                      <button onClick={() => saveNotes(notes)} className="text-petal-rose-deep underline underline-offset-2">{tr('沒存到，重試', 'Not saved, retry')}</button>
                    )
                    : dirty ? tr('編輯中', 'Editing')
                    : session.updatedByName ? tr(`已儲存・${session.updatedByName} ${timeLabel(session.updatedAt)}`, `Saved · ${session.updatedByName} ${timeLabel(session.updatedAt)}`)
                    : tr('三方共用，會自動儲存', 'Shared by all three, saves automatically')}
                </span>
              )}
            </div>
            {session ? (
              <textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                onBlur={() => { if (dirty) { if (saveTimer.current) window.clearTimeout(saveTimer.current); saveNotes(notes); } }}
                rows={8}
                maxLength={20000}
                placeholder={tr('這次談到的重點、彼此的感受、要回家練習的事…\n也可以從右邊的訊息按「加進摘要」。', 'Key points, how each of you felt, what to practice at home…\nOr tap "Add to notes" on a message.')}
                data-testid="dedicated-notes-input"
                className="w-full resize-y px-3 py-2 rounded-md border border-petal-rule bg-white focus:border-petal-ink focus:outline-none font-body text-sm text-petal-ink leading-relaxed"
              />
            ) : (
              <div className="rounded-md border border-dashed border-petal-rule bg-petal-cream-2/50 p-4">
                <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
                  {tr('諮商一開始就按「開始今天的諮商」，你們和心理師可以一起在這裡記下重點，結束後自動存進過往紀錄，下次不用從頭說起。', 'Tap "Start today\'s session" when the session begins. You and your therapist can jot down key points together here; it\'s saved to past sessions so next time you don\'t start from scratch.')}
                </p>
                <button onClick={startSession} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-petal-ink px-4 py-1.5 font-body text-xs font-medium text-petal-cream hover:bg-pink-700 disabled:opacity-40">
                  <Play className="w-3.5 h-3.5" strokeWidth={1.5} /> {tr('開始今天的諮商', 'Start today\'s session')}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Right: material — everything you might pull into the session */}
        <div className="md:col-span-2">
          <div className="rounded-lg border border-petal-rule bg-petal-cream overflow-hidden">
            <div className="flex border-b border-petal-rule overflow-x-auto">
              {([
                ['messages', tr('訊息', 'Messages'), MessageCircle],
                ['topics', tr('話題建議', 'Topics'), Compass],
                ['summary', tr('AI 摘要', 'AI summary'), ClipboardList],
                ['history', tr('過往紀錄', 'Past'), History],
              ] as [MaterialTab, string, typeof MessageCircle][]).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setMaterial(key)}
                  data-testid={`dedicated-material-${key}`}
                  className={`flex-1 min-w-max inline-flex items-center justify-center gap-1 px-2.5 py-2 font-body text-xs font-medium ${
                    material === key ? 'text-pink-600 border-b-2 border-pink-500' : 'text-petal-muted hover:text-petal-ink'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
                </button>
              ))}
            </div>

            <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
              {material === 'messages' && (
                recentMessages.length === 0 ? (
                  <p className="font-body text-xs text-petal-muted leading-relaxed py-2">
                    {tr('還沒有訊息。諮商之間在「訊息」分頁寫下的事會出現在這裡，可以一鍵加進摘要或下次要談。', 'No messages yet. Anything written in the Messages tab between sessions shows up here, ready to add to notes or "Next time".')}
                  </p>
                ) : (
                  <>
                    <p className="font-body text-[11px] text-petal-muted">
                      {lastEnded ? tr('上次諮商後的訊息', 'Since the last session') : tr('最近的訊息', 'Recent messages')}
                    </p>
                    {recentMessages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        m={m}
                        compact
                        pinned={pinnedMessageIds.has(m.id)}
                        onPin={() => addAgenda({ content: m.content.slice(0, 300), source: 'message', sourceMessageId: m.id })}
                        onToNotes={() => messageToNotes(m)}
                      />
                    ))}
                  </>
                )
              )}

              {material === 'topics' && (
                space.topics.length === 0 ? (
                  <p className="font-body text-xs text-petal-muted leading-relaxed py-2">
                    {space.role === 'therapist'
                      ? tr('這對伴侶還沒有話題建議。等他們在「心理諮商」產生話題建議後，就會出現在這裡。', 'This couple has no topic suggestions yet. They\'ll appear here once the couple generates them under Counseling.')
                      : tr('還沒有話題建議。在「心理諮商」頁的「話題建議」產生一次，AI 會從你們最近的對話整理出值得帶進諮商的題目。', 'No topic suggestions yet. Generate them once under "Topic suggestions" on the Counseling page and AI will pick topics worth bringing to a session from your recent conversations.')}
                  </p>
                ) : (
                  space.topics.map((t) => (
                    <div key={t.ref} className="rounded-md border border-petal-rule bg-white p-3" data-testid="dedicated-topic">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-body text-sm font-medium text-petal-ink">{t.title}</span>
                        {t.status === 'selected' && <span className="shrink-0 rounded-full bg-petal-rose-deep px-2 py-0.5 font-body text-[10px] text-white">{tr('想談', 'Picked')}</span>}
                        {t.status === 'saved' && <span className="shrink-0 rounded-full bg-petal-cream-2 px-2 py-0.5 font-body text-[10px] text-petal-ink-soft">{tr('收藏', 'Saved')}</span>}
                      </div>
                      {t.why && <p className="mt-1 font-body text-xs text-petal-ink-soft leading-relaxed">{t.why}</p>}
                      {t.notes && <p className="mt-1.5 rounded bg-pink-50 border border-pink-200 px-2 py-1 font-body text-xs text-petal-ink whitespace-pre-wrap">{t.notes}</p>}
                      <div className="mt-2">
                        {queuedRefs.has(t.ref) ? (
                          <span className="inline-flex items-center gap-1 font-body text-[11px] text-petal-sage-deep"><Check className="w-3 h-3" strokeWidth={2} /> {tr('已在要談清單', 'On the list')}</span>
                        ) : (
                          <button onClick={() => topicToAgenda(t)} data-testid="dedicated-topic-add" className="inline-flex items-center gap-1 rounded-full border border-petal-rule px-2 py-0.5 font-body text-[11px] text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink">
                            <Plus className="w-3 h-3" strokeWidth={1.5} /> {tr('加入要談', 'Add to list')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )
              )}

              {material === 'summary' && <SummaryMaterial space={space} />}

              {material === 'history' && (
                space.pastSessions.length === 0 ? (
                  <p className="font-body text-xs text-petal-muted leading-relaxed py-2">
                    {tr('結束第一次諮商後，每次的摘要與談過的事都會存在這裡，方便回顧進展。', 'After your first session ends, each session\'s notes and covered items are kept here so you can look back on your progress.')}
                  </p>
                ) : (
                  space.pastSessions.map((s, i) => <PastSessionRow key={s.id} s={s} index={space.pastSessions.length - i} defaultOpen={i === 0} />)
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SummaryMaterial: React.FC<{ space: DedicatedSpace }> = ({ space }) => {
  const [openId, setOpenId] = useState<string | null>(space.summaries[0]?.id ?? null);
  if (space.summaries.length === 0) {
    return (
      <p className="font-body text-xs text-petal-muted leading-relaxed py-2">
        {space.role === 'therapist'
          ? tr('這對伴侶還沒有 AI 諮商摘要。他們整理後會出現在這裡：常見主題、雙方情緒、已修復與未解決的事。', 'This couple has no AI counseling summary yet. Once they create one it appears here: recurring themes, feelings, what\'s repaired and what isn\'t.')
          : tr('還沒有 AI 諮商摘要。在「心理諮商」頁的「諮商摘要」把最近的對話整理一次，就能在諮商時直接打開。', 'No AI counseling summary yet. Create one under "Counseling summary" on the Counseling page and you can open it right here during a session.')}
      </p>
    );
  }
  return (
    <>
      {space.summaries.map((s) => {
        const open = openId === s.id;
        return (
          <div key={s.id} className="rounded-md border border-petal-rule bg-white overflow-hidden">
            <button onClick={() => setOpenId(open ? null : s.id)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={open}>
              <span className="inline-flex items-center gap-1.5 font-body text-xs text-petal-ink">
                <Sparkles className="w-3.5 h-3.5 text-petal-sage-deep" strokeWidth={1.5} /> {s.periodLabel}
              </span>
              <span className="inline-flex items-center gap-1 font-body text-[10px] text-petal-muted">
                {dateLabel(s.createdAt)} <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} />
              </span>
            </button>
            {open && <div className="px-3 pb-3 border-t border-petal-rule"><TherapySummaryDetail summary={s.summary} /></div>}
          </div>
        );
      })}
    </>
  );
};

const PastSessionRow: React.FC<{ s: DedicatedSpace['pastSessions'][number]; index: number; defaultOpen: boolean }> = ({ s, index, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-petal-rule bg-white overflow-hidden" data-testid="dedicated-past-session">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={open}>
        <span className="font-body text-xs text-petal-ink">{tr(`第 ${index} 次・${dateLabel(s.startedAt)}`, `Session ${index} · ${dateLabel(s.startedAt)}`)}</span>
        <ChevronDown className={`w-3 h-3 text-petal-muted transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-petal-rule space-y-2 pt-2">
          {s.discussed.length > 0 && (
            <div>
              <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">{tr('談過的事', 'Covered')}</div>
              <ul className="space-y-0.5">
                {s.discussed.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5 font-body text-xs text-petal-ink-soft"><Check className="w-3 h-3 mt-0.5 text-petal-sage-deep shrink-0" strokeWidth={2} /> {d}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">{tr('摘要', 'Notes')}</div>
            <p className="font-body text-xs text-petal-ink whitespace-pre-wrap leading-relaxed">{s.notes || tr('（這次沒有留下摘要）', '(No notes for this session)')}</p>
          </div>
        </div>
      )}
    </div>
  );
};
