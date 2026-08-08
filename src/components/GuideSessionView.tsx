import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Compass, Loader2, Send } from 'lucide-react';
import type { FacilitationSession, MessageFacilitation } from '../services/api';
import TherapistTurnCard from './TherapistTurnCard';
import SessionProgress from './SessionProgress';
import { useScrollLock } from '../hooks/useScrollLock';

// 引導模式的全螢幕專注層。
//
// 引導本來是對話串裡的一張卡片，於是同一條時間軸上同時有「我」「對方」「AI 諮商師」
// 「引導者」四個發言者 —— 三方對話已經難讀，四方就開始亂。所以引導整個抽離出對話：
// 它不是第四個角色，是 Luma 的第二種 mode，而且是一件「要做的事」，值得一個自己的
// 介面。時間軸上只留一條全寬的系統標記，點了回到這裡。
//
// 這不是 blocking modal（playbook §R4）：左上角隨時可以「回到對話」，session 仍然
// 進行中，草稿也留著 —— 輸入框和對話共用同一份 reply state。
//
// 版面沿用 ConflictView 的「暫停模式」：捲動掛在內層容器而不是 fixed 那一層，因為
// iOS 上自己捲動的 fixed 元素會用視覺 viewport 做 hit-test、卻用版面 viewport 繪製，
// 手指點下去會偏掉。
interface Props {
  open: boolean;
  onClose: () => void;
  eventId: string;
  // 可能是 null：練習已結束、後端不再回傳 session，但時間軸上的標記還在，
  // 使用者仍該能點回去看那一步做了什麼。
  session: FacilitationSession | null;
  // 最新一則引導回合（沒有就只顯示進度，例如剛結束一步等 AI 出下一步）。
  turn: MessageFacilitation | null;
  turnSay: string;
  companionLabel: string;
  companionId?: string | null;
  companionShortName: string;
  partnerName: string;
  isMyTurn: boolean;
  advancePaused: boolean;
  // 與對話共用的草稿，回到對話時不會消失。
  reply: string;
  onReplyChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  maxChars: number;
  onEnd: () => void;
  ending: boolean;
}

const GuideSessionView: React.FC<Props> = ({
  open,
  onClose,
  eventId,
  session,
  turn,
  turnSay,
  companionLabel,
  companionId,
  companionShortName,
  partnerName,
  isMyTurn,
  advancePaused,
  reply,
  onReplyChange,
  onSend,
  sending,
  maxChars,
  onEnd,
  ending,
}) => {
  useScrollLock(open);
  if (!open) return null;

  const over = reply.length > maxChars;
  const active = session?.status === 'active';
  const stepNumber = session ? session.completedCardsMeta.length + (session.activeCardMeta ? 1 : 0) : 0;

  // Portal to <body>. Mounted inline inside EventDetail's tree, a `fixed inset-0`
  // layer does NOT fill the viewport — measured at y=16 / h=711 in a 727px
  // viewport, so a strip of the conversation shows above it. An empty
  // `position: fixed` probe in the same parent reproduces it exactly, so some
  // ancestor is scoping the containing block; every other `fixed inset-0`
  // overlay in EventDetail inherits the same offset. Attaching to <body>
  // sidesteps it (the same probe on <body> measures y=0 / h=727) without
  // rewriting the ancestor chain the whole app depends on.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-petal-cream flex flex-col" data-testid="guide-session-view">
      <div className="w-full max-w-2xl mx-auto px-5 sm:px-8 py-6 flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col safe-pb">
        {/* Top bar — 「回到對話」而不是「×」：關掉的是圖層，不是練習。 */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <button
            type="button"
            onClick={onClose}
            data-testid="guide-session-back"
            className="inline-flex items-center gap-1.5 font-body text-sm text-petal-ink-soft hover:text-petal-ink p-2 -m-2"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            回到對話
          </button>
          <div className="text-right">
            <div className="font-body text-[11px] uppercase tracking-[0.18em] text-petal-rose-deep mb-0.5 inline-flex items-center gap-1">
              <Compass className="w-3.5 h-3.5" strokeWidth={1.5} />
              {companionLabel}
            </div>
            <div className="font-body text-xs text-petal-muted">
              {active ? `第 ${stepNumber} 步` : '已結束'}
            </div>
          </div>
        </div>

        {turn ? (
          <TherapistTurnCard
            facilitation={turn}
            say={turnSay}
            companionLabel={companionLabel}
            companionId={companionId}
            isMyTurn={isMyTurn}
            onQuickReply={onReplyChange}
            variant="focus"
          />
        ) : (
          <div className="rounded-2xl border border-petal-rule bg-white p-4 font-body text-sm text-petal-ink-soft">
            {companionShortName} 正在準備下一步…
          </div>
        )}

        {session && (
          <div className="mt-4">
            <SessionProgress eventId={eventId} session={session} onEnd={onEnd} ending={ending} />
          </div>
        )}

        {/* 誰該動作。單獨一行，因為在專注層裡這是最重要的一句話。 */}
        {active && (
        <div className="mt-4 font-body text-xs space-y-0.5" data-testid="facilitation-turn-hint">
          {advancePaused ? (
            <span className="text-petal-muted">⏸️ 今日 AI 次數已用完，明天會自動接續引導。你們仍可自由回覆。</span>
          ) : isMyTurn ? (
            <span className="text-petal-rose-deep">🎯 輪到你了：照著上面 {companionShortName} 的引導回應。</span>
          ) : (
            <>
              <span className="text-petal-muted block">⏳ 等待 {partnerName} 回應這一步…</span>
              <span className="text-petal-muted block">
                你也可以先自由回覆，練習會等 {partnerName} 完成這一步再繼續。
              </span>
            </>
          )}
        </div>
        )}

        {/* 精簡的輸入框：專注層只做「照著引導回一句」。情緒檢測／AI 重寫等工具留在
            對話的輸入區，避免把一個練習步驟變成一整排按鈕。 */}
        {active && (
        <div className="mt-3 bg-white border border-petal-rule rounded-2xl p-3">
          <textarea
            data-testid="guide-reply-input"
            value={reply}
            onChange={(e) => onReplyChange(e.target.value)}
            placeholder={isMyTurn ? '照著這一步回應…' : '先寫下你想說的…'}
            rows={3}
            maxLength={maxChars}
            className="w-full p-2 rounded-xl border border-petal-rule bg-white text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep resize-y"
          />
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span
              data-testid="guide-reply-counter"
              className={`font-body text-[11px] ${over ? 'text-red-600' : 'text-petal-muted'}`}
            >
              {reply.length} / {maxChars}
            </span>
            <button
              type="button"
              data-testid="guide-reply-send-button"
              onClick={onSend}
              disabled={sending || reply.trim().length === 0 || over}
              className="px-4 py-2 rounded-full bg-petal-ink text-petal-cream font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-40 disabled:shadow-none hover:opacity-90 active:scale-[0.98] transition"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>送出</span>
            </button>
          </div>
          {over && (
            <p className="mt-1 font-body text-xs text-red-600">
              這則回應 {reply.length} / {maxChars} 字，請刪掉 {reply.length - maxChars} 字再送出。
            </p>
          )}
        </div>
        )}

        <p className="mt-3 font-body text-[11px] text-petal-muted">
          {active
            ? `送出後 ${companionShortName} 會接著給下一步。想先看看你們剛剛說了什麼，可以隨時「回到對話」——練習會留在這裡。`
            : '這次練習已經結束。想再練一次，回到對話按「開始引導」。'}
        </p>
      </div>
    </div>,
    document.body
  );
};

export default GuideSessionView;
