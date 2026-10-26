import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Inbox, Send, ListChecks } from 'lucide-react';
import apiService from '../services/api';
import type { IntimacyRequest, IntimacyRequestStats, IntimacyRequestNudge } from '../services/api';
import IntimacyRequestDetailModal from './IntimacyRequestDetailModal';
import AlternativePlansPanel from './AlternativePlansPanel';
import { intimacyStatusLabel, intimacyStatusBadgeClass, intimacyStatusAccent, isAwaitingResponse } from './intimacyStatus';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime } from '../utils/datetime';
import { tr } from '../i18n/tr';
import { useHistoryState } from '../hooks/useHistoryState';

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
  /** Navigate to the roleplay view and open the named script. */
  onViewScript?: (title: string) => void;
  /** Empty-state CTA: open the send-invite form. */
  onSendInvite?: () => void;
}

type FeedbackState = { type: 'success' | 'error'; message: string };
type Tab = 'received' | 'sent' | 'plans';

export const IntimacyRequestsHistory: React.FC<IntimacyRequestsHistoryProps> = ({ authState, partnerNickname, onViewScript, onSendInvite }) => {
  const [items, setItems] = useState<IntimacyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<IntimacyRequestStats | null>(null);
  const [nudge, setNudge] = useState<IntimacyRequestNudge | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<FeedbackState | null>(null);
  const [tab, setTab] = useState<Tab>('received');
  const [tabInitialized, setTabInitialized] = useState(false);
  // History-backed so 上一頁 closes the detail modal instead of leaving.
  const [detailOpenId, setDetailOpenId] = useHistoryState<string | null>('intimacy:detail', null, { scrollTop: false });
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
      setError((e as Error)?.message || tr('載入失敗', 'Couldn\'t load'));
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
    const hasPendingReceived = received.some((r) => isAwaitingResponse(r.status, r.requestType));
    setTab(hasPendingReceived ? 'received' : sent.length > 0 ? 'sent' : 'received');
    setTabInitialized(true);
  }, [tabInitialized, loading, items.length, received, sent]);

  const handleSendNudgeEmail = useCallback(async () => {
    if (!nudge?.message) {
      setEmailFeedback({ type: 'error', message: tr('目前沒有需要提醒的訊息。', 'No reminders needed right now.') });
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
        message: (err as Error)?.message || tr('寄送失敗，請稍後再試。', 'Couldn\'t send. Please try again in a moment.')
      });
    } finally {
      setSendingEmail(false);
    }
  }, [nudge]);

  if (!authState.isAuthenticated) {
    return (
      <div className="text-center py-10 text-gray-500">{tr('請先登入以查看歷史親密邀請', 'Please sign in to see your past intimacy invitations')}</div>
    );
  }

  const activeItems = tab === 'received' ? received : tab === 'sent' ? sent : [];
  const activeEmptyText = tab === 'received' ? tr('尚無收到紀錄', 'Nothing received yet') : tr('尚無發送紀錄', 'Nothing sent yet');
  const detailRequest = detailOpenId
    ? items.find((it) => it.id === detailOpenId) ?? null
    : null;

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          {tr('— 紀錄', '— History')}
        </div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.1] md:leading-[1.05] mb-3">
          {tr('親密', 'Intimacy')}<em className="not-italic font-light italic text-pink-600">{tr('邀請紀錄', ' invitations')}</em>
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          {tr('查看你發送與收到的所有邀請。', 'See every invitation you\'ve sent and received.')}
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
            <nav className="flex flex-wrap gap-2 mb-5 border-b border-petal-rule pb-3" role="tablist" aria-label={tr("親密邀請紀錄", 'Intimacy invitation history')}>
              <TabButton
                active={tab === 'received'}
                onClick={() => setTab('received')}
                icon={Inbox}
                label={tr("我收到的", 'Received')}
                count={received.length}
              />
              <TabButton
                active={tab === 'sent'}
                onClick={() => setTab('sent')}
                icon={Send}
                label={tr("我發送的", 'Sent')}
                count={sent.length}
              />
              <TabButton
                active={tab === 'plans'}
                onClick={() => setTab('plans')}
                icon={ListChecks}
                label={tr("共同方案", 'Shared plans')}
              />
            </nav>

            {tab === 'plans' ? (
              <AlternativePlansPanel partnerNickname={partnerNickname} onSendInvite={onSendInvite} />
            ) : (
            <RequestList
              items={activeItems}
              emptyText={activeEmptyText}
              emptyAction={
                tab === 'sent' && onSendInvite ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-petal-ink-soft max-w-xs mx-auto leading-relaxed">
                      {tr('挑一種心情或一部劇本，讓另一半知道你今晚想靠近；對方可以接受、改時間或提替代方案。', 'Pick a mood or a script to let your partner know you\'d like to be close tonight. They can accept, suggest another time, or offer an alternative.')}
                    </p>
                    <button
                      type="button"
                      data-testid="intimacy-empty-send"
                      onClick={onSendInvite}
                      className="px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
                    >
                      {tr('發出第一個邀請', 'Send your first invitation')}
                    </button>
                  </div>
                ) : undefined
              }
              tz={tz}
              onOpenDetail={(id) => setDetailOpenId(id)}
            />
            )}
          </div>
        </>
      )}

      <IntimacyRequestDetailModal
        request={detailRequest}
        direction={detailRequest?.direction ?? (tab === 'sent' ? 'sent' : 'received')}
        onOpenPlans={() => setTab('plans')}
        onClose={() => setDetailOpenId(null)}
        onResponded={() => {
          setDetailOpenId(null);
          fetchAll();
        }}
        onViewScript={onViewScript}
      />
    </div>
  );
};

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Inbox;
  label: string;
  count?: number;
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
      {count !== undefined && (
        <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-petal-cream/20 text-petal-cream' : 'bg-petal-cream-2 text-petal-muted'}`}>
          {count}
        </span>
      )}
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
          <h3 className="text-lg font-bold text-gray-800">{tr('邀請統計', 'Invitation stats')}</h3>
          <p className="text-sm text-gray-500 mt-1">{tr('了解過去一週與一個月內，你對伴侶邀請的回應情況', 'How you\'ve responded to your partner\'s invitations over the past week and month')}</p>
        </div>
      </div>

      <div className="space-y-5 mt-6">
        <StatsBar label={tr("過去一週", 'Past week')} stats={stats.week} />
        <StatsBar label={tr("過去一個月", 'Past month')} stats={stats.month} />
      </div>

      {nudge?.shouldNudge && nudge.message && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-800 mb-2">{tr('貼心提醒', 'A gentle reminder')}</h4>
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
                {sendingEmail ? tr('寄送中…', 'Sending…') : tr('寄送提醒信給伴侶 →', 'Send your partner a reminder email →')}
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
          <h4 className="text-sm font-semibold text-indigo-700 mb-2">{tr('邀請洞察', 'Invitation insights')}</h4>
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
          {tr('共', '')} <b className="not-italic font-medium text-petal-ink">{total}</b> {tr('次', ' total')}
        </span>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-petal-cream-2 border border-petal-rule-soft">
        {stats.accepted > 0 && (
          <div
            className="bg-petal-sage-deep"
            style={{ width: `${pct(stats.accepted)}%` }}
            title={tr(`已接受 ${stats.accepted}`, `Accepted ${stats.accepted}`)}
          />
        )}
        {stats.rejected > 0 && (
          <div
            className="bg-petal-rose-deep"
            style={{ width: `${pct(stats.rejected)}%` }}
            title={tr(`已婉拒 ${stats.rejected}`, `Declined ${stats.rejected}`)}
          />
        )}
        {stats.unanswered > 0 && (
          <div
            className="bg-amber-300"
            style={{ width: `${pct(stats.unanswered)}%` }}
            title={tr(`待回應 ${stats.unanswered}`, `Awaiting ${stats.unanswered}`)}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-petal-ink-soft">
        <span className="inline-flex items-center">
          <span className="w-2.5 h-2.5 rounded-sm bg-petal-sage-deep mr-1.5" />
          {tr('已接受', 'Accepted')} <b className="not-italic font-medium text-petal-ink ml-1">{stats.accepted}</b>
        </span>
        <span className="inline-flex items-center">
          <span className="w-2.5 h-2.5 rounded-sm bg-petal-rose-deep mr-1.5" />
          {tr('已婉拒', 'Declined')} <b className="not-italic font-medium text-petal-ink ml-1">{stats.rejected}</b>
        </span>
        <span className="inline-flex items-center">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-300 mr-1.5" />
          {tr('待回應', 'Awaiting reply')} <b className="not-italic font-medium text-petal-ink ml-1">{stats.unanswered}</b>
        </span>
      </div>

      {total === 0 && (
        <p className="mt-2 font-display italic text-xs text-petal-muted">{tr('尚無紀錄', 'No records yet')}</p>
      )}
    </div>
  );
}

function buildInvitationInsights(stats: IntimacyRequestStats): string[] {
  const insights: string[] = [];

  const weekTotal = stats.week.accepted + stats.week.rejected + stats.week.unanswered;
  if (weekTotal === 0) {
    insights.push(tr('過去一週暫無新的親密邀請，或許可以主動為關係安排一次小驚喜。', 'No new invitations this past week. Maybe plan a little surprise for your relationship.'));
  } else {
    insights.push(tr(`過去一週你收到 ${weekTotal} 次邀請，其中溫柔接納了 ${stats.week.accepted} 次。`, `You received ${weekTotal} invitations this past week and warmly accepted ${stats.week.accepted}.`));
    if (stats.week.unanswered > 0) {
      insights.push(tr(`目前有 ${stats.week.unanswered} 次邀請在等待回覆，適時回應能讓伴侶感到被重視。`, `${stats.week.unanswered} invitations are waiting for a reply. Responding in time helps your partner feel valued.`));
    }
  }

  const monthTotal = stats.month.accepted + stats.month.rejected + stats.month.unanswered;
  if (monthTotal === 0) {
    insights.push(tr('過去一個月還沒有任何邀請紀錄，一起創造新的甜蜜時光吧。', 'No invitations in the past month. Let\'s create some sweet new moments together.'));
  } else {
    const acceptanceRate = monthTotal > 0 ? Math.round((stats.month.accepted / monthTotal) * 100) : 0;
    insights.push(tr(`過去一個月你們共處理了 ${monthTotal} 次邀請，整體回覆率約為 ${acceptanceRate}%。`, `You handled ${monthTotal} invitations together this past month, with a response rate of about ${acceptanceRate}%.`));
    if (stats.month.rejected >= 3) {
      insights.push(tr(`本月有 ${stats.month.rejected} 次邀請被婉拒，分享你的狀態或界線能讓彼此更理解。`, `${stats.month.rejected} invitations were declined this month. Sharing how you feel or your boundaries helps you understand each other.`));
    }
    if (stats.month.unanswered >= 3) {
      insights.push(tr(`本月仍有 ${stats.month.unanswered} 次邀請尚未回覆，安排一個舒服的時間聊聊彼此期待吧。`, `${stats.month.unanswered} invitations this month still need a reply. Find a comfortable time to talk about what you each hope for.`));
    }
  }

  return insights.slice(0, 4);
}

function RequestList({
  items,
  emptyText,
  emptyAction,
  tz,
  onOpenDetail,
}: {
  items: IntimacyRequest[];
  emptyText: string;
  emptyAction?: React.ReactNode;
  tz: string;
  onOpenDetail: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="py-6 text-center" data-testid="intimacy-empty-state">
        <div className="text-gray-500 text-sm font-display italic">{emptyText}</div>
        {emptyAction}
      </div>
    );
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
              <div className={`w-1 flex-shrink-0 ${intimacyStatusAccent(it.status, it.requestType)}`} aria-hidden="true" />
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {it.scheduledTime && (
                      <div className="inline-flex items-center gap-1.5 text-sm text-petal-ink-soft mb-2">
                        <Calendar className="w-4 h-4" />
                        <span>{tr('預約', 'Scheduled')} {formatDateTime(it.scheduledTime, tz, { alwaysShowTz: true })}</span>
                      </div>
                    )}
                    {it.requestType === 'negotiation' && (
                      <div className="text-xs text-petal-rose-deep mb-1">{tr('💬 替代方案協商', '💬 Talk about alternatives')}</div>
                    )}
                    <div className="text-petal-ink text-sm leading-relaxed break-words">{it.messageContent}</div>
                    {it.scriptTitle && (
                      <div className="mt-1.5 text-xs text-petal-rose-deep" data-testid="request-row-script">
                        {tr('🎭 劇本《', '🎭 Script “')}{it.scriptTitle}{tr('》', '”')}
                      </div>
                    )}
                    {hasAlternative && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-petal-rose-soft text-petal-rose-deep">
                        {tr('對方提了替代方式', 'They suggested an alternative')}
                        {it.alternativeScheduledTime && (
                          <> {tr('· 改到', '· Moved to')} {formatDateTime(it.alternativeScheduledTime, tz)}</>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-petal-muted mt-2">
                      {tr('發送於', 'Sent')} {formatDateTime(it.createdAt, tz)}
                    </div>
                  </div>
                  <span
                    className={`text-xs whitespace-nowrap flex-shrink-0 min-w-[4.5rem] inline-flex items-center justify-center text-center px-2 py-1 rounded-full ${intimacyStatusBadgeClass(it.status, it.requestType)}`}
                  >
                    {intimacyStatusLabel(it.status, it.requestType)}
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
