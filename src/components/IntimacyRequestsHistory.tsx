import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Inbox, Send } from 'lucide-react';
import apiService from '../services/api';
import type { IntimacyRequest, IntimacyRequestStats, IntimacyRequestNudge } from '../services/api';
import IntimacyRequestDetailModal from './IntimacyRequestDetailModal';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';

interface User {
  id: string;
  email: string;
  nickname: string;
  partnerId?: string;
  partnerNickname?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  partnerConnected: boolean;
}

interface IntimacyRequestsHistoryProps {
  authState: AuthState;
  partnerNickname?: string;
}

type FeedbackState = { type: 'success' | 'error'; message: string };
type Tab = 'received' | 'sent';

export const IntimacyRequestsHistory: React.FC<IntimacyRequestsHistoryProps> = ({ authState }) => {
  const [items, setItems] = useState<IntimacyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<IntimacyRequestStats | null>(null);
  const [nudge, setNudge] = useState<IntimacyRequestNudge | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<FeedbackState | null>(null);
  const [tab, setTab] = useState<Tab>('received');
  const [tabInitialized, setTabInitialized] = useState(false);
  const [detailOpenId, setDetailOpenId] = useState<string | null>(null);
  const me = authState.user?.nickname || '';
  const meId = authState.user?.id || '';
  const tz = useTimezone();

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [all, statsResponse] = await Promise.all([
        apiService.getIntimacyRequests(),
        apiService.getIntimacyRequestStats(),
      ]);
      setItems(all);
      setStats(statsResponse.statistics);
      setNudge(statsResponse.nudge);
    } catch (e) {
      setError((e as Error)?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authState.isAuthenticated) {
      setItems([]);
      setStats(null);
      setNudge(null);
      setEmailFeedback(null);
      setSendingEmail(false);
      return;
    }
    setEmailFeedback(null);
    fetchAll();
  }, [authState.isAuthenticated, fetchAll]);

  const { sent, received } = useMemo(() => {
    const s: IntimacyRequest[] = [];
    const r: IntimacyRequest[] = [];
    items.forEach((it) => {
      if (it.direction === 'sent') {
        s.push(it);
      } else if (it.direction === 'received') {
        r.push(it);
      } else if (it.senderId && it.senderId === meId) {
        s.push(it);
      } else if (it.receiverId && it.receiverId === meId) {
        r.push(it);
      } else if (it.senderNickname === me) {
        s.push(it);
      } else if (it.receiverNickname === me) {
        r.push(it);
      }
    });
    return { sent: s, received: r };
  }, [items, me, meId]);

  // Smart default: open on 我收到的 when there's something actionable; otherwise 我發送的.
  useEffect(() => {
    if (tabInitialized || loading || items.length === 0) return;
    const hasPendingReceived = received.some((r) => r.status === 'pending');
    setTab(hasPendingReceived ? 'received' : sent.length > 0 ? 'sent' : 'received');
    setTabInitialized(true);
  }, [tabInitialized, loading, items.length, received, sent]);

  const handleSendNudgeEmail = useCallback(async () => {
    if (!nudge?.message) {
      setEmailFeedback({ type: 'error', message: '目前沒有需要提醒的訊息。' });
      return;
    }

    try {
      setSendingEmail(true);
      setEmailFeedback(null);
      const responseMessage = await apiService.sendIntimacyNudgeEmail();
      setEmailFeedback({ type: 'success', message: responseMessage });
    } catch (err) {
      setEmailFeedback({
        type: 'error',
        message: (err as Error)?.message || '寄送失敗，請稍後再試。'
      });
    } finally {
      setSendingEmail(false);
    }
  }, [nudge]);

  if (!authState.isAuthenticated) {
    return (
      <div className="text-center py-10 text-gray-500">請先登入以查看歷史親密邀請</div>
    );
  }

  const activeItems = tab === 'received' ? received : sent;
  const activeEmptyText = tab === 'received' ? '尚無收到紀錄' : '尚無發送紀錄';
  const detailRequest = detailOpenId
    ? items.find((it) => it.id === detailOpenId) ?? null
    : null;

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 紀錄
        </div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.1] md:leading-[1.05] mb-3">
          親密<em className="not-italic font-light italic text-pink-600">邀請紀錄</em>
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          查看你發送與收到的所有邀請。
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-petal-rule border-t-petal-rose-deep"></div>
        </div>
      )}
      {error && (
        <div className="text-center font-display italic text-petal-rose-deep">{error}</div>
      )}

      {!loading && !error && (
        <>
          <StatsOverview
            stats={stats}
            nudge={nudge}
            onSendNudgeEmail={handleSendNudgeEmail}
            sendingEmail={sendingEmail}
            feedback={emailFeedback}
          />
          <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
            <nav className="flex flex-wrap gap-2 mb-5 border-b border-petal-rule pb-3" role="tablist" aria-label="親密邀請紀錄">
              <TabButton
                active={tab === 'received'}
                onClick={() => setTab('received')}
                icon={Inbox}
                label="我收到的"
                count={received.length}
              />
              <TabButton
                active={tab === 'sent'}
                onClick={() => setTab('sent')}
                icon={Send}
                label="我發送的"
                count={sent.length}
              />
            </nav>

            <RequestList
              items={activeItems}
              emptyText={activeEmptyText}
              tz={tz}
              onOpenDetail={(id) => setDetailOpenId(id)}
            />
          </div>
        </>
      )}

      <IntimacyRequestDetailModal
        request={detailRequest}
        direction={tab}
        onClose={() => setDetailOpenId(null)}
        onResponded={() => {
          setDetailOpenId(null);
          fetchAll();
        }}
      />
    </div>
  );
};

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Inbox;
  label: string;
  count: number;
}

