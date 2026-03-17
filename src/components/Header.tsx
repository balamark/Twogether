import React, { useState, useEffect } from 'react';
import { User, LogOut, Heart, Bell, Send, Coins } from 'lucide-react';
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

  useEffect(() => {
    if (authState.isAuthenticated) {
      fetchUnreadCount();
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
    setUnreadNotificationCount(0);
    setTimeout(() => fetchUnreadCount(), 1000);
  };

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-rose-500 rounded-lg flex items-center justify-center">
              <Heart className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="font-display text-xl font-semibold text-stone-900 tracking-tight">
              Twogether
            </span>
            <span className="hidden sm:inline text-sm text-stone-400 font-body">圖在一起</span>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Intimacy Request Button */}
            {authState.isAuthenticated && authState.partnerConnected && (
              <button
                onClick={onShowIntimacyRequest}
                className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
                title="發送親密邀請"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">親密邀請</span>
              </button>
            )}

            {/* Notifications */}
            {authState.isAuthenticated && (
              <button
                onClick={handleNotificationClick}
                className="relative p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-full transition-colors"
                title="通知中心"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-xs w-4.5 h-4.5 min-w-[18px] min-h-[18px] rounded-full flex items-center justify-center leading-none px-1">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>
            )}

            {/* Coins */}
            {authState.isAuthenticated && (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-full text-sm font-medium">
                <Coins className="w-4 h-4" />
                <span>{totalCoins}</span>
              </div>
            )}

            {/* User Menu */}
            {authState.isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 hover:bg-stone-100 px-3 py-2 rounded-full transition-colors"
                >
                  <div className="w-7 h-7 bg-stone-800 rounded-full flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-medium text-stone-700 hidden sm:inline">
                    {authState.user?.nickname || '用戶'}
                  </span>
                </button>

                {/* Dropdown */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-modal border border-stone-200 z-50 animate-fade-in">
                    <div className="p-4 border-b border-stone-100">
                      <div className="text-sm font-semibold text-stone-900">
                        {authState.user?.nickname}
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        {authState.user?.email}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${authState.partnerConnected ? 'bg-sage-500' : 'bg-amber-400'}`} />
                        <span className={`text-xs ${authState.partnerConnected ? 'text-sage-600' : 'text-amber-600'}`}>
                          {authState.partnerConnected ? '已連接伴侶' : '等待伴侶連接'}
                        </span>
                      </div>
                    </div>
                    <div className="p-2">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>登出</span>
                      </button>
                    </div>
                  </div>
                )}

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
                className="bg-stone-900 hover:bg-stone-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
              >
                登入 / 註冊
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
