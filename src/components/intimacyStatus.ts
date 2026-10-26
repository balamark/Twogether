import { tr } from '../i18n/tr';

// Status chrome for intimacy invitations, shared by the history list and the
// detail modal. 替代方案協商 answers get their own wording and neutral colors:
// "not now" there is a boundary, never a red failure (PRD acceptance rule).

export const isNegotiation = (requestType?: string) => requestType === 'negotiation';

export function intimacyStatusLabel(status: string, requestType?: string): string {
  if (isNegotiation(requestType)) {
    if (status === 'accepted') return tr('願意討論', 'Open to talk');
    if (status === 'later') return tr('稍後再聊', 'Later');
    if (status === 'rejected' || status === 'declined') return tr('暫時不聊', 'Not now');
    return tr('待回應', 'Awaiting reply');
  }
  if (status === 'accepted') return tr('已接受', 'Accepted');
  if (status === 'rejected' || status === 'declined') return tr('已拒絕', 'Declined');
  if (status === 'expired') return tr('已過期', 'Expired');
  return tr('待回應', 'Awaiting reply');
}

export function intimacyStatusBadgeClass(status: string, requestType?: string): string {
  if (status === 'accepted') return 'bg-green-100 text-green-700';
  if (status === 'pending') return 'bg-yellow-100 text-yellow-700';
  if (isNegotiation(requestType)) return 'bg-gray-100 text-gray-600';
  if (status === 'rejected' || status === 'declined') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

export function intimacyStatusAccent(status: string, requestType?: string): string {
  if (status === 'accepted') return 'bg-petal-sage-deep';
  if (status === 'pending') return 'bg-amber-400';
  if (isNegotiation(requestType)) return 'bg-gray-300';
  if (status === 'rejected' || status === 'declined') return 'bg-petal-rose-deep';
  return 'bg-gray-300'; // expired or unknown
}

/** Can the receiver (still) answer this invitation? 稍後再討論 stays answerable. */
export function isAwaitingResponse(status: string, requestType?: string): boolean {
  return status === 'pending' || (isNegotiation(requestType) && status === 'later');
}