function TabButton({ active, onClick, icon: Icon, label, count }: TabButtonProps) {
  const base = 'flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors border';
  const cls = active
    ? 'bg-petal-ink text-petal-cream border-petal-ink'
    : 'bg-transparent text-petal-ink border-petal-rule hover:bg-petal-sage/20';
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`${base} ${cls}`}>
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-petal-cream/20 text-petal-cream' : 'bg-petal-cream-2 text-petal-muted'}`}>
        {count}
      </span>
    </button>
  );
}

function StatsOverview({
  stats,
  nudge,
  onSendNudgeEmail,
  sendingEmail,
  feedback,
}: {
  stats: IntimacyRequestStats | null;
  nudge: IntimacyRequestNudge | null;
  onSendNudgeEmail?: () => void;
  sendingEmail?: boolean;
  feedback?: FeedbackState | null;
}) {
  if (!stats) {
    return null;
  }

  const insights = buildInvitationInsights(stats);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">邀請統計</h3>
          <p className="text-sm text-gray-500 mt-1">了解過去一週與一個月內，你對伴侶邀請的回應情況</p>
        </div>
      </div>

      <div className="space-y-5 mt-6">
        <StatsBar label="過去一週" stats={stats.week} />
        <StatsBar label="過去一個月" stats={stats.month} />
      </div>

      {nudge?.shouldNudge && nudge.message && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-800 mb-2">貼心提醒</h4>
          <p className="text-sm leading-relaxed text-amber-900">{nudge.message}</p>
          {onSendNudgeEmail && (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={onSendNudgeEmail}
                disabled={sendingEmail}
                className={`inline-flex items-center justify-center rounded-md px-5 py-2 font-display italic text-sm transition-colors focus:outline-none ${
                  sendingEmail
                    ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                    : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                }`}
              >
                {sendingEmail ? '寄送中…' : '寄送提醒信給伴侶 →'}
              </button>
              {feedback && (
                <span
                  className={`text-sm ${feedback.type === 'success' ? 'text-green-700' : 'text-red-700'}`}
                >
                  {feedback.message}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {insights.length > 0 && (
        <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/80 p-4">
          <h4 className="text-sm font-semibold text-indigo-700 mb-2">邀請洞察</h4>
          <ul className="list-disc list-inside space-y-2 text-sm text-indigo-900">
            {insights.map((insight, index) => (
              <li key={index}>{insight}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatsBar({
  label,
  stats,
}: {
  label: string;
  stats: IntimacyRequestStats['week'];
}) {
  const total = stats.accepted + stats.rejected + stats.unanswered;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-display text-base font-medium text-petal-ink">{label}</span>
        <span className="font-display italic text-sm text-petal-muted">
          共 <b className="not-italic font-medium text-petal-ink">{total}</b> 次
        </span>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-petal-cream-2 border border-petal-rule-soft">
        {stats.accepted > 0 && (
          <div
            className="bg-petal-sage-deep"
            style={{ width: `${pct(stats.accepted)}%` }}
            title={`已接受 ${stats.accepted}`}
          />
        )}
        {stats.rejected > 0 && (
          <div
            className="bg-petal-rose-deep"
            style={{ width: `${pct(stats.rejected)}%` }}
            title={`已婉拒 ${stats.rejected}`}
          />
        )}
        {stats.unanswered > 0 && (
          <div
            className="bg-amber-300"
            style={{ width: `${pct(stats.unanswered)}%` }}
            title={`待回應 ${stats.unanswered}`}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-petal-ink-soft">
        <span className="inline-flex items-center">
          <span className="w-2.5 h-2.5 rounded-sm bg-petal-sage-deep mr-1.5" />
          已接受 <b className="not-italic font-medium text-petal-ink ml-1">{stats.accepted}</b>
        </span>
        <span className="inline-flex items-center">
          <span className="w-2.5 h-2.5 rounded-sm bg-petal-rose-deep mr-1.5" />
          已婉拒 <b className="not-italic font-medium text-petal-ink ml-1">{stats.rejected}</b>
        </span>
        <span className="inline-flex items-center">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-300 mr-1.5" />
          待回應 <b className="not-italic font-medium text-petal-ink ml-1">{stats.unanswered}</b>
        </span>
      </div>

      {total === 0 && (
        <p className="mt-2 font-display italic text-xs text-petal-muted">尚無紀錄</p>
      )}
    </div>
  );
}

function buildInvitationInsights(stats: IntimacyRequestStats): string[] {
  const insights: string[] = [];

  const weekTotal = stats.week.accepted + stats.week.rejected + stats.week.unanswered;
  if (weekTotal === 0) {
    insights.push('過去一週暫無新的親密邀請，或許可以主動為關係安排一次小驚喜。');
  } else {
    insights.push(`過去一週你收到 ${weekTotal} 次邀請，其中溫柔接納了 ${stats.week.accepted} 次。`);
    if (stats.week.unanswered > 0) {
      insights.push(`目前有 ${stats.week.unanswered} 次邀請在等待回覆，適時回應能讓伴侶感到被重視。`);
    }
  }

  const monthTotal = stats.month.accepted + stats.month.rejected + stats.month.unanswered;
  if (monthTotal === 0) {
    insights.push('過去一個月還沒有任何邀請紀錄，一起創造新的甜蜜時光吧。');
  } else {
    const acceptanceRate = monthTotal > 0 ? Math.round((stats.month.accepted / monthTotal) * 100) : 0;
    insights.push(`過去一個月你們共處理了 ${monthTotal} 次邀請，整體回覆率約為 ${acceptanceRate}%。`);
    if (stats.month.rejected >= 3) {
      insights.push(`本月有 ${stats.month.rejected} 次邀請被婉拒，分享你的狀態或界線能讓彼此更理解。`);
    }
    if (stats.month.unanswered >= 3) {
      insights.push(`本月仍有 ${stats.month.unanswered} 次邀請尚未回覆，安排一個舒服的時間聊聊彼此期待吧。`);
    }
  }

  return insights.slice(0, 4);
}

function statusAccent(status: string): string {
  switch (status) {
    case 'accepted': return 'bg-petal-sage-deep';
    case 'pending': return 'bg-amber-400';
    case 'rejected':
    case 'declined': return 'bg-petal-rose-deep';
    default: return 'bg-gray-300'; // expired or unknown
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'accepted': return 'bg-green-100 text-green-700';
    case 'pending': return 'bg-yellow-100 text-yellow-700';
    case 'rejected':
    case 'declined': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function translateStatus(status: string): string {
  if (status === 'accepted') return '已接受';
  if (status === 'rejected' || status === 'declined') return '已拒絕';
  if (status === 'expired') return '已過期';
  return '待回應';
}

function RequestList({
  items,
  emptyText,
  tz,
  onOpenDetail,
}: {
  items: IntimacyRequest[];
  emptyText: string;
  tz: string;
  onOpenDetail: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="text-gray-500 text-sm py-6 text-center font-display italic">{emptyText}</div>;
  }

  return (
    <ul className="space-y-3" role="tabpanel">
      {items.map((it) => {
        const hasAlternative = !!(it.alternativeContent || it.alternativeScheduledTime);
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onOpenDetail(it.id)}
              data-testid="intimacy-card"
              className="w-full text-left flex rounded-xl border border-petal-rule-soft bg-petal-cream-2/30 overflow-hidden hover:bg-petal-cream-2/60 transition-colors focus:outline-none focus:ring-2 focus:ring-petal-rose-deep/40"
            >
              <div className={`w-1 flex-shrink-0 ${statusAccent(it.status)}`} aria-hidden="true" />
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {it.scheduledTime && (
                      <div className="inline-flex items-center gap-1.5 text-sm text-petal-ink-soft mb-2">
                        <Calendar className="w-4 h-4" />
                        <span>預約 {formatDateTime(it.scheduledTime, tz, { alwaysShowTz: true })}</span>
                      </div>
                    )}
                    <div className="text-petal-ink text-sm leading-relaxed break-words">{it.messageContent}</div>
                    {hasAlternative && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-petal-rose-soft text-petal-rose-deep">
                        對方提了替代方式
                        {it.alternativeScheduledTime && (
                          <> · 改到 {formatDateTime(it.alternativeScheduledTime, tz)}</>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-petal-muted mt-2">
                      發送於 {formatDateTime(it.createdAt, tz)}
                    </div>
                  </div>
                  <span
                    className={`text-xs whitespace-nowrap flex-shrink-0 min-w-[4.5rem] inline-flex items-center justify-center text-center px-2 py-1 rounded-full ${statusBadgeClass(it.status)}`}
                  >
                    {translateStatus(it.status)}
                  </span>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default IntimacyRequestsHistory;
