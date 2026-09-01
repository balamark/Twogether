import React, { useState, useEffect, useCallback } from 'react';
import { Bell, X } from 'lucide-react';
import { apiService } from '../services/api';
import type { Notification } from '../services/api';
import { useScrollLock } from '../hooks/useScrollLock';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatRelativeOrDate } from '../utils/datetime';

interface NotificationInboxProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
  onNavigate?: (view: string, payload?: string) => void;
}

const NotificationInbox: React.FC<NotificationInboxProps> = ({
  isOpen,
  onClose,
  unreadCount,
  onUnreadCountChange,
  onNavigate,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tz = useTimezone();

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiService.getNotifications();
      setNotifications(data);

      const unreadIds = data.filter(n => !n.isRead).map(n => n.id);
      if (unreadIds.length > 0) {
        await apiService.markNotificationsRead(unreadIds);
        onUnreadCountChange(0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError(err instanceof Error ? err.message : '無法載入通知');
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const handleNotificationClick = (notification: Notification) => {
    if (!onNavigate) {
      onClose();
      return;
    }
    switch (notification.notificationType) {
      // Wall activity (incl. AI 諮商師 comments) → the wall thread.
      case 'wall_post':
      case 'wall_reply':
      case 'wall_reaction':
      case 'wall_ai_comment':
        onNavigate('wall');
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
      case 'intimacy_request':
      case 'request_response':
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
      case 'dedicated_therapist_added':
        onNavigate('therapists');
        break;
      // 諮商師端：有伴侶把你設為專屬諮商師 → 帶到諮商工作台的「我輔導的伴侶」，
      // 並自動開啟你所諮商的那對伴侶的頁面。payload 帶 coupleId 精準定位該對伴侶；
      // 舊通知沒有 coupleId 時，App 會退回開啟最新一筆 client。
      case 'dedicated_client_added':
        onNavigate('counselor', notification.coupleId);
        break;
      // Partner-action notifications (services/notificationService.js): route each
      // to the tab where the action lives so the tap lands somewhere useful.
      case 'love_moment_created':
      case 'love_moment_updated':
      case 'love_moment_deleted':
      case 'love_moment_response':
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
      case 'checkup_created':
      case 'checkup_response':
        onNavigate('conflict');
        break;
      case 'couple_settings_updated':
      case 'profile_updated':
        onNavigate('settings');
        break;
      default:
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
            <h3 className="text-xl font-semibold text-gray-900">通知中心</h3>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
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
                <p className="mt-2 text-gray-600">載入通知中...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">目前沒有通知</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  data-testid={`notification-item-${notification.notificationType}`}
                  className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                    !notification.isRead ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      notification.priority === 3 ? 'bg-red-500' :
                      notification.priority === 2 ? 'bg-yellow-500' :
                      'bg-blue-500'
                    }`}></div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h5 className="font-medium text-gray-900">
                          {notification.title}
                        </h5>
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 mt-1">
                        {notification.content}
                      </p>

                      {notification.relatedUserNickname && (
                        <p className="text-xs text-gray-500 mt-1">
                          來自：{notification.relatedUserNickname}
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
