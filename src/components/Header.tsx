import React, { useState, useEffect } from 'react';
import { User, LogOut, Coins, Heart, Bell, Send } from 'lucide-react';
import { apiService } from '../services/api';

interface User {
  id: string;
  email: string;
  nickname: string;
  partnerId?: string;
  partnerCode?: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  partnerConnected: boolean;
}

interface HeaderProps {
  authState: AuthState;
  totalCoins: number;
  onShowAuthModal: () => void;
  onLogout: () => void;
  onShowIntimacyRequest: () => void;
  onShowNotifications: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  authState, 
  totalCoins, 
  onShowAuthModal, 
  onLogout,
  onShowIntimacyRequest,
  onShowNotifications,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // Fetch unread notification count only on login/refresh
  useEffect(() => {
    if (authState.isAuthenticated) {
      fetchUnreadCount();
      // No periodic refresh - only fetch on login/refresh to reduce server load
    }
  }, [authState.isAuthenticated]);

  const fetchUnreadCount = async function() {
    try {
      const count = await apiService.getUnreadNotificationCount();
      setUnreadNotificationCount(count);
    } catch (error) {
      console.error('Failed to fetch unread notification count:', error);
    }
  };

  const handleLogout = () => {
    onLogout();
    setShowUserMenu(false);
  };

  const handleNotificationClick = () => {
    onShowNotifications();
    setUnreadNotificationCount(0); // Reset count when opening notifications
    // Refresh count after opening notifications
    setTimeout(() => fetchUnreadCount(), 1000);
  };

  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Heart className="w-8 h-8 text-pink-500" />
              <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-purple-600">
                Twogether 圖在一起
              </h1>
            </div>
          </div>

          {/* Right Side - Actions, Coins and User */}
          <div className="flex items-center space-x-4">
            {/* Intimacy Request Button */}
            {authState.isAuthenticated && authState.partnerConnected && (
              <button
                onClick={onShowIntimacyRequest}
                className="flex items-center space-x-2 bg-gradient-to-r from-pink-500 to-red-500 text-white px-4 py-2 rounded-full hover:from-pink-600 hover:to-red-600 transition-colors"
                title="發送親密邀請"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">親密邀請</span>
              </button>
            )}

            {/* Notifications */}
            {authState.isAuthenticated && (
              <button
                onClick={handleNotificationClick}
                className="relative p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
                title="通知中心"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>
            )}

            {/* Coins Display */}
            {authState.isAuthenticated && (
              <div className="flex items-center space-x-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-3 py-2 rounded-full">
                <Coins className="w-4 h-4" />
                <span className="font-bold text-sm">{totalCoins}</span>
              </div>
            )}

            {/* User Section */}
            {authState.isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-full transition-colors"
                >
                  <User className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {authState.user?.nickname || '用戶'}
                  </span>
                </button>

                {/* User Dropdown */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-4 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-900">
                        {authState.user?.nickname}
                      </div>
                      <div className="text-xs text-gray-500">
                        {authState.user?.email}
                      </div>
                      {authState.partnerConnected ? (
                        <div className="mt-2 flex items-center space-x-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-xs text-green-600">已連接伴侶</span>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center space-x-1">
                          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                          <span className="text-xs text-orange-600">等待伴侶連接</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>登出</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Overlay to close dropdown */}
                {showUserMenu && (
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowUserMenu(false)}
                  />
                )}
              </div>
            ) : (
              <button
                onClick={onShowAuthModal}
                className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-4 py-2 rounded-full hover:from-pink-600 hover:to-purple-700 transition-colors text-sm font-medium"
              >
                登入 / 註冊
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header; 