import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { apiService, type ActivityItem } from '../services/api';
import { formatDateTime } from '../utils/datetime';
import { useTimezone } from '../contexts/TimezoneContext';
import { clientLog } from '../utils/telemetry';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface ActivityViewProps {
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

// Small dot color per activity type, mirroring the petal status-dot style.
function dotClass(type: ActivityItem['type']): string {
  switch (type) {
    case 'love_moment': return 'bg-pink-500';
    case 'custom_script': return 'bg-petal-rose-deep';
    case 'wall_post': return 'bg-petal-sage-deep';
    case 'event': return 'bg-amber-500';
    case 'achievement': return 'bg-violet-500';
    case 'coins': return 'bg-yellow-500';
    case 'checkin': return 'bg-emerald-500';
    default: return 'bg-petal-muted';
  }
}

// 最近動態 — recent activity (you + partner), shown as its own view reached from
// the profile dropdown.
const ActivityView: React.FC<ActivityViewProps> = ({ showNotification }) => {
  const tz = useTimezone();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiService.getActivityFeed()
      .then((items) => {
        if (cancelled) return;
        setActivities(items);
        clientLog('activity.loaded', { count: items.length });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(true);
        clientLog('activity.load_error', {
          message: err instanceof Error ? err.message : String(err),
        }, 'error');
        showNotification({
          type: 'warning',
          title: '最近動態載入失敗',
          message: '無法載入最近動態，請稍後再試。',
          duration: 5000,
        });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 sm:space-y-10" data-testid="activity-view">
      <div className="border-b border-petal-rule pb-5 sm:pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2 sm:mb-3">
          — 動態
        </div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.1] md:leading-[1.05] mb-3">
          <em className="not-italic font-light italic text-pink-600">最近動態</em>
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          你與另一半最近的足跡。
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6" data-testid="activity-feed">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-petal-rule border-t-petal-rose-deep" />
          </div>
        ) : error ? (
          <p className="font-body text-sm text-petal-muted py-6 text-center">
            無法載入最近動態，請稍後再試。
          </p>
        ) : activities.length === 0 ? (
          <div className="py-10 text-center">
            <Activity className="w-8 h-8 mx-auto text-petal-rule mb-3" strokeWidth={1.5} />
            <p className="font-body text-sm text-petal-muted">
              還沒有最近動態，開始記錄你們的時光吧。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-petal-rule">
            {activities.map((a) => (
              <li key={a.id} data-testid="activity-item" className="flex items-start gap-3 py-2.5">
                <span className={`mt-1.5 w-2.5 h-2.5 rounded-sm flex-shrink-0 ${dotClass(a.type)}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-body text-sm text-petal-ink break-words">
                    <span className="font-medium">{a.isSelf ? '你' : (a.actorNickname || '你們')}</span>
                    {' '}
                    {a.description}
                  </p>
                  <p className="font-body text-xs text-petal-muted mt-0.5">
                    {formatDateTime(a.date, tz)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ActivityView;
