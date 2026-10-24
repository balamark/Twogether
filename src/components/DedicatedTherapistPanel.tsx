import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Heart, MessageSquare, MessageCircle, ClipboardList } from 'lucide-react';
import { apiService, type DedicatedTherapist } from '../services/api';
import type { Notification } from './ErrorNotification';
import DedicatedSpaceModal, { type DedicatedSpaceTab } from './DedicatedSpaceModal';
import { tr } from '../i18n/tr';

// Per-link "last opened the thread" marker for the new-message dot. Browser
// storage is a convenience only — when it's unavailable the dot just shows.
const seenKey = (linkId: string) => `dedicatedSpaceSeen:${linkId}`;
const readSeen = (linkId: string): string | null => {
  try { return localStorage.getItem(seenKey(linkId)); } catch { return null; }
};
const markSeen = (linkId: string) => {
  try { localStorage.setItem(seenKey(linkId), new Date().toISOString()); } catch { /* ignore */ }
};

// 你們的專屬心理師 — the couple-facing card at the top of the 心理諮商 tab. Shows
// either a mini-onboarding empty state (pick one from the directory below) or the
// current dedicated therapist with a "允許留言" toggle and a revoke button. What
// the therapist can see is spelled out so consent is informed.
interface Props {
  // Bumped by the parent whenever a therapist is set from a profile modal, so
  // the panel re-fetches.
  reloadKey: number;
  isAuthenticated: boolean;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const DedicatedTherapistPanel: React.FC<Props> = ({ reloadKey, isAuthenticated, showNotification }) => {
  const [dedicated, setDedicated] = useState<DedicatedTherapist | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [spaceTab, setSpaceTab] = useState<DedicatedSpaceTab | null>(null);

  // silent: refresh counts after closing the space without blanking the panel.
  const load = useCallback(async (silent = false) => {
    if (!isAuthenticated) { setDedicated(null); setLoading(false); return; }
    try {
      if (!silent) setLoading(true);
      setDedicated(await apiService.getDedicatedTherapist());
    } catch {
      if (!silent) setDedicated(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { load(); }, [load, reloadKey]);

  if (!isAuthenticated || loading) return null;

  const toggleComment = async () => {
    if (!dedicated || busy) return;
    const next = !dedicated.canComment;
    try {
      setBusy(true);
      await apiService.updateDedicatedTherapistPermission(next);
      setDedicated({ ...dedicated, canComment: next });
      showNotification({
        type: 'success',
        title: tr('已更新', 'Updated'),
        message: next ? tr('已允許心理師在牆與好好說話留言', 'Your therapist can now comment on your wall and conversations') : tr('已關閉心理師的留言權限', 'Therapist comments are turned off'),
        duration: 2800,
      });
    } catch (err) {
      showNotification({ type: 'error', title: tr('更新失敗', 'Couldn\'t update'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 3500 });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    try {
      setBusy(true);
      await apiService.removeDedicatedTherapist();
      setDedicated(null);
      showNotification({ type: 'success', title: tr('已解除', 'Removed'), message: tr('已解除專屬心理師，他將無法再檢視你們的內容', 'Your dedicated therapist was removed and can no longer view your content'), duration: 3000 });
    } catch (err) {
      showNotification({ type: 'error', title: tr('解除失敗', 'Couldn\'t remove'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'), duration: 3500 });
    } finally {
      setBusy(false);
    }
  };

  // --- Empty state: mini-onboarding (value line + how-to + what they'd see) ---
  if (!dedicated) {
    return (
      <div
        className="rounded-lg border border-petal-rule bg-petal-cream-2/50 p-5"
        data-testid="dedicated-therapist-panel"
      >
        <div className="flex items-start gap-3" data-testid="dedicated-empty">
          <ShieldCheck className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" strokeWidth={1.5} />
          <div>
            <h3 className="font-display text-lg text-petal-ink">{tr('你們的專屬心理師', 'Your dedicated therapist')}</h3>
            <p className="mt-1 font-body text-sm text-petal-ink-soft leading-relaxed">
              {tr('指定一位諮商師成為你們的專屬心理師，他就能看見你們平常在', 'Choose a counselor as your dedicated therapist and they can see what builds up on your ')}
              <strong className="text-petal-ink">{tr('「牆」', 'wall')}</strong>{tr('與', ' and in ')}
              <strong className="text-petal-ink">{tr('「好好說話」', 'Talk it through')}</strong>{tr('累積的內容， 更了解你們的關係脈絡。私密內容不會被看到，你們也可以隨時解除。', ', so they understand your relationship\'s context. Private content is never visible, and you can remove them any time.')}
            </p>
            <p className="mt-2 font-body text-sm text-petal-ink-soft leading-relaxed">
              {tr('之後你們和心理師會有一個共同的訊息管道：諮商之間想到的事先傳過去、排進「下次要談」，諮商時打開「諮商頁」一起整理摘要。', 'You\'ll also share a message thread with them: send what comes up between sessions, queue it for "Next time", and open the session page together to take notes.')}
            </p>
            <p className="mt-2 font-body text-xs text-petal-muted">
              {tr('從下方名錄挑一位諮商師，點「完整檔案」即可設為專屬。', 'Pick a counselor from the directory below and tap "Full profile" to make them your dedicated therapist.')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const openSpace = (tab: DedicatedSpaceTab) => {
    if (!dedicated) return;
    markSeen(dedicated.id);
    setSpaceTab(tab);
  };
  const seenAt = readSeen(dedicated.id);
  const hasNew = !!dedicated.lastIncomingAt && (!seenAt || dedicated.lastIncomingAt > seenAt);
  const agendaCount = dedicated.openAgendaCount ?? 0;

  // --- Active state ---------------------------------------------------------
  return (
    <div
      className="rounded-lg border border-pink-200 bg-pink-50/60 p-5"
      data-testid="dedicated-therapist-panel"
    >
      <div className="flex items-start gap-4" data-testid="dedicated-active">
        <div className="w-14 h-14 shrink-0 rounded-full overflow-hidden bg-petal-cream border border-petal-rule flex items-center justify-center">
          {dedicated.photoUrl ? (
            <img src={dedicated.photoUrl} alt={dedicated.displayName} className="w-full h-full object-contain" />
          ) : (
            <Heart className="w-6 h-6 text-pink-300" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-pink-600">
            {tr('你們的專屬心理師', 'Your dedicated therapist')}
          </div>
          <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
            <h3 className="font-display text-xl text-petal-ink">{dedicated.displayName}</h3>
            {dedicated.title && <span className="font-body text-xs text-petal-muted">{dedicated.title}</span>}
          </div>
          {/* 專屬諮商空間 entry — 訊息 between sessions, 諮商頁 during one. */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openSpace('messages')}
              data-testid="dedicated-open-messages"
              className="relative flex items-start gap-2 rounded-md border border-pink-200 bg-petal-cream px-3 py-2.5 text-left hover:border-pink-400 transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-pink-500 shrink-0 mt-0.5" strokeWidth={1.5} />
              <span className="min-w-0">
                <span className="block font-body text-sm font-medium text-petal-ink">{tr('傳訊息給心理師', 'Message your therapist')}</span>
                <span className="block font-body text-[11px] text-petal-muted">{tr('你們兩個和心理師都看得到，想下次談的可以直接排進去', 'You both and your therapist see it; queue what you want to discuss next time')}</span>
              </span>
              {hasNew && (
                <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-pink-500 px-1.5 font-body text-[10px] text-white" data-testid="dedicated-new-badge">
                  {tr('新訊息', 'New')}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => openSpace('session')}
              data-testid="dedicated-open-session"
              className="flex items-start gap-2 rounded-md border border-pink-200 bg-petal-cream px-3 py-2.5 text-left hover:border-pink-400 transition-colors"
            >
              <ClipboardList className="w-4 h-4 text-pink-500 shrink-0 mt-0.5" strokeWidth={1.5} />
              <span className="min-w-0">
                <span className="block font-body text-sm font-medium text-petal-ink">
                  {dedicated.sessionOpen ? tr('回到諮商頁（進行中）', 'Back to session (in progress)') : tr('打開諮商頁', 'Open session page')}
                </span>
                <span className="block font-body text-[11px] text-petal-muted">
                  {agendaCount > 0
                    ? tr(`下次要談 ${agendaCount} 件・摘要・話題建議都在這`, `${agendaCount} to discuss · notes · topics, all in one place`)
                    : tr('諮商時打開：要談的事、摘要、話題建議都在這', 'Open it during a session: agenda, notes and topics in one place')}
                </span>
              </span>
            </button>
          </div>

          <p className="mt-3 font-body text-xs text-petal-ink-soft leading-relaxed">
            {tr('可檢視：你們的', 'Can view: your ')}<strong>{tr('牆', 'wall')}</strong>{tr('與', ' and ')}<strong>{tr('好好說話', 'Talk it through')}</strong>{tr('（不含私密內容）', ' (excluding private content)')}
            {dedicated.canComment ? tr('，並可在其中留言', ', and can comment there') : ''}{tr('。', '.')}
          </p>

          {/* 允許留言 toggle */}
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-pink-200 bg-petal-cream px-3 py-2">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 font-body text-sm text-petal-ink">
                <MessageSquare className="w-3.5 h-3.5 text-pink-500" strokeWidth={1.5} /> {tr('允許心理師留言', 'Allow therapist comments')}
              </div>
              <div className="font-body text-[11px] text-petal-muted mt-0.5">
                {tr('開啟後，心理師可在你們的牆與好好說話回覆', 'When on, your therapist can reply on your wall and in Talk it through')}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={dedicated.canComment}
              onClick={toggleComment}
              disabled={busy}
              data-testid="dedicated-comment-toggle"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                dedicated.canComment ? 'bg-pink-500' : 'bg-petal-rule'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  dedicated.canComment ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              data-testid="dedicated-revoke"
              className="font-body text-xs text-petal-muted hover:text-petal-rose-deep underline underline-offset-2 disabled:opacity-50"
            >
              {tr('解除專屬心理師', 'Remove dedicated therapist')}
            </button>
          </div>
        </div>
      </div>
      {spaceTab && (
        <DedicatedSpaceModal
          dedicated={dedicated}
          initialTab={spaceTab}
          onClose={() => { markSeen(dedicated.id); setSpaceTab(null); load(true); }}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default DedicatedTherapistPanel;
