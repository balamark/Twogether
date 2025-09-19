import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X, Coins, Star } from 'lucide-react';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  coins?: number;
  badge?: string;
  duration?: number;
  onClose?: () => void;
}

interface ErrorNotificationProps {
  notification: Notification;
  onClose: (id: string) => void;
}

const ErrorNotification: React.FC<ErrorNotificationProps> = ({ notification, onClose }) => {
  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBackgroundColor = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getTextColor = () => {
    switch (notification.type) {
      case 'success':
        return 'text-green-800';
      case 'error':
        return 'text-red-800';
      case 'warning':
        return 'text-yellow-800';
      case 'info':
      default:
        return 'text-blue-800';
    }
  };

  const getButtonColor = () => {
    switch (notification.type) {
      case 'success':
        return 'text-green-500 hover:text-green-700';
      case 'error':
        return 'text-red-500 hover:text-red-700';
      case 'warning':
        return 'text-yellow-500 hover:text-yellow-700';
      case 'info':
      default:
        return 'text-blue-500 hover:text-blue-700';
    }
  };

  return (
    <div className={`border rounded-lg p-4 shadow-lg ${getBackgroundColor()} transition-all duration-300 ease-in-out`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <h4 className={`text-sm font-medium ${getTextColor()}`}>
              {notification.title}
            </h4>
            {notification.coins && (
              <div className="flex items-center space-x-1 text-yellow-600">
                <Coins className="w-4 h-4" />
                <span className="font-bold text-xs">+{notification.coins}</span>
              </div>
            )}
          </div>
          <p className={`text-sm ${getTextColor()} opacity-90`}>
            {notification.message}
          </p>
          {notification.badge && (
            <div className="flex items-center space-x-1 mt-2">
              <Star className={`w-4 h-4 ${getTextColor()}`} />
              <span className={`text-xs ${getTextColor()}`}>獲得徽章: {notification.badge}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => onClose(notification.id)}
          className={`flex-shrink-0 transition-colors ${getButtonColor()}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

interface NotificationContainerProps {
  notifications: Notification[];
  onClose: (id: string) => void;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({ notifications, onClose }) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md w-full">
      {notifications.map((notification) => (
        <ErrorNotification
          key={notification.id}
          notification={notification}
          onClose={onClose}
        />
      ))}
    </div>
  );
};

export default ErrorNotification; 