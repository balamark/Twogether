import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Heart, MessageSquare } from 'lucide-react';
import { apiService, type DedicatedTherapist } from '../services/api';
import type { Notification } from './ErrorNotification';

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

  const load = useCallback(async () => {
    if (!isAuthenticated) { setDedicated(null); setLoading(false); return; }
    try {
      setLoading(true);
      setDedicated(await apiService.getDedicatedTherapist());
    } catch {
      setDedicated(null);
    } finally {
      setLoading(false);
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
        title: '已更新',
        message: next ? '已允許心理師在牆與好好說話留言' : '已關閉心理師的留言權限',
        duration: 2800,
      });
    } catch (err) {
      showNotification({ type: 'error', title: '更新失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
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
      showNotification({ type: 'success', title: '已解除', message: '已解除專屬心理師，他將無法再檢視你們的內容', duration: 3000 });
    } catch (err) {
      showNotification({ type: 'error', title: '解除失敗', message: err instanceof Error ? err.message : '請稍後再試', duration: 3500 });
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
            <h3 className="font-display text-lg text-petal-ink">你們的專屬心理師</h3>
            <p className="mt-1 font-body text-sm text-petal-ink-soft leading-relaxed">
              指定一位諮商師成為你們的專屬心理師，他就能看見你們平常在
              <strong className="text-petal-ink">「牆」</strong>與
              <strong className="text-petal-ink">「好好說話」</strong>累積的內容，
              更了解你們的關係脈絡。私密內容不會被看到，你們也可以隨時解除。
            </p>
            <p className="mt-2 font-body text-xs text-petal-muted">
              從下方名錄挑一位諮商師，點「完整檔案」即可設為專屬。
            </p>
          </div>
        </div>
      </div>
    );
  }

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
            你們的專屬心理師
          </div>
          <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
            <h3 className="font-display text-xl text-petal-ink">{dedicated.displayName}</h3>
            {dedicated.title && <span className="font-body text-xs text-petal-muted">{dedicated.title}</span>}
          </div>
          <p className="mt-1.5 font-body text-xs text-petal-ink-soft leading-relaxed">
            可檢視：你們的<strong>牆</strong>與<strong>好好說話</strong>（不含私密內容）
            {dedicated.canComment ? '，並可在其中留言' : ''}。
          </p>

          {/* 允許留言 toggle */}
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-pink-200 bg-petal-cream px-3 py-2">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 font-body text-sm text-petal-ink">
                <MessageSquare className="w-3.5 h-3.5 text-pink-500" strokeWidth={1.5} /> 允許心理師留言
              </div>
              <div className="font-body text-[11px] text-petal-muted mt-0.5">
                開啟後，心理師可在你們的牆與好好說話回覆
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
              解除專屬心理師
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DedicatedTherapistPanel;
