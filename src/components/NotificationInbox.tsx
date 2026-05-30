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
      case 'wall_post':
      case 'wall_reply':
        onNavigate('wall');
        break;
      case 'event_created':
      case 'event_reply':
      case 'event_resolve_request':
      case 'event_resolved':
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
