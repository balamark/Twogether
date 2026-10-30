import React, { useEffect } from 'react';
import { Activity } from 'lucide-react';
import type { ActivityItem } from '../services/api';
import { useActivityFeed } from '../hooks/usePageData';
import { formatDateTime } from '../utils/datetime';
import { useTimezone } from '../contexts/TimezoneContext';
import { clientLog } from '../utils/telemetry';
import { isPositiveInteraction, POSITIVE_INTERACTION_ACTIONS } from '../content/positiveInteractions';
import { tr } from '../i18n/tr';
import { useFeatureFlag } from '../contexts/FeatureFlagsContext';

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
  // The +1 legend/badges belong to the auto-counted 好感存款, paused while
  // 感情存款 is the app's one 存款 (lib/featureFlags.js goodwill_meter).
  const showGoodwill = useFeatureFlag('goodwill_meter');
  const tz = useTimezone();
  // Shared cached feed with the 首頁 teaser (src/hooks/usePageData.ts).
  const feed = useActivityFeed();
  const activities = feed.data ?? [];
  const loading = feed.loading;
  const error = !!feed.error;

  useEffect(() => {
    if (feed.data) clientLog('activity.loaded', { count: feed.data.length });
  }, [feed.data]);

  useEffect(() => {
    if (!feed.error) return;
    clientLog('activity.load_error', { message: feed.error.message }, 'error');
    showNotification({
      type: 'warning',
      title: tr('最近動態載入失敗', 'Couldn\'t load recent activity'),
      message: tr('無法載入最近動態，請稍後再試。', 'Couldn\'t load recent activity. Please try again in a moment.'),
      duration: 5000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.error]);

  return (
    <div className="space-y-6 sm:space-y-10" data-testid="activity-view">
      <div className="border-b border-petal-rule pb-5 sm:pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2 sm:mb-3">
          {tr('— 動態', '— Activity')}
        </div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.1] md:leading-[1.05] mb-3">
          <em className="not-italic font-light italic text-pink-600">{tr('最近動態', 'Recent activity')}</em>
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          {tr('你與另一半最近的足跡。', 'Recent traces of you and your partner.')}
        </p>
      </div>

      {/* Ties the feed back to「我們正在愛」的那個數字: which rows earned a +1,
          and what all counts. So the number on 我們 stops being a mystery. */}
      {showGoodwill && (
      <div
        className="rounded-2xl border border-petal-rose-soft bg-petal-rose-soft/20 p-4 sm:p-5"
        data-testid="activity-positive-legend"
      >
        <p className="font-body text-sm text-petal-ink leading-relaxed">
          {tr('標有', 'Items marked')}
          <span className="mx-1 inline-flex items-center rounded-full bg-petal-rose-deep px-1.5 py-0.5 align-middle font-body text-[10px] font-semibold text-white">
            +1
          </span>
          {tr('的是', 'are ')}<span className="font-medium">{tr('正向互動', 'positive interactions')}</span> {tr('— 每一個都替你們「我們正在愛」的美好存款加 1 分，越多越好。', ' — each adds 1 to your "we are loving" savings. The more the better.')}
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {POSITIVE_INTERACTION_ACTIONS.map((a) => (
            <li key={a.label} className="font-body text-[12px] text-petal-ink-soft">
              <span aria-hidden>{a.emoji}</span> {a.label}
            </li>
          ))}
        </ul>
      </div>
      )}

      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6" data-testid="activity-feed">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-petal-rule border-t-petal-rose-deep" />
          </div>
        ) : error ? (
          <p className="font-body text-sm text-petal-muted py-6 text-center">
            {tr('無法載入最近動態，請稍後再試。', 'Couldn\'t load recent activity. Please try again in a moment.')}
          </p>
        ) : activities.length === 0 ? (
          <div className="py-10 text-center">
            <Activity className="w-8 h-8 mx-auto text-petal-rule mb-3" strokeWidth={1.5} />
            <p className="font-body text-sm text-petal-muted">
              {tr('還沒有最近動態，開始記錄你們的時光吧。', 'No recent activity yet. Start recording your moments together.')}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-petal-rule">
            {activities.map((a) => (
              <li key={a.id} data-testid="activity-item" className="flex items-start gap-3 py-2.5">
                <span className={`mt-1.5 w-2.5 h-2.5 rounded-sm flex-shrink-0 ${dotClass(a.type)}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-body text-sm text-petal-ink break-words">
                    <span className="font-medium">{a.isSelf ? tr('你', 'You') : (a.actorNickname || tr('你們', 'You both'))}</span>
                    {' '}
                    {a.description}
                    {showGoodwill && isPositiveInteraction(a.type) && (
                      <span
                        className="ml-1.5 inline-flex items-center rounded-full bg-petal-rose-deep px-1.5 py-0.5 align-middle font-body text-[10px] font-semibold text-white"
                        data-testid="activity-plus-one"
                        title={tr("正向互動 +1：替你們的美好存款加了 1 分", 'Positive interaction +1: added 1 to your savings of good moments')}
                      >
                        +1
                      </span>
                    )}
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
