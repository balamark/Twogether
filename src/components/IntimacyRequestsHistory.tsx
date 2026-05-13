import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiService from '../services/api';
import type { IntimacyRequest, IntimacyRequestStats, IntimacyRequestNudge } from '../services/api';

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

export const IntimacyRequestsHistory: React.FC<IntimacyRequestsHistoryProps> = ({ authState, partnerNickname: partnerNicknameOverride }) => {
  const [items, setItems] = useState<IntimacyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<IntimacyRequestStats | null>(null);
  const [nudge, setNudge] = useState<IntimacyRequestNudge | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<FeedbackState | null>(null);
  const me = authState.user?.nickname || '';
  const meId = authState.user?.id || '';
  const partnerNickname = partnerNicknameOverride || authState.user?.partnerNickname || '';

  useEffect(() => {
    if (!authState.isAuthenticated) {
      setItems([]);
      setStats(null);
      setNudge(null);
      setEmailFeedback(null);
      setSendingEmail(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setEmailFeedback(null);
        // Fetch invitation records and statistics in parallel
        const [all, statsResponse] = await Promise.all([
          apiService.getIntimacyRequests(),
          apiService.getIntimacyRequestStats()
        ]);
        setItems(all);
        setStats(statsResponse.statistics);
        setNudge(statsResponse.nudge);
      } catch (e) {
        setError((e as Error)?.message || '載入失敗');
      } finally {
        setLoading(false);
      }
    })();
  }, [authState.isAuthenticated]);

  const { sent, received } = useMemo(() => {
    const s: IntimacyRequest[] = [];
    const r: IntimacyRequest[] = [];
    items.forEach((it) => {
      // Use direction field from backend if available, fallback to nickname comparison
      if (it.direction === 'sent') {
        s.push(it);
      } else if (it.direction === 'received') {
        r.push(it);
      } else {
        // Fallback: categorize by id or nickname if direction is not available
        if (it.senderId && it.senderId === meId) {
          s.push(it);
        } else if (it.receiverId && it.receiverId === meId) {
          r.push(it);
        } else if (it.senderNickname === me) {
          s.push(it);
        } else if (it.receiverNickname === me) {
          r.push(it);
        }
      }
    });
    return { sent: s, received: r };
  }, [items, me, meId]);

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

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 紀錄
        </div>
        <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">我發送的</h3>
              <RequestList
                items={sent}
                emptyText="尚無發送紀錄"
                meId={meId}
                partnerNickname={partnerNickname}
              />
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">我收到的</h3>
              <RequestList
                items={received}
                emptyText="尚無收到紀錄"
                meId={meId}
                partnerNickname={partnerNickname}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <StatsCard label="過去一週" stats={stats.week} emphasis="week" />
        <StatsCard label="過去一個月" stats={stats.month} emphasis="month" />
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

function StatsCard({
  label,
  stats,
  emphasis,
}: {
  label: string;
  stats: IntimacyRequestStats['week'];
  emphasis: 'week' | 'month';
}) {
  const chips = [
    {
      label: '已接受',
      value: stats.accepted,
      color: 'bg-green-50 text-green-700 border border-green-200',
      description: '代表你願意的回應次數'
    },
    {
      label: '已婉拒',
      value: stats.rejected,
      color: 'bg-red-50 text-red-700 border border-red-200',
      description: '可協助伴侶了解你的狀態'
    },
    {
      label: '待回應',
      value: stats.unanswered,
      color: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
      description: '提醒你可以回覆或溝通'
    }
  ];

  return (
    <div className="rounded-md border border-petal-rule bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h4 className="font-display text-lg font-medium tracking-tight text-petal-ink">{label}</h4>
        <span className="font-body text-[10px] uppercase tracking-[0.14em] text-petal-muted">{emphasis === 'week' ? '7 日內' : '30 日內'}</span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {chips.map((chip) => (
          <StatChip key={chip.label} {...chip} />
        ))}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
  description
}: {
  label: string;
  value: number;
  color: string;
  description: string;
}) {
  return (
    <div className={`${color} rounded-lg px-4 py-3 transition-shadow hover:shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xl font-bold">{value}</span>
      </div>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
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

function RequestList({
  items,
  emptyText,
  meId,
  partnerNickname,
}: {
  items: IntimacyRequest[];
  emptyText: string;
  meId: string;
  partnerNickname?: string;
}) {
  if (items.length === 0) {
    return <div className="text-gray-500 text-sm">{emptyText}</div>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((it) => {
        const { senderLabel, receiverLabel } = resolveRequestLabels({
          item: it,
          meId,
          partnerNickname,
        });
        return (
          <li key={it.id} className="py-3 flex items-start justify-between">
            <div>
              <div className="text-sm text-gray-600">
                <span className="font-medium text-gray-800">{senderLabel}</span>
                <span className="mx-1">→</span>
                <span className="font-medium text-gray-800">{receiverLabel}</span>
              </div>
            <div className="text-gray-700 text-sm mt-1">{it.messageContent}</div>
            <div className="text-xs text-gray-400 mt-1">{new Date(it.createdAt).toLocaleString('zh-TW')}</div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${
            it.status === 'accepted' ? 'bg-green-100 text-green-700' : it.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
          }`}>{translateStatus(it.status)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function translateStatus(status: string): string {
  if (status === 'accepted') return '已接受';
  if (status === 'rejected') return '已拒絕';
  if (status === 'expired') return '已過期';
  return '待回應';
}

function resolveRequestLabels({
  item,
  meId,
  partnerNickname,
}: {
  item: IntimacyRequest;
  meId: string;
  partnerNickname?: string;
}) {
  const fallbackPartner = partnerNickname || '伴侶';

  if (item.direction === 'sent') {
    return {
      senderLabel: '你',
      receiverLabel: partnerNickname || item.receiverNickname || fallbackPartner,
    };
  }

  if (item.direction === 'received') {
    return {
      senderLabel: partnerNickname || item.senderNickname || fallbackPartner,
      receiverLabel: '你',
    };
  }

  if (item.senderId && item.senderId === meId) {
    return {
      senderLabel: '你',
      receiverLabel: partnerNickname || item.receiverNickname || fallbackPartner,
    };
  }

  if (item.receiverId && item.receiverId === meId) {
    return {
      senderLabel: partnerNickname || item.senderNickname || fallbackPartner,
      receiverLabel: '你',
    };
  }

  return {
    senderLabel: item.senderNickname || fallbackPartner,
    receiverLabel: item.receiverNickname || fallbackPartner,
  };
}

export default IntimacyRequestsHistory;
