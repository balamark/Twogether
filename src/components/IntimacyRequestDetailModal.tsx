import React from 'react';
import { Calendar, X, MessageSquareHeart, Sparkles, Play, ListChecks } from 'lucide-react';
import type { IntimacyRequest } from '../services/api';
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
  /** 替代方案協商: open the shared plan list. */
  onOpenPlans?: () => void;
}

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
                onOpenPlans={onOpenPlans ? () => { onResponded(); onOpenPlans(); } : undefined}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntimacyRequestDetailModal;
