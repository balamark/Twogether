import React, { useEffect, useState } from 'react';
import { Calendar, X, MessageSquareHeart, Sparkles, Play, ListChecks } from 'lucide-react';
import apiService from '../services/api';
import type { IntimacyRequest, AlternativePlan } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';
import { useScrollLock } from '../hooks/useScrollLock';
import IntimacyRequestActionPanel from './IntimacyRequestActionPanel';
import { tr } from '../i18n/tr';
import { intimacyStatusLabel, intimacyStatusBadgeClass, isAwaitingResponse, isNegotiation } from './intimacyStatus';

interface IntimacyRequestDetailModalProps {
  request: IntimacyRequest | null;
  direction: 'sent' | 'received';
  onClose: () => void;
  onResponded: () => void;
  /** Navigate to the roleplay view and open the named script. */
  onViewScript?: (title: string) => void;
  /** 替代方案協商: open the shared plan list (optionally on one plan). */
  onOpenPlans?: (planId?: string) => void;
}

// The shared plans a 替代方案協商 invite points at, read live from 共同方案 so
// both partners see the current wording and approval state.
const LinkedPlans: React.FC<{ ids: string[]; onOpenPlan?: (planId: string) => void }> = ({ ids, onOpenPlan }) => {
  const [plans, setPlans] = useState<AlternativePlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    let cancelled = false;
    apiService.getAlternativePlans()
      .then((all) => { if (!cancelled) setPlans(all.filter((p) => ids.includes(p.id))); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error && err.message ? err.message : tr('方案暫時載入不了，請稍後再試', 'Couldn\'t load the plans. Please try again shortly'));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ordered = plans ? ids.map((id) => plans.find((p) => p.id === id)).filter((p): p is AlternativePlan => !!p) : [];
  const missing = plans ? ids.length - ordered.length : 0;

  return (
    <section className="rounded-xl border border-petal-rule-soft bg-petal-cream-2/40 p-4 space-y-2" data-testid="negotiation-linked-plans">
      <div className="text-xs uppercase tracking-[0.12em] text-petal-muted">{tr('想討論的共同方案', 'Shared plans to talk about')}</div>
      {error && <p className="text-sm text-amber-700">{error}</p>}
      {!plans && !error && <p className="text-sm text-petal-muted">{tr('載入中…', 'Loading…')}</p>}
      {ordered.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid="negotiation-linked-plan"
          onClick={() => onOpenPlan?.(p.id)}
          disabled={!onOpenPlan}
          className="w-full text-left rounded-lg border border-petal-rule-soft bg-white p-3 hover:border-petal-rose-deep/40 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium text-petal-ink break-words">{p.title}</span>
            <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${
              p.status === 'approved' ? 'bg-green-100 text-green-700' : p.status === 'disabled' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {p.status === 'approved' ? tr('雙方已認可', 'Both approved') : p.status === 'disabled' ? tr('已停用', 'Paused') : tr('待確認', 'Awaiting approval')}
            </span>
          </div>
          {p.scriptTitle && (
            <div className="text-xs text-petal-rose-deep mt-1">{tr('🎭 劇本《', '🎭 Script “')}{p.scriptTitle}{tr('》', '”')}</div>
          )}
          {p.interaction && <p className="text-xs text-petal-ink-soft mt-1 line-clamp-2">{p.interaction}</p>}
          {onOpenPlan && (
            <span className="inline-flex items-center gap-1 text-xs text-petal-rose-deep mt-1.5 underline underline-offset-2">
              <ListChecks className="w-3.5 h-3.5" />
              {tr('查看方案', 'Open plan')}
            </span>
          )}
        </button>
      ))}
      {missing > 0 && (
        <p className="text-xs text-petal-muted">
          {tr(`有 ${missing} 個方案已被移除。`, `${missing} plan(s) were removed.`)}
        </p>
      )}
    </section>
  );
};

