import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  X, 
  Heart, 
  Check, 
  Clock, 
  Smile,
  Coffee,
  HandHeart
} from 'lucide-react';
import { apiService } from '../services/api';
import type { 
  Notification, 
  IntimacyRequest, 
  AlternativeIntimacyOptionsGrouped,
  AlternativeIntimacyOption,
  RespondToIntimacyRequestRequest 
} from '../services/api';

interface NotificationInboxProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
}

const NotificationInbox: React.FC<NotificationInboxProps> = ({
  isOpen,
  onClose,
  unreadCount,
  onUnreadCountChange,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeRequest, setActiveRequest] = useState<IntimacyRequest | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternativeOptions, setAlternativeOptions] = useState<AlternativeIntimacyOptionsGrouped | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState<{
    type: string;
    content: string;
    scheduledTime?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptMessage, setAcceptMessage] = useState<string>('接受你的邀請 💕');

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async function() {
    try {
      setLoading(true);
      const data = await apiService.getNotifications();
      setNotifications(data);
      
      // Mark notifications as read after fetching
      const unreadIds = data.filter(n => !n.isRead).map(n => n.id);
      if (unreadIds.length > 0) {
        await apiService.markNotificationsRead(unreadIds);
        onUnreadCountChange(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法載入通知');
    } finally {
      setLoading(false);
    }
  };

  const fetchIntimacyRequest = async function(requestId: string) {
    try {
      const requests = await apiService.getIntimacyRequests();
      const request = requests.find(r => r.id === requestId);
      if (request) {
        setActiveRequest(request);
      }
    } catch (err) {
      setError('無法載入邀請詳情');
    }
  };

  const fetchAlternativeOptions = async function() {
    try {
      const options = await apiService.getAlternativeIntimacyOptions();
      setAlternativeOptions(options);
    } catch (err) {
      setError('無法載入替代選項');
    }
  };

  const handleNotificationClick = function(notification: Notification) {
    if (notification.intimacyRequestId) {
      fetchIntimacyRequest(notification.intimacyRequestId);
    }
  };

  const handleAcceptRequest = async function() {
    if (!activeRequest) return;
    
    try {
      setLoading(true);
      await apiService.respondToIntimacyRequest(activeRequest.id, {
        accept: true,
        responseMessage: acceptMessage.trim() || undefined,
      });
      
      setActiveRequest(null);
      setAcceptMessage('接受你的邀請 💕');
      fetchNotifications(); // Refresh notifications
    } catch (err) {
      setError(err instanceof Error ? err.message : '回應失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = function() {
    if (!alternativeOptions) {
      fetchAlternativeOptions();
    }
    setShowAlternatives(true);
  };

  const handleAlternativeSelect = function(category: string, option: AlternativeIntimacyOption) {
    setSelectedAlternative({
      type: category,
      content: option.title,
    });
  };

  const handleSendAlternative = async function() {
    if (!activeRequest || !selectedAlternative) return;
    
    try {
      setLoading(true);
      
      const response: RespondToIntimacyRequestRequest = {
        accept: false,
        responseMessage: '現在不太合適，但我們可以試試這個 💝',
        alternativeType: selectedAlternative.type,
        alternativeContent: selectedAlternative.content,
        alternativeScheduledTime: selectedAlternative.scheduledTime,
      };
      
      await apiService.respondToIntimacyRequest(activeRequest.id, response);
      
      setActiveRequest(null);
      setShowAlternatives(false);
      setSelectedAlternative(null);
      fetchNotifications(); // Refresh notifications
    } catch (err) {
      setError(err instanceof Error ? err.message : '回應失敗');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = function(category: string) {
    switch (category) {
      case 'physical': return <HandHeart className="w-5 h-5 text-pink-500" />;
      case 'emotional': return <Heart className="w-5 h-5 text-red-500" />;
      case 'playful': return <Smile className="w-5 h-5 text-yellow-500" />;
      case 'companionship': return <Coffee className="w-5 h-5 text-blue-500" />;
      default: return <Heart className="w-5 h-5 text-gray-500" />;
    }
  };

  const getCategoryName = function(category: string) {
    switch (category) {
      case 'physical': return '肢體親密';
      case 'emotional': return '情感親密';
      case 'playful': return '趣味互動';
      case 'companionship': return '日常陪伴';
      default: return category;
    }
  };

  const formatTimeAgo = function(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '剛剛';
    if (diffMins < 60) return `${diffMins}分鐘前`;
    if (diffHours < 24) return `${diffHours}小時前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-TW');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w/full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
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
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Active Request Details */}
          {activeRequest && !showAlternatives && (
            <div className="p-6 border-b border-gray-200 bg-pink-50">
              <div className="flex items-start space-x-4">
                <Heart className="w-8 h-8 text-pink-500 mt-1" />
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-2">
                    來自 {activeRequest.senderNickname} 的親密邀請
                  </h4>
                  <p className="text-gray-700 mb-4 whitespace-pre-wrap">
                    {activeRequest.messageContent}
                  </p>
                  
                  {activeRequest.scheduledTime && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
                      <Clock className="w-4 h-4" />
                      <span>
                        預約時間：{new Date(activeRequest.scheduledTime).toLocaleString('zh-TW')}
                      </span>
                    </div>
                  )}

                  {activeRequest.status === 'pending' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">給對方的回覆（可自訂）</label>
                        <input
                          type="text"
                          value={acceptMessage}
                          onChange={(e) => setAcceptMessage(e.target.value)}
                          placeholder="例如：我好期待，今晚就從你的劇本開始吧"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200"
                        />
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={handleAcceptRequest}
                          disabled={loading}
                          className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 transition-colors flex items-center space-x-2"
                        >
                          <Check className="w-4 h-4" />
                          <span>接受邀請</span>
                        </button>
                        <button
                          onClick={handleRejectRequest}
                          disabled={loading}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          改個時間
                        </button>
                      </div>
                    </div>
                  )}

                  {activeRequest.status !== 'pending' && (
                    <div className="text-sm text-gray-500">
                      {activeRequest.status === 'accepted' && '✅ 已接受'}
                      {activeRequest.status === 'rejected' && '❌ 已拒絕'}
                      {activeRequest.status === 'expired' && '⏰ 已過期'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Alternative Options */}
          {showAlternatives && alternativeOptions && (
            <div className="p-6 border-b border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-4">
                選擇替代的親密方式
              </h4>
              
              <div className="space-y-4">
                {Object.entries(alternativeOptions).map(([category, options]) => (
                  <div key={category}>
                    <div className="flex items-center space-x-2 mb-3">
                      {getCategoryIcon(category)}
                      <h5 className="font-medium text-gray-900">
                        {getCategoryName(category)}
                      </h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(options as AlternativeIntimacyOption[]).map((option: AlternativeIntimacyOption) => (
                        <button
                          key={option.id}
                          onClick={() => handleAlternativeSelect(category, option)}
                          className={`p-3 text-left border rounded-lg transition-colors ${
                            selectedAlternative?.content === option.title
                              ? 'border-pink-300 bg-pink-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="font-medium text-gray-900 text-sm">
                            {option.title}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {option.description}
                          </div>
                          {option.estimatedDuration && (
                            <div className="text-xs text-gray-500 mt-1">
                              {option.estimatedDuration}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAlternatives(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSendAlternative}
                  disabled={!selectedAlternative || loading}
                  className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 transition-colors"
                >
                  {loading ? '發送中...' : '發送建議'}
                </button>
              </div>
            </div>
          )}

          {/* Notifications List */}
          {!activeRequest && (
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
          )}
        </div>

        {/* Back Button for Active Request */}
        {activeRequest && (
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={() => setActiveRequest(null)}
              className="text-sm text-pink-600 hover:text-pink-700"
            >
              ← 返回通知列表
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationInbox;
