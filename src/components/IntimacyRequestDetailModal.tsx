import React from 'react';
import { Calendar, X, MessageSquareHeart, Sparkles } from 'lucide-react';
import type { IntimacyRequest } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';
import { useScrollLock } from '../hooks/useScrollLock';
import IntimacyRequestActionPanel from './IntimacyRequestActionPanel';

interface IntimacyRequestDetailModalProps {
  request: IntimacyRequest | null;
  direction: 'sent' | 'received';
  onClose: () => void;
  onResponded: () => void;
}

const ALTERNATIVE_CATEGORY_LABEL: Record<string, string> = {
  physical: '肢體親密',
  emotional: '情感親密',
  playful: '趣味互動',
  companionship: '日常陪伴',
  custom: '自訂',
};

function statusLabel(status: string): string {
  if (status === 'accepted') return '已接受';
  if (status === 'rejected' || status === 'declined') return '已拒絕';
  if (status === 'expired') return '已過期';
  return '待回應';
}

function statusBadgeClass(status: string): string {
  if (status === 'accepted') return 'bg-green-100 text-green-700';
  if (status === 'pending') return 'bg-yellow-100 text-yellow-700';
  if (status === 'rejected' || status === 'declined') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

const IntimacyRequestDetailModal: React.FC<IntimacyRequestDetailModalProps> = ({
  request,
  direction,
  onClose,
  onResponded,
}) => {
  const tz = useTimezone();
  useScrollLock(!!request);

  if (!request) return null;

  const isPending = request.status === 'pending';
  const isRejected = request.status === 'rejected' || request.status === 'declined';
  const responseTitle = direction === 'sent' ? '對方的回應' : '你的回應';

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
              {direction === 'sent' ? '我發送的邀請' : '我收到的邀請'}
            </h3>
            <span
              className={`text-xs whitespace-nowrap inline-flex items-center justify-center text-center px-2 py-0.5 rounded-full ${statusBadgeClass(request.status)}`}
            >
              {statusLabel(request.status)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="p-1.5 rounded-full hover:bg-petal-cream-2 text-petal-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Original invitation */}
          <section>
            <div className="text-xs uppercase tracking-[0.12em] text-petal-muted mb-1.5">原邀請</div>
            {request.scheduledTime && (
              <div className="inline-flex items-center gap-1.5 text-sm text-petal-ink-soft mb-2">
                <Calendar className="w-4 h-4" />
                <span>預約 {formatDateTime(request.scheduledTime, tz, { alwaysShowTz: true })}</span>
              </div>
            )}
            <p className="text-petal-ink text-sm leading-relaxed whitespace-pre-wrap break-words">
              {request.messageContent}
            </p>
            <div className="text-xs text-petal-muted mt-2">
              發送於 {formatDateTime(request.createdAt, tz)}
              {request.expiresAt && (
                <> ・效期至 {formatDateTime(request.expiresAt, tz)}</>
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
                    <span>建議的替代方式</span>
                  </div>
                  {request.alternativeType && (
                    <div className="text-xs text-petal-muted">
                      類型：<span className="text-petal-ink">{ALTERNATIVE_CATEGORY_LABEL[request.alternativeType] || request.alternativeType}</span>
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
                      <span>改到 {formatDateTime(request.alternativeScheduledTime, tz, { alwaysShowTz: true })}</span>
                    </div>
                  )}
                </div>
              )}

              {request.respondedAt && (
                <div className="text-xs text-petal-muted">
                  回應於 {formatDateTime(request.respondedAt, tz)}
                </div>
              )}
            </section>
          )}

          {/* Empty rejected state (responded with no message) */}
          {isRejected && !request.responseMessage && !request.alternativeContent && !request.alternativeScheduledTime && (
            <p className="text-sm text-petal-muted italic">對方沒有附上額外訊息。</p>
          )}

          {/* Action panel — only for received pending */}
          {direction === 'received' && isPending && (
            <section>
              <div className="text-xs uppercase tracking-[0.12em] text-petal-muted mb-2">如何回應</div>
              <IntimacyRequestActionPanel request={request} onResponded={onResponded} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntimacyRequestDetailModal;