const ALTERNATIVE_CATEGORY_LABEL: Record<string, string> = {
  physical: tr('肢體親密', 'Physical intimacy'),
  emotional: tr('情感親密', 'Emotional intimacy'),
  playful: tr('趣味互動', 'Playful'),
  companionship: tr('日常陪伴', 'Everyday time together'),
  custom: tr('自訂', 'Custom'),
};

const IntimacyRequestDetailModal: React.FC<IntimacyRequestDetailModalProps> = ({
  request,
  direction,
  onClose,
  onResponded,
  onViewScript,
  onOpenPlans,
}) => {
  const tz = useTimezone();
  useScrollLock(!!request);

  if (!request) return null;

  const negotiation = isNegotiation(request.requestType);
  const isPending = request.status === 'pending';
  const canRespond = isAwaitingResponse(request.status, request.requestType);
  const isRejected = request.status === 'rejected' || request.status === 'declined';
  const responseTitle = direction === 'sent' ? tr('對方的回應', 'Their response') : tr('你的回應', 'Your response');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-petal-rule">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium text-petal-ink">
              {direction === 'sent' ? tr('我發送的邀請', 'Invitation I sent') : tr('我收到的邀請', 'Invitation I received')}
            </h3>
            <span
              className={`text-xs whitespace-nowrap inline-flex items-center justify-center text-center px-2 py-0.5 rounded-full ${intimacyStatusBadgeClass(request.status, request.requestType)}`}
            >
              {intimacyStatusLabel(request.status, request.requestType)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr("關閉", 'Close')}
            className="p-1.5 rounded-full hover:bg-petal-cream-2 text-petal-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Original invitation */}
          <section>
            <div className="text-xs uppercase tracking-[0.12em] text-petal-muted mb-1.5">
              {negotiation ? tr('💬 替代方案協商', '💬 Talk about alternatives') : tr('原邀請', 'Original invitation')}
            </div>
            {request.scheduledTime && (
              <div className="inline-flex items-center gap-1.5 text-sm text-petal-ink-soft mb-2">
                <Calendar className="w-4 h-4" />
                <span>{tr('預約', 'Scheduled')} {formatDateTime(request.scheduledTime, tz, { alwaysShowTz: true })}</span>
              </div>
            )}
            <p className="text-petal-ink text-sm leading-relaxed whitespace-pre-wrap break-words">
              {request.messageContent}
            </p>

            {/* Which script this in-character invitation belongs to — without
                this the recipient may have no idea what the message refers to. */}
            {request.scriptTitle && (
              <div
                className="mt-3 rounded-lg border border-petal-rule-soft bg-petal-rose-soft/30 p-3 space-y-1.5"
                data-testid="request-script-context"
              >
                <div className="text-sm text-petal-ink">
                  {tr('🎭 這是劇本', '🎭 This is an in-character invitation for the script')} <span className="font-medium">{tr('《', ' “')}{request.scriptTitle}{tr('》', '”')}</span> {tr('的入戲邀請', '')}
                </div>
                {request.scriptScenario && (
                  <p className="text-xs text-petal-muted leading-relaxed">{request.scriptScenario}</p>
                )}
                {onViewScript && (
                  <button
                    type="button"
                    data-testid="request-view-script-button"
                    onClick={() => {
                      onClose();
                      onViewScript(request.scriptTitle!);
                    }}
                    className="inline-flex items-center gap-1.5 text-sm text-petal-rose-deep hover:text-pink-700 underline underline-offset-2"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {tr('查看劇本內容', 'View script')}
                  </button>
                )}
              </div>
            )}

            <div className="text-xs text-petal-muted mt-2">
              {tr('發送於', 'Sent')} {formatDateTime(request.createdAt, tz)}
              {request.expiresAt && (
                <> {tr('・效期至', ' ・Valid until')} {formatDateTime(request.expiresAt, tz)}</>
              )}
            </div>
          </section>

          {negotiation && request.altPlanIds && request.altPlanIds.length > 0 && (
            <LinkedPlans
              ids={request.altPlanIds}
              onOpenPlan={onOpenPlans ? (planId) => { onClose(); onOpenPlans(planId); } : undefined}
            />
          )}

          {/* Response (if responded) */}
          {!isPending && (request.responseMessage || request.alternativeType || request.alternativeContent || request.alternativeScheduledTime) && (
            <section className="rounded-xl border border-petal-rule-soft bg-petal-cream-2/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquareHeart className="w-4 h-4 text-petal-rose-deep" />
                <div className="text-sm font-medium text-petal-ink">{responseTitle}</div>
              </div>

              {request.responseMessage && (
                <p className="text-sm text-petal-ink leading-relaxed whitespace-pre-wrap break-words">
                  {request.responseMessage}
                </p>
              )}

              {(request.alternativeType || request.alternativeContent || request.alternativeScheduledTime) && (
                <div className="rounded-lg border border-petal-rule-soft bg-white p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-petal-muted">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{tr('建議的替代方式', 'Suggested alternative')}</span>
                  </div>
                  {request.alternativeType && (
                    <div className="text-xs text-petal-muted">
                      {tr('類型：', 'Type: ')}<span className="text-petal-ink">{ALTERNATIVE_CATEGORY_LABEL[request.alternativeType] || request.alternativeType}</span>
                    </div>
                  )}
                  {request.alternativeContent && (
                    <div className="text-sm text-petal-ink">
                      {request.alternativeContent}
                    </div>
                  )}
                  {request.alternativeScheduledTime && (
                    <div className="inline-flex items-center gap-1.5 text-sm text-petal-ink">
                      <Calendar className="w-4 h-4 text-petal-rose-deep" />
                      <span>{tr('改到', 'Moved to')} {formatDateTime(request.alternativeScheduledTime, tz, { alwaysShowTz: true })}</span>
                    </div>
                  )}
                </div>
              )}

              {request.respondedAt && (
                <div className="text-xs text-petal-muted">
                  {tr('回應於', 'Responded')} {formatDateTime(request.respondedAt, tz)}
                </div>
              )}
            </section>
          )}

          {/* 替代方案協商: point both partners at the shared plan list. */}
          {negotiation && onOpenPlans && (request.status === 'accepted' || direction === 'sent') && (
            <section className="rounded-xl border border-petal-rule-soft bg-petal-cream-2/40 p-4 space-y-2" data-testid="negotiation-plans-cta">
              <p className="text-sm text-petal-ink">
                {request.status === 'accepted'
                  ? tr('你們可以各自提出方案，雙方都認可的才會加入共同清單。', 'You can each propose plans; only ones you both approve join the shared list.')
                  : request.status === 'pending' || request.status === 'later'
                  ? tr('等待回覆的同時，你也可以先把想法寫成方案草稿，對方看過再決定。', 'While you wait, you can draft a plan; they\'ll see it and decide.')
                  : tr('謝謝你願意開口。這是對方此刻的步調，你們的共同方案清單會一直保留著。', 'Thank you for speaking up. That\'s their pace right now; your shared plan list stays here for whenever you\'re both ready.')}
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPlans();
                }}
                className="inline-flex items-center gap-1.5 text-sm text-petal-rose-deep hover:text-pink-700 underline underline-offset-2"
              >
                <ListChecks className="w-4 h-4" />
                {tr('前往共同方案', 'Open shared plans')}
              </button>
            </section>
          )}

          {/* Empty rejected state (responded with no message) */}
          {!negotiation && isRejected && !request.responseMessage && !request.alternativeContent && !request.alternativeScheduledTime && (
            <p className="text-sm text-petal-muted italic">{tr('對方沒有附上額外訊息。', 'They didn\'t add a message.')}</p>
          )}

          {/* Action panel — only for received pending */}
          {direction === 'received' && canRespond && (
            <section>
              <div className="text-xs uppercase tracking-[0.12em] text-petal-muted mb-2">{tr('如何回應', 'How they responded')}</div>
              <IntimacyRequestActionPanel
                request={request}
                onResponded={onResponded}
                onOpenPlans={onOpenPlans ? (planId?: string) => { onResponded(); onOpenPlans(planId); } : undefined}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntimacyRequestDetailModal;
