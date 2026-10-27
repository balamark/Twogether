import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { apiService } from '../services/api';
import type { Notification } from '../services/api';
import { useScrollLock } from '../hooks/useScrollLock';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatRelativeOrDate } from '../utils/datetime';
import { tr } from '../i18n/tr';

interface ToastInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface NotificationInboxProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
  // payload: the event / couple / wall post / love moment id to land on;
  // subPayload: the wall reply inside that post's thread.
  onNavigate?: (view: string, payload?: string, subPayload?: string) => void;
  showNotification?: (n: ToastInput) => void;
}

const NotificationInbox: React.FC<NotificationInboxProps> = ({
  isOpen,
  onClose,
  unreadCount,
  onUnreadCountChange,
  onNavigate,
  showNotification,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tz = useTimezone();

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiService.getNotifications();
      setError(null);
      setNotifications(data);
      // Opening the inbox no longer marks everything read: each item keeps its
      // 「新」 dot until the user actually taps it (or uses 全部標為已讀).
      onUnreadCountChange(data.filter(n => !n.isRead).length);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError(err instanceof Error ? err.message : tr('無法載入通知', 'Couldn\'t load notifications. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Optimistic mark-read (playbook §R7): clear the dot + badge immediately,
  // sync in the background, roll back and tell the user if the server refuses.
  const markRead = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const readAt = new Date().toISOString();
    setNotifications(prev => prev.map(n => (idSet.has(n.id) ? { ...n, isRead: true, readAt } : n)));
    onUnreadCountChange(Math.max(0, unreadCount - ids.length));
    apiService.markNotificationsRead(ids).catch((err) => {
      console.error('Failed to mark notifications as read:', err);
      setNotifications(prev => prev.map(n => (idSet.has(n.id) ? { ...n, isRead: false, readAt: undefined } : n)));
      apiService.getUnreadNotificationCount().then(onUnreadCountChange);
      showNotification?.({
        type: 'warning',
        title: tr('已讀狀態沒有儲存', 'Read status wasn\'t saved'),
        message: tr('網路不穩，這則通知仍會顯示為未讀。請稍後再打開通知中心點一次。', 'Connection hiccup — the notification still shows as unread. Open the inbox and tap it again later.'),
      });
    });
  };

  const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) markRead([notification.id]);
    if (!onNavigate) {
      onClose();
      return;
    }
    switch (notification.notificationType) {
      // Wall activity (incl. AI 諮商師 comments) → the exact post, and for a
      // reply the exact reply inside its thread. Older rows without a target
      // just open the wall.
      case 'wall_post':
      case 'wall_reply':
      case 'wall_reaction':
      case 'wall_ai_comment':
        onNavigate('wall', notification.targetId, notification.targetReplyId);
        break;
      // The three 一起收尾 types land here too: the closure panel (or the summary
      // card, once it's finished) is on the event itself.
      case 'event_created':
      case 'event_reply':
      case 'event_ai_comment':
      case 'event_resolve_request':
      case 'event_resolved':
      case 'event_reopened':
      case 'event_closing_started':
      case 'event_closure_partner_ready':
      case 'event_closure_done':
        if (notification.eventId) {
          onNavigate('events', notification.eventId);
        } else {
          onNavigate('events');
        }
        break;
      // 替代方案協商 answers + co-authored plan changes live on the same page.
      case 'intimacy_request':
      case 'request_response':
      case 'negotiation_accepted':
      case 'negotiation_later':
      case 'negotiation_declined':
      case 'alt_plan_proposed':
      case 'alt_plan_updated':
      case 'alt_plan_approved':
      case 'alt_plan_disabled':
      case 'alt_plan_reactivated':
        onNavigate('intimacy-history');
        break;
      case 'consultation_message':
        onNavigate('therapists');
        break;
      // 情緒深潛 — one partner shared their feelings, or responded to a shared
      // journey; open the deep-dive layer (App resolves the active/incoming one).
      case 'deep_dive_shared':
      case 'deep_dive_partner_responded':
        onNavigate('deep-dive');
        break;
      // 專屬心理師關係變化。伴侶端：帶到「心理諮商」分頁（可管理專屬心理師）。
      // 專屬諮商空間 new message / session saved → the couple's 心理諮商 page,
      // where the panel shows the 新訊息 badge and opens the space.
      case 'dedicated_therapist_added':
      case 'dedicated_message':
        onNavigate('therapists');
        break;
      // 諮商師端：有伴侶把你設為專屬諮商師 → 帶到諮商工作台的「我輔導的伴侶」，
      // 並自動開啟你所諮商的那對伴侶的頁面。payload 帶 coupleId 精準定位該對伴侶；
      // 舊通知沒有 coupleId 時，App 會退回開啟最新一筆 client。
      case 'dedicated_client_added':
      case 'dedicated_client_message':
        onNavigate('counselor', notification.coupleId);
        break;
      // Partner-action notifications (services/notificationService.js): route each
      // to the tab where the action lives so the tap lands somewhere useful.
      // A record that still exists → its row on the 時間軸 (timeline).
      case 'love_moment_created':
      case 'love_moment_updated':
      case 'love_moment_response':
        onNavigate('record', notification.targetId);
        break;
      case 'love_moment_deleted':
      case 'cycle_record_created':
      case 'cycle_record_updated':
      case 'cycle_record_deleted':
        onNavigate('record');
        break;
      case 'custom_script_created':
      case 'custom_script_updated':
      case 'custom_script_deleted':
        onNavigate('roleplay');
        break;
      case 'custom_gift_created':
      case 'custom_gift_updated':
      case 'custom_gift_deleted':
        onNavigate('shop');
        break;
      case 'assessment_saved':
      case 'love_wish_created':
      case 'love_wish_deleted':
        onNavigate('love-language');
        break;
      // 婚姻檢查 + Sophie 衝突即時介入 (released / understood) all live on the
      // 接住情緒 (conflict) surface.
      case 'checkup_created':
      case 'checkup_response':
      case 'conflict_released':
      case 'conflict_understood':
        onNavigate('conflict');
        break;
      case 'couple_settings_updated':
      case 'profile_updated':
        onNavigate('settings');
        break;
      // 有人在你的故事留言 → 故事頁。
      case 'story_comment':
        onNavigate('stories');
        break;
      // 關係之屋提醒（每週檢視 / 好久沒親密 / 存好感）→ 首頁的關係儀表板。
      case 'relationship_checkin_due':
      case 'relationship_intimacy_gap':
      case 'relationship_appreciation_gap':
        onNavigate('home');
        break;
      // Unknown / future types still land somewhere instead of a dead tap.
      default:
        onNavigate('home');
        break;
    }
    onClose();
  };

  const formatTimeAgo = (dateString: string) => formatRelativeOrDate(dateString, tz);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[min(90vh,calc(100dvh-80px))] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Bell className="w-6 h-6 text-pink-500" />
            <h3 className="text-xl font-semibold text-gray-900">{tr('通知中心', 'Notifications')}</h3>
            {unreadIds.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {unreadIds.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadIds.length > 0 && (
              <button
                type="button"
                onClick={() => markRead(unreadIds)}
                data-testid="notification-mark-all-read"
                className="flex items-center gap-1 text-xs sm:text-sm text-pink-600 hover:text-pink-700 px-2 py-1 rounded-md hover:bg-pink-50 transition-colors"
              >
                <CheckCheck className="w-4 h-4" />
                {tr('全部標為已讀', 'Mark all read')}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={tr('關閉', 'Close')}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
                <p className="mt-2 text-gray-600">{tr('載入通知中...', 'Loading notifications...')}</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{tr('目前沒有通知', 'No notifications yet')}</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  role="button"
                  tabIndex={0}
                  key={notification.id}
                  data-testid={`notification-item-${notification.notificationType}`}
                  data-unread={!notification.isRead ? 'true' : 'false'}
                  className={`block w-full text-left p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                    !notification.isRead ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNotificationClick(notification);
                    }
                  }}
                >
                  <div className="flex items-start space-x-3">
                    {/* 「新」 dot: only on unread items; disappears once tapped.
                        The empty slot keeps read items' text aligned. */}
                    {!notification.isRead ? (
                      <span
                        data-testid="notification-unread-dot"
                        aria-label={tr('新通知', 'New')}
                        className={`shrink-0 w-2 h-2 rounded-full mt-2 ${
                          notification.priority === 3 ? 'bg-red-500' :
                          notification.priority === 2 ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }`}
                      ></span>
                    ) : (
                      <span className="shrink-0 w-2 h-2 mt-2" aria-hidden="true"></span>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className={`text-gray-900 ${!notification.isRead ? 'font-semibold' : 'font-medium'}`}>
                          {notification.title}
                        </h5>
                        <span className="shrink-0 text-xs text-gray-500">
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 mt-1">
                        {notification.content}
                      </p>

                      {notification.relatedUserNickname && (
                        <p className="text-xs text-gray-500 mt-1">
                          {tr('來自：', 'From:')}{notification.relatedUserNickname}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationInbox;
